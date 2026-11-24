// Ton für die Pillen-Szene: jedes Geräusch entsteht genau im Bild, in dem es passiert,
// und klingt jedes Mal ein bisschen anders. Unsichtbare Ereignisse bleiben stumm.
// Hart auf Glas = helles Klirren, weich auf Glas = dumpfes Tunk + Schmatzen,
// Hügel = Porzellan-Tock, Rollen = leises Rauschen, Pille auf Pille = Tick / Plopp.
import fs from 'node:fs';

const RATE = 48000;

function zufall(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// einfacher Tiefpass (zweipolig), Grenzfrequenz darf sich ändern
function tiefpass() {
  let a = 0, b = 0;
  return (x, fc) => { const k = 1 - Math.exp(-2 * Math.PI * Math.min(fc, 18000) / RATE); a += (x - a) * k; b += (a - b) * k; return b; };
}

export function tonspurPillen(bilder, datei, FPS = 30) {
  const dauer = bilder.length / FPS + 1.5;
  const L = new Float32Array(Math.ceil(dauer * RATE)), R = new Float32Array(L.length);
  const z = zufall(4242);
  const um = (a, b) => a + (b - a) * z();

  const lege = (t, len, pan, fn) => {
    const s0 = Math.max(0, Math.floor(t * RATE)), n = Math.floor(len * RATE);
    const p = Math.max(-0.8, Math.min(0.8, pan));
    const gl = Math.cos((p + 1) * Math.PI / 4), gr = Math.sin((p + 1) * Math.PI / 4);
    for (let i = 0; i < n && s0 + i < L.length; i++) { const v = fn(i / RATE, i); L[s0 + i] += v * gl; R[s0 + i] += v * gr; }
  };
  const rausch = () => z() * 2 - 1;

  // ---- einzelne Geräusche ----
  function glasKlirren(t, laut, pan, hell) {
    const f0 = um(1750, 2450) * (0.9 + 0.2 * hell);
    const teile = [[1, 1], [um(2.25, 2.4), um(0.45, 0.7)], [um(4.0, 4.4), um(0.25, 0.4)], [um(6.4, 6.9), um(0.12, 0.22)]];
    const abkl = um(5, 8);
    lege(t, 1.6, pan, s => teile.reduce((acc, [r, g]) => acc + Math.sin(2 * Math.PI * f0 * r * s + r) * g * Math.exp(-s * abkl * (0.6 + r * 0.35)), 0) * 0.16 * laut * hell);
    const tp = tiefpass();
    lege(t, 0.02, pan, s => tp(rausch(), 9000) * Math.exp(-s * 300) * 0.5 * laut);   // harter Anschlag
  }
  function glasTunk(t, laut, pan, weich) {
    const f = um(520, 760);
    lege(t, 0.3, pan, s => Math.sin(2 * Math.PI * f * s) * Math.exp(-s * (28 + 30 * weich)) * 0.22 * laut * (1 - 0.6 * weich));
  }
  function porzellanTock(t, laut, pan) {
    const f = um(820, 1250), f2 = f * um(2.6, 2.9);
    lege(t, 0.18, pan, s => (Math.sin(2 * Math.PI * f * s) + 0.4 * Math.sin(2 * Math.PI * f2 * s)) * Math.exp(-s * um(38, 55)) * 0.22 * laut);
    const tp = tiefpass();
    lege(t, 0.03, pan, s => tp(rausch(), 5000) * Math.exp(-s * 220) * 0.4 * laut);
  }
  function schmatzen(t, laut, pan, weich) {
    // dumpfer Körper mit fallender Tonhöhe + feuchtes Rauschen + kleine Bläschen bei sehr weich
    const f0 = um(150, 210) * (1.2 - 0.4 * weich), dauerS = 0.12 + 0.2 * weich;
    let ph = 0;
    lege(t, dauerS + 0.15, pan, s => { ph += 2 * Math.PI * f0 * (1 - 0.5 * Math.min(1, s / dauerS)) / RATE; return Math.sin(ph) * Math.exp(-s * (16 - 8 * weich)) * 0.45 * laut; });
    const tp = tiefpass();
    lege(t, dauerS + 0.1, pan, s => tp(rausch(), 2600 * Math.exp(-s * 9) + 250) * Math.min(1, s * 300) * Math.exp(-s * (14 - 6 * weich)) * 0.9 * laut * (0.4 + weich));
    const blasen = Math.round(weich * um(2, 5));
    for (let k = 0; k < blasen; k++) {
      const tb = t + um(0.02, dauerS + 0.05), fb = um(380, 900);
      lege(tb, 0.05, pan, s => Math.sin(2 * Math.PI * fb * (1 + 3 * s) * s) * Math.exp(-s * 90) * 0.12 * laut);
    }
  }
  function goldTick(t, laut, pan) {
    const f = um(2900, 3600);
    lege(t, 0.25, pan, s => (Math.sin(2 * Math.PI * f * s) + 0.5 * Math.sin(2 * Math.PI * f * 1.73 * s)) * Math.exp(-s * 30) * 0.1 * laut);
  }

  // ---- Ereignisse durchgehen ----
  const letzter = new Map();          // Pille -> Zeit des letzten Stoß-Geräuschs
  const zuletztBeruehrt = new Map();  // Pille -> letztes Bild mit Berührung (Rollen/Stoß)
  const vorFlug = new Map();          // Pille -> war sie direkt davor in der Luft?
  bilder.forEach((liste, f) => {
    for (const e of liste || []) {
      if (e.art === 'stoss' && e.ort !== 'pille') { if (!vorFlug.has(`${e.pille}-${f}`)) vorFlug.set(`${e.pille}-${f}`, f - (zuletztBeruehrt.get(e.pille) ?? -99) > 3); }
    }
    for (const e of liste || []) if (e.art === 'rollen' || (e.art === 'stoss' && e.ort !== 'pille')) zuletztBeruehrt.set(e.pille, f);
  });
  const roll = new Map();             // Pille -> Liste [bild, tempo]
  bilder.forEach((liste, f) => {
    for (const e of liste || []) {
      if (!e.sichtbar) continue;
      const t = Math.max(0, (f - 0.5) / FPS);
      const pan = (e.pan ?? 0) * 0.6;
      const weich = e.stufe / 100;
      if (e.art === 'rollen') { if (!roll.has(e.pille)) roll.set(e.pille, []); roll.get(e.pille).push([f, e.tempo, pan, weich]); continue; }
      if (e.art !== 'stoss') continue;
      const schl = `${e.pille}-${e.ort}`;
      const ausLuft = vorFlug.get(`${e.pille}-${f}`) ?? false;
      // Rollen/Rutschen erzeugt laufend kleine Berührungen: die klingen nur über das Rollgeräusch.
      if (e.ort !== 'pille' && !ausLuft && e.staerke < 2.0) continue;
      if (e.ort === 'pille' && e.staerke < 1.0) continue;
      const pause = weich > 0.4 ? 0.3 : 0.1;
      if (t - (letzter.get(schl) ?? -9) < pause) continue;
      letzter.set(schl, t);
      const laut = Math.min(1, (e.staerke / 2.5)) ** 0.7 * (ausLuft || e.ort === 'pille' ? 1 : 0.6);
      if (laut < 0.12) continue;
      if (e.ort === 'glas') {
        if (weich < 0.3) glasKlirren(t, laut, pan, 1 - weich * 1.5);
        else { glasTunk(t, laut, pan, weich); schmatzen(t, laut * 0.9, pan, weich); }
      } else if (e.ort === 'pille') {
        if (weich < 0.3) goldTick(t, laut, pan); else schmatzen(t, laut * 0.7, pan, weich);
      } else {
        if (weich < 0.3) porzellanTock(t, laut, pan); else schmatzen(t, laut * 0.8, pan, weich);
      }
    }
  });
  // Rollen: weiches Rauschen, Lautstärke folgt dem Tempo, Bild für Bild sanft übergeblendet
  for (const [, punkte] of roll) {
    const tp = tiefpass();
    const weich = punkte[0][3];
    for (let k = 0; k < punkte.length; k++) {
      const [f, tempo, pan] = punkte[k];
      const naechst = punkte[k + 1] && punkte[k + 1][0] === f + 1 ? punkte[k + 1][1] : 0;
      const vorher = punkte[k - 1] && punkte[k - 1][0] === f - 1;
      const t = f / FPS, len = 1 / FPS;
      const a0 = vorher ? tempo : 0, a1 = naechst;
      lege(t, len, pan, s => {
        const u = s / len, tv = a0 + (a1 - a0) * u;
        const fc = 180 + 260 * tv * (1 - 0.5 * weich);
        return tp(rausch(), fc) * Math.min(1, tv / 2.5) * (0.5 - 0.2 * weich);
      });
    }
  }
  // ganz leichter Raumklang (zwei frühe Reflexionen)
  for (const [d, g] of [[0.023, 0.18], [0.041, 0.12]]) {
    const o = Math.floor(d * RATE);
    for (let i = L.length - 1; i >= o; i--) { L[i] += R[i - o] * g; R[i] += L[i - o] * g; }
  }
  let max = 0; for (let i = 0; i < L.length; i++) max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  const g = max > 0 ? 0.85 / max : 1;
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
