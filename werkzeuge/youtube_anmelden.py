"""Einmalige Google-Anmeldung für das automatische Hochladen.
Öffnet den Browser, wartet auf „Zulassen“ und speichert die Zugangsdaten
direkt als verschlüsselte GitHub-Geheimnisse (nichts wird angezeigt oder als Datei abgelegt).

Aufruf: python -I werkzeuge/youtube_anmelden.py <client_secret.json>
"""
import http.server, json, secrets, subprocess, sys, threading, urllib.parse, urllib.request, webbrowser, hashlib, base64

REPO = 'nikoatonchev-debug/plush-physics-auto'
SCOPE = 'https://www.googleapis.com/auth/youtube.upload'

daten = json.load(open(sys.argv[1]))['installed']
cid, csec = daten['client_id'], daten['client_secret']
pruef = secrets.token_urlsafe(48)
herausf = base64.urlsafe_b64encode(hashlib.sha256(pruef.encode()).digest()).rstrip(b'=').decode()
zustand = secrets.token_urlsafe(16)
ergebnis = {}

class Antwort(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if q.get('state', [''])[0] == zustand and 'code' in q:
            ergebnis['code'] = q['code'][0]
            text = 'Fertig! Sie koennen dieses Fenster schliessen und zurueck zum Chat gehen.'
        else:
            ergebnis['fehler'] = q.get('error', ['unbekannt'])[0]
            text = 'Das hat nicht geklappt: ' + ergebnis['fehler']
        self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers()
        self.wfile.write(f'<h2 style="font-family:sans-serif">{text}</h2>'.encode())
    def log_message(self, *a): pass

server = http.server.HTTPServer(('127.0.0.1', 0), Antwort)
umleitung = f'http://127.0.0.1:{server.server_port}'
url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode({
    'client_id': cid, 'redirect_uri': umleitung, 'response_type': 'code', 'scope': SCOPE,
    'access_type': 'offline', 'prompt': 'consent', 'state': zustand,
    'code_challenge': herausf, 'code_challenge_method': 'S256'})
webbrowser.open(url)
print('Browser geoeffnet - bitte dort anmelden und zulassen.', flush=True)
while not ergebnis:
    server.handle_request()
if 'code' not in ergebnis:
    sys.exit('Abgebrochen: ' + ergebnis['fehler'])

antwort = json.load(urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', data=urllib.parse.urlencode({
    'code': ergebnis['code'], 'client_id': cid, 'client_secret': csec, 'redirect_uri': umleitung,
    'grant_type': 'authorization_code', 'code_verifier': pruef}).encode())))
if 'refresh_token' not in antwort:
    sys.exit('Google hat keinen dauerhaften Zugang geliefert.')
for name, wert in (('YT_CLIENT_ID', cid), ('YT_CLIENT_SECRET', csec), ('YT_REFRESH_TOKEN', antwort['refresh_token'])):
    subprocess.run(['gh', 'secret', 'set', name, '-R', REPO], input=wert.encode(), check=True, capture_output=True)
print('ERFOLG: Zugang gespeichert (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN).')
