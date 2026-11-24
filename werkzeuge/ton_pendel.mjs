// Ton für „Steinpendel gegen Klötzchen-Würfel“ – nach dem Vorbild der Holzwürfel-Videos:
// Stille, beim Aufprall EIN Schlag (je schwerer, desto tiefer und wuchtiger), dann dichtes,
// trockenes Klappern der einzelnen Klötzchen, das mit dem Herumfliegen abklingt. Keine Musik.
import fs from 'node:fs';

const RATE = 48000;
function zufall(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function anregung(dauer, rausch, z) {
  const n = Math.max(2, Math.round(dauer * RATE)), a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.sin(Math.PI * i / n) * (1 - rausch + rausch * (z() * 2 - 1));
  return a;
}
function moden(x, modes, laenge) {
  const out = new Float32Array(Math.round(laenge * RATE));
  for (const [f, abkl, g] of modes) {
    if (f >= RATE / 2.2) continue;
    const R = Math.exp(-1 / (abkl * RATE)), w = 2 * Math.PI * f / RATE;
    const a1 = 2 * R * Math.cos(w), a2 = -R * R, nm = (1 - R * R) * g;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < out.length; i++) { const y = (i < x.length ? x[i] : 0) * nm + a1 * y1 + a2 * y2; out[i] += y; y2 = y1; y1 = y; }
  }
  return out;
}
function bandRausch(len, f, q, z, huelle) {
  const n = Math.round(len * RATE), out = new Float32Array(n);
  const R = Math.exp(-Math.PI * (f / q) / RATE), w = 2 * Math.PI * f / RATE, a1 = 2 * R * Math.cos(w), a2 = -R * R;
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) { const y = (z() * 2 - 1) * (1 - R) + a1 * y1 + a2 * y2; y2 = y1; y1 = y; out[i] = y * huelle(i / RATE); }
  return out;
}
function norm(sig) { let m = 0; for (const v of sig) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < sig.length; i++) sig[i] /= m; return sig; }

