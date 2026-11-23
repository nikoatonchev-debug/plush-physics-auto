// Lädt ein fertiges Video auf YouTube hoch (offizielle YouTube Data API v3).
// Zugang kommt aus den GitHub-Geheimnissen YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.
// Aufruf: node werkzeuge/youtube.mjs ausgabe/video-2026-11-24.mp4 [privat|oeffentlich]
import fs from 'node:fs';

const [datei, sicht = 'privat'] = process.argv.slice(2);
const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
  console.log('Kein YouTube-Zugang hinterlegt – Hochladen übersprungen.');
  process.exit(0);
}
const meta = JSON.parse(fs.readFileSync(datei.replace(/\.mp4$/, '.json'), 'utf8'));

// 1) frischen Zugangsschlüssel holen
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET, refresh_token: YT_REFRESH_TOKEN, grant_type: 'refresh_token' }),
})).json();
if (!tok.access_token) { console.error('Anmeldung bei Google fehlgeschlagen:', tok.error, tok.error_description); process.exit(1); }

// 2) Hochladen vorbereiten (fortsetzbares Hochladen)
const groesse = fs.statSync(datei).size;
const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
  method: 'POST',
  headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(groesse) },
  body: JSON.stringify({
    snippet: { title: meta.titel.slice(0, 100), description: meta.beschreibung, tags: meta.tags, categoryId: '24' },
    status: { privacyStatus: sicht === 'oeffentlich' ? 'public' : 'private', selfDeclaredMadeForKids: false },
  }),
});
const ziel = start.headers.get('location');
if (!ziel) { console.error('YouTube hat das Hochladen abgelehnt:', start.status, await start.text()); process.exit(1); }

// 3) Video senden
const fertig = await fetch(ziel, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(groesse) }, body: fs.readFileSync(datei) });
const v = await fertig.json();
if (!v.id) { console.error('Hochladen fehlgeschlagen:', fertig.status, JSON.stringify(v)); process.exit(1); }
console.log(`Hochgeladen: https://youtube.com/shorts/${v.id}  (Sichtbarkeit: ${v.status?.privacyStatus})`);
