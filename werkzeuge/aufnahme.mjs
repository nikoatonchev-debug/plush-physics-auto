// Nimmt eine Szene Bild für Bild im Chrome auf und baut daraus ein MP4 mit Ton.
// Aufruf: node werkzeuge/aufnahme.mjs ring-steinturm [--bilder 30,60,90] [--bis 120]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { tonspur } from './ton.mjs';
import { tonspurPillen } from './ton_pillen.mjs';
import { tonspurKugel } from './ton_kugel.mjs';
import { tonspurPendel } from './ton_pendel.mjs';

const WURZEL = path.resolve(import.meta.dirname, '..');
const name = process.argv[2] || 'ring-steinturm';
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const einzel = arg('--bilder')?.split(',').map(Number);
const bis = arg('--bis') ? Number(arg('--bis')) : null;
const AUS = path.join(WURZEL, 'ausgabe'); fs.mkdirSync(AUS, { recursive: true });

const typen = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((q, a) => {
  const p = path.join(WURZEL, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(WURZEL) || !fs.existsSync(p)) { a.writeHead(404); return a.end(); }
  a.writeHead(200, { 'Content-Type': typen[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(a);
}).listen(0);
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PFAD || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('console', m => console.log('[seite]', m.text()));
page.on('pageerror', e => { console.error('[fehler]', e.message); process.exit(1); });
const abfrage = arg('--abfrage') || '';
await page.goto(`http://localhost:${port}/seiten/${name}.html${abfrage ? '?' + abfrage : ''}`);
await page.waitForFunction('window.BEREIT === true', { timeout: 600000 });
page.setDefaultTimeout(0);
const gesamt = bis ?? await page.evaluate('window.GESAMT');
const fps = await page.evaluate('window.FPS || 30');
const tonVorlage = await page.evaluate("window.TONVORLAGE || 'ring'");
const tonArt = await page.evaluate("window.TONART || ''");
const bildEreignisse = [];

const ziele = einzel ? new Set(einzel) : null;
const letzte = einzel ? Math.max(...einzel) : gesamt - 1;
let ff = null;
const stumm = path.join(AUS, `${name}-stumm.mp4`);
if (!einzel) {
  ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', stumm], { stdio: ['pipe', 'inherit', 'inherit'] });
}
const ereignisse = [];
const t0 = Date.now();
for (let f = 0; f <= letzte; f++) {
  const nurPhysik = !!ziele && !ziele.has(f);
  const r = await page.evaluate((i, n) => window.bild(i, n), f, nurPhysik);
  ereignisse.push({ f, aufprall: r.aufprall, kontakte: r.kontakte ?? 0, runde: r.runde, neu: r.neu });
  bildEreignisse.push(r.ereignisse || []);
  if (ziele?.has(f) || !ziele) {
    const buf = Buffer.from(r.jpg.split(',')[1], 'base64');
    if (ziele) fs.writeFileSync(path.join(AUS, `${name}-bild${f}.jpg`), buf);
    else if (!ff.stdin.write(buf)) await new Promise(ok => ff.stdin.once('drain', ok));
  }
  if (f % 30 === 0) process.stdout.write(`\rBild ${f}/${letzte} (${((Date.now() - t0) / 1000).toFixed(0)} s)   `);
}
console.log();
await browser.close(); server.close();
const ereignisDatei = path.join(AUS, `${name}-ereignisse.json`);
fs.writeFileSync(ereignisDatei, JSON.stringify({ fps, ereignisse, bildEreignisse }));
if (ff) {
  ff.stdin.end();
  await new Promise(ok => ff.on('close', ok));
  const wav = path.join(AUS, `${name}.wav`);
  // Ton: Geräusche aus den Vorlagen (Nutzerwunsch); --eigenton nimmt die selbst erzeugte Tonspur
  if (tonArt === 'pillen') tonspurPillen(bildEreignisse, wav, fps);
  else if (tonArt === 'kugel') tonspurKugel(bildEreignisse, wav, fps);
  else if (tonArt === 'pendel') tonspurPendel(bildEreignisse, wav, fps);
  else if (process.argv.includes('--eigenton') || !fs.existsSync(path.join(WURZEL, 'werkzeuge', 'ton_vorlage.py'))) tonspur(ereignisse, wav, name, fps);
  else await new Promise((ok, nein) => spawn('python', ['-I', path.join(WURZEL, 'werkzeuge', 'ton_vorlage.py'), ereignisDatei, wav, tonVorlage], { stdio: 'inherit' }).on('close', c => c ? nein(new Error('Ton fehlgeschlagen')) : ok()));
  const fertig = path.join(AUS, (arg('--ziel') || name) + '.mp4');
  await new Promise(ok => spawn('ffmpeg', ['-y', '-v', 'error', '-i', stumm, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', fertig], { stdio: 'inherit' }).on('close', ok));
  fs.unlinkSync(stumm);
  console.log('Fertig:', fertig);
}