export function tonspurPendel(bilder, datei, FPS = 60, TAKT = 4) {
  const dauer = bilder.length / FPS + 1.0;
  const L = new Float32Array(Math.ceil(dauer * RATE)), R = new Float32Array(L.length);
  const z = zufall(4711);
  const um = (a, b) => a + (b - a) * z();
  const lege = (t, sig, laut, pan, ende) => {
    const s0 = Math.round(t * RATE), sEnde = Math.round(ende * RATE);
    const p = Math.max(-0.7, Math.min(0.7, pan));
    const gl = Math.cos((p + 1) * Math.PI / 4), gr = Math.sin((p + 1) * Math.PI / 4);
    const blende = Math.round(0.03 * RATE);
    for (let i = 0; i < sig.length && s0 + i < L.length; i++) {
      const j = s0 + i; if (j >= sEnde) break;
      const f = sEnde - j < blende ? (sEnde - j) / blende : 1;
      L[j] += sig[i] * laut * gl * f; R[j] += sig[i] * laut * gr * f;
    }
  };
  const gewicht = kg => Math.max(0, Math.min(1, Math.log10(kg * 10) / 3));   // 0,1 kg -> 0 … 100 kg -> 1

  // ---- Aufprall des Steinpendels: je schwerer, desto tiefer, länger und mit Bass-Wumms ----
  function schlag(kg, tempo) {
    const w = gewicht(kg);
    const x = anregung(0.0006 + 0.0035 * w, 0.2, z);
    const f1 = 700 - 520 * w;
    const stein = moden(x, [[f1 * um(0.97, 1.03), 0.03 + 0.1 * w, 1.6], [f1 * 2.27, 0.02 + 0.05 * w, 1], [f1 * 3.9, 0.012 + 0.02 * w, 0.6], [um(1700, 2000), 0.015, 0.7]], 0.9);
    norm(stein);
    const krach = bandRausch(0.09 + 0.08 * w, 2600 - 900 * w, 1.3, z, t => (1 - Math.exp(-t * 2500)) * Math.exp(-t * (60 - 30 * w)));
    norm(krach);
    let bass = null;
    if (w > 0.3) { bass = moden(anregung(0.006, 0, z), [[um(52, 60), 0.16 * w, 1], [um(95, 110), 0.08, 0.6]], 0.9); norm(bass); }
    const s = new Float32Array(stein.length);
    for (let i = 0; i < s.length; i++) s[i] = stein[i] * 0.8 + (krach[i] || 0) * (0.25 + 0.4 * w) + (bass ? bass[i] * 0.9 * (w - 0.3) / 0.7 : 0);
    const laut = (0.3 + 0.7 * w) * Math.min(1, tempo / 2.5);
    return [s, laut];
  }
  // ---- ein Klötzchen bricht heraus: kurzes trockenes Knacken ----
  function knack() {
    const x = anregung(0.00025, 0.5, z);
    const f = um(1100, 1700);
    const s = moden(x, [[f, 0.012, 1], [f * um(2.3, 2.6), 0.007, 0.6], [um(3800, 4800), 0.004, 0.5]], 0.06);
    norm(s);
    const r = bandRausch(0.02, um(2500, 3500), 1.6, z, t => Math.exp(-t * 300));
    norm(r);
    for (let i = 0; i < s.length; i++) s[i] = s[i] * 0.8 + (r[i] || 0) * 0.45;
    return s;
  }
  // ---- Klötzchen trifft Klötzchen oder Boden: helles, kurzes „Tick“ wie kleine Holzwürfel ----
  function tick(staerke) {
    const x = anregung(0.0002 + 0.0003 * z(), 0.3, z);
    const f = um(1900, 4200);
    const s = moden(x, [[f, um(0.01, 0.022), 1], [f * um(2.6, 2.9), 0.006, 0.5], [um(500, 800), 0.01, 0.4 * staerke]], 0.06);
    return norm(s);
  }

  // Bank vorab erzeugen (spart Zeit, klingt trotzdem abwechslungsreich)
  const knackBank = Array.from({ length: 40 }, knack);
  const tickBank = Array.from({ length: 60 }, () => tick(z()));
  let letzteRamme = -9;
  // erster Pendelschlag je Stufe: Schutt, der lange danach im Tunnel zittert, klappert nicht mehr
  const ersterSchlag = {};
  bilder.forEach((liste, f) => { for (const e of liste || []) if (e.art === 'ramme' && e.tempo >= 0.5 && ersterSchlag[e.runde] === undefined) ersterSchlag[e.runde] = f / FPS; });
  const imWuerfel = p => p[0] < -0.03 && p[0] > -0.55 && p[1] > 0.04 && p[1] < 0.54 && Math.abs(p[2]) < 0.27;
  bilder.forEach((liste, f) => {
    const t0 = Math.max(0, (f - 0.5) / FPS);
    for (const e of liste || []) {
      if (!e.sichtbar && e.art !== 'ramme') continue;
      const ende = ((e.runde ?? Math.floor(f / (FPS * TAKT))) + 1) * TAKT;
      const pan = (e.pan ?? 0) * 0.6;
      const w = gewicht(e.kg);
      if (e.art === 'ramme') {
        if (e.tempo < 0.5 || t0 - letzteRamme < 0.35) continue;   // nur echte Schläge
        letzteRamme = t0;
        const [s, laut] = schlag(e.kg, e.tempo);
        lege(t0, s, laut, pan, ende);
      } else if (e.art === 'bruch') {
        const n = Math.min(e.n, 24);
        for (let k = 0; k < n; k++) lege(t0 + z() / FPS * 1.5, knackBank[Math.floor(z() * knackBank.length)], um(0.12, 0.22) * (0.6 + 0.4 * w) / Math.sqrt(1 + n / 8), pan + um(-0.2, 0.2), ende);
      } else if (e.art === 'klapper') {
        if (imWuerfel(e.pos) && e.n <= 4 && t0 > (ersterSchlag[e.runde] ?? 0) + 1.0) continue;
        const n = Math.min(e.n, 20), st = Math.min(1, e.tempo / 2.5);
        // Nachklappern klingt natürlich aus (kein endloses Rieseln bis zum Schnitt)
        const nach = t0 - (ersterSchlag[e.runde] ?? 0) - 1.2, aus = nach > 0 ? Math.exp(-nach / 0.7) : 1;
        if (aus < 0.03) continue;
        for (let k = 0; k < n; k++) lege(t0 + z() / FPS, tickBank[Math.floor(z() * tickBank.length)], um(0.05, 0.13) * (0.4 + 0.6 * st) * aus / Math.sqrt(1 + n / 6), pan + um(-0.3, 0.3), ende);
      }
    }
  });

  // ---- Raumhall wie bei den anderen Videos (kurzer, heller Raum) ----
  const hallLen = Math.round(0.6 * RATE), vor = Math.round(0.008 * RATE);
  const irs = [new Float32Array(hallLen), new Float32Array(hallLen)];
  for (const ir of irs) { let a = 0; for (let i = vor; i < hallLen; i++) { const t = (i - vor) / RATE, fc = 7000 * Math.exp(-t * 4) + 900, k = 1 - Math.exp(-2 * Math.PI * fc / RATE); a += ((z() * 2 - 1) - a) * k; ir[i] = a * Math.exp(-t * 10); } }
  const D = 4, kl = new Float32Array(Math.ceil(L.length / D));
  for (let i = 0; i < kl.length; i++) kl[i] = (L[i * D] + R[i * D]) / 2;
  const falte = ir => { const irK = new Float32Array(Math.ceil(ir.length / D)); for (let i = 0; i < irK.length; i++) irK[i] = ir[i * D]; const out = new Float32Array(kl.length + irK.length); for (let i = 0; i < kl.length; i++) { const v = kl[i]; if (Math.abs(v) < 1e-4) continue; for (let k = 0; k < irK.length; k++) out[i + k] += v * irK[k]; } return out; };
  const hl = falte(irs[0]), hr = falte(irs[1]);
  let mh = 0; for (let i = 0; i < hl.length; i++) mh = Math.max(mh, Math.abs(hl[i]), Math.abs(hr[i]));
  let md = 0; for (let i = 0; i < L.length; i++) md = Math.max(md, Math.abs(L[i]), Math.abs(R[i]));
  const hg = mh > 0 ? md / mh * 0.1 * 2.2 : 0;
  for (let i = 0; i < L.length; i++) { const j = i / D, j0 = Math.floor(j), u = j - j0; L[i] += ((hl[j0] || 0) * (1 - u) + (hl[j0 + 1] || 0) * u) * hg; R[i] += ((hr[j0] || 0) * (1 - u) + (hr[j0 + 1] || 0) * u) * hg; }
  for (const ch of [L, R]) { let a = 0; const k = 1 - Math.exp(-2 * Math.PI * 30 / RATE); for (let i = 0; i < ch.length; i++) { a += (ch[i] - a) * k; ch[i] -= a; } }
  let max = 0; for (let i = 0; i < L.length; i++) max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  const g = max > 0 ? 0.89 / max : 1;
  const buf = Buffer.alloc(44 + L.length * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + L.length * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(L.length * 4, 40);
  for (let i = 0; i < L.length; i++) {
    buf.writeInt16LE(Math.round(Math.tanh(L[i] * g * 1.1) * 31000), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.tanh(R[i] * g * 1.1) * 31000), 46 + i * 4);
  }
  fs.writeFileSync(datei, buf);
}
