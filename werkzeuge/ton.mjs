// Ton ohne fremde Dateien: Aufprallgeräusche werden aus den Physik-Ereignissen berechnet.
// Wie in den Vorlagen: keine Musik, nur ein leiser Klick bei jeder neuen Runde
// und Aufprallgeräusche (hart = metallisches Klirren, weich = dumpfes Plopp).
import fs from 'node:fs';

const RATE = 48000;

function rauschen(seed) { let s = seed >>> 0; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; }; }

export function tonspur(ereignisse, datei, name, FPS = 30) {
  const dauer = ereignisse.length / FPS + 1.5;
  const L = new Float32Array(Math.ceil(dauer * RATE));
  const R = new Float32Array(L.length);
  const stufen = [0, 0.25, 0.5, 0.75, 1];
  let zuletzt = -99;
  let rn = rauschen(7);

  const legeAuf = (t, fn, len, pan = 0) => {
    const s0 = Math.floor(t * RATE), n = Math.floor(len * RATE);
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < n && s0 + i < L.length; i++) { const v = fn(i / RATE); L[s0 + i] += v * gl; R[s0 + i] += v * gr; }
  };

  for (const e of ereignisse) {
    const t = e.f / FPS;
    const weich = stufen[e.runde] ?? 0;
    if (e.neu) {
      // kurzer, leiser „Tick“ beim Rundenwechsel
      legeAuf(t + 0.02, s => Math.sin(2 * Math.PI * 1850 * s) * Math.exp(-s * 140) * 0.18, 0.06);
      zuletzt = -99;
    }
    const a = e.aufprall;
    if (a > 0.6 && e.f - zuletzt > 4) {
      zuletzt = e.f;
      const laut = Math.min(1, a / 5) ** 0.8;
      const hart = 1 - weich;
      // dumpfer Körper des Aufpralls
      const tief = 90 + 70 * hart;
      legeAuf(t, s => Math.sin(2 * Math.PI * tief * s * (1 - s * 2)) * Math.exp(-s * (18 + 30 * hart)) * 0.55 * laut, 0.35);
      // kurzer Rauschanteil (Kontakt)
      legeAuf(t, s => rn() * Math.exp(-s * (90 - 50 * weich)) * 0.22 * laut, 0.12);
      // metallisches Klingen nur bei harten Ringen
      if (hart > 0.3) {
        const teile = [[1210, 1], [2870, 0.6], [4130, 0.35], [6020, 0.2]];
        legeAuf(t, s => teile.reduce((acc, [fq, g]) => acc + Math.sin(2 * Math.PI * fq * s) * g * Math.exp(-s * (5 + fq / 900)), 0) * 0.13 * laut * hart, 1.4, 0.15);
      }
      // weiches „Schmatzen“ bei weichen Ringen
      if (weich > 0.3) {
        legeAuf(t, s => Math.sin(2 * Math.PI * (260 - 500 * s) * s) * Math.exp(-s * 22) * 0.25 * laut * weich, 0.25);
      }
    }
  }
  // Spitzen begrenzen und als 16-bit-WAV schreiben
  let max = 0; for (let i = 0; i < L.length; i++) max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  const g = max > 0.89 ? 0.89 / max : 1;
  const buf = Buffer.alloc(44 + L.length * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + L.length * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(L.length * 4, 40);
  for (let i = 0; i < L.length; i++) {
    buf.writeInt16LE(Math.round(Math.tanh(L[i] * g) * 32000), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.tanh(R[i] * g) * 32000), 46 + i * 4);
  }
  fs.writeFileSync(datei, buf);
}
