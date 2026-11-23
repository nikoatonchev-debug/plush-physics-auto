// Video des Tages: Szene würfeln, aufnehmen, Titel/Beschreibung schreiben.
// Aufruf: node werkzeuge/taeglich.mjs [startwert]   (Standard: heutiges Datum, UTC)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { waehleVariante, texte } from '../lib/variante.js';

const WURZEL = path.resolve(import.meta.dirname, '..');
const startwert = process.argv[2] || new Date().toISOString().slice(0, 10);
const v = waehleVariante(startwert);
const schnell = process.env.SCHNELL !== '0';
const ziel = `video-${startwert}`;
console.log('Szene des Tages:', startwert, v.szene, v.material.name, v.hintergrund.name);

const r = spawnSync(process.execPath, [path.join(WURZEL, 'werkzeuge', 'aufnahme.mjs'), v.szene,
  '--abfrage', `seed=${encodeURIComponent(startwert)}${schnell ? '&schnell=1' : ''}`, '--ziel', ziel, '--eigenton'],
  { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);

const t = texte(v);
fs.writeFileSync(path.join(WURZEL, 'ausgabe', `${ziel}.json`), JSON.stringify({ startwert, variante: v, ...t }, null, 1));
console.log('Fertig:', path.join(WURZEL, 'ausgabe', `${ziel}.mp4`));
console.log('Titel:', t.titel);
