// Ton neu bauen ohne neu zu filmen: node werkzeuge/ton_neu.mjs kugel-loch [ziel]
import path from 'node:path'; import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
import { tonspurKugel } from './ton_kugel.mjs';
const W = path.resolve(import.meta.dirname, '..', 'ausgabe'), name = process.argv[2] || 'kugel-loch', ziel = process.argv[3] || name;
const d = JSON.parse(fs.readFileSync(path.join(W, `${name}-ereignisse.json`), 'utf8'));
const wav = path.join(W, `${ziel}.wav`);
tonspurKugel(d.bildEreignisse, wav, d.fps);
const mp4 = path.join(W, `${ziel}.mp4`), tmp = path.join(W, `${ziel}-tmp.mp4`);
spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', mp4, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', tmp], { stdio: 'inherit' });
fs.renameSync(tmp, mp4); console.log('Ton erneuert:', mp4);
