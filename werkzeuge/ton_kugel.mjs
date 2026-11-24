// Ton für „Kugel durchs Loch“ – gebaut nach dem Vorbild der erfolgreichen TikTok-Videos:
// Stille, und nur bei echten Ereignissen EIN sauberer, satter Klang mit etwas Raumhall.
// Physikalisch gedacht: Ein Stoß regt Eigenschwingungen (Resonatoren) an. Je weicher der
// Körper, desto länger dauert die Berührung – dadurch wird der Klang von selbst dumpfer.
import fs from 'node:fs';

const RATE = 48000;

function zufall(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Anregung: Halbsinus-Kraftstoß der Dauer `dauer` (Hertz-Kontakt), dazu etwas Rauschen
function anregung(dauer, rauschAnteil, z) {
  const n = Math.max(2, Math.round(dauer * RATE));
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.sin(Math.PI * i / n) * (1 - rauschAnteil + rauschAnteil * (z() * 2 - 1));
  return a;
}
// Resonatorbank: jede Mode = gedämpfte Schwingung (zweipoliger Resonator), angeregt von x
function moden(x, modes, laenge) {
  const out = new Float32Array(Math.round(laenge * RATE));
  for (const [f, abkl, g] of modes) {
    if (f >= RATE / 2.2) continue;
    const R = Math.exp(-1 / (abkl * RATE)), w = 2 * Math.PI * f / RATE;
    const a1 = 2 * R * Math.cos(w), a2 = -R * R, norm = (1 - R * R) * g;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < out.length; i++) {
      const y = (i < x.length ? x[i] : 0) * norm + a1 * y1 + a2 * y2;
      out[i] += y; y2 = y1; y1 = y;
    }
  }
  return out;
}
function tiefpass(sig, fc) {
  const k = 1 - Math.exp(-2 * Math.PI * fc / RATE); let a = 0, b = 0;
  for (let i = 0; i < sig.length; i++) { a += (sig[i] - a) * k; b += (a - b) * k; sig[i] = b; }
  return sig;
}
function bandRausch(len, f, q, z, huelle) {
  // Rauschen durch einen Resonator mit Hüllkurve
  const n = Math.round(len * RATE), out = new Float32Array(n);
  const R = Math.exp(-Math.PI * (f / q) / RATE), w = 2 * Math.PI * f / RATE, a1 = 2 * R * Math.cos(w), a2 = -R * R;
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) { const y = (z() * 2 - 1) * (1 - R) + a1 * y1 + a2 * y2; y2 = y1; y1 = y; out[i] = y * huelle(i / RATE); }
  return out;
}
function norm(sig) { let m = 0; for (const v of sig) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < sig.length; i++) sig[i] /= m; return sig; }

export function tonspurKugel(bilder, datei, FPS = 60, TAKT = 4) {
  const dauer = bilder.length / FPS + 1.0;
  const L = new Float32Array(Math.ceil(dauer * RATE)), R = new Float32Array(L.length);
  const z = zufall(7319);
  const um = (a, b) => a + (b - a) * z();

  // Klang einlegen; endet spätestens am Schnitt zur nächsten Stufe (kurz ausgeblendet)
  const lege = (t, sig, laut, pan, ende) => {
    const s0 = Math.round(t * RATE), sEnde = Math.round(ende * RATE);
    const p = Math.max(-0.6, Math.min(0.6, pan));
    const gl = Math.cos((p + 1) * Math.PI / 4), gr = Math.sin((p + 1) * Math.PI / 4);
    const blende = Math.round(0.03 * RATE);
    for (let i = 0; i < sig.length && s0 + i < L.length; i++) {
      const j = s0 + i; if (j >= sEnde) break;
      const f = sEnde - j < blende ? (sEnde - j) / blende : 1;
      L[j] += sig[i] * laut * gl * f; R[j] += sig[i] * laut * gr * f;
    }
  };

  // ---- die einzelnen Klänge ----
  // harte Goldkugel auf Beton: kurzer heller Klack + metallisches Nachklingen der Kugel + Betonkörper
  function klack(staerke) {
    const x = anregung(um(0.00025, 0.0004), 0.3, z);
    const f0 = um(3150, 3500);
    const kugel = moden(x, [[f0, 0.55, 1], [f0 * 1.53, 0.35, 0.6], [f0 * 2.12, 0.22, 0.45], [f0 * 2.71, 0.14, 0.3], [f0 * 3.34, 0.09, 0.2]], 1.6);
    const beton = moden(x, [[um(170, 210), 0.045, 2.2], [um(430, 520), 0.03, 1.6], [um(950, 1150), 0.018, 1.2], [um(2300, 2800), 0.008, 0.9]], 0.25);
    const klick = bandRausch(0.012, 5500, 1.2, z, t => Math.exp(-t * 900));
    norm(kugel); norm(beton); norm(klick);
    const g = Math.min(1, staerke / 2.6) ** 0.8;
    const s = new Float32Array(kugel.length);
    for (let i = 0; i < s.length; i++) s[i] = (kugel[i] * 0.42 + (beton[i] || 0) * 0.85 + (klick[i] || 0) * 0.5) * g;
    return s;
  }
  // weiche Kugel trifft Beton: je weicher, desto längere Berührung -> dumpfer, dazu ein feuchtes „Plätsch“
  function patsch(staerke, weich, boden) {
    const kontakt = 0.004 + 0.016 * weich;
    const x = anregung(kontakt, 0.15, z);
    const koerper = moden(x, [[um(95, 120) * (boden ? 0.85 : 1), 0.06 + 0.05 * weich, 2.5], [um(230, 280), 0.035, 1.4], [um(600, 700) * (1 - 0.3 * weich), 0.02, 0.8]], 0.5);
    norm(koerper);
    const nass = bandRausch(0.12, um(1300, 1700) * (1 - 0.3 * weich), 2.2, z, t => (1 - Math.exp(-t * 600)) * Math.exp(-t * (55 - 25 * weich)));
    norm(nass);
    const kl = null;   // weiche Kugel: nie das metallische „Ding“ der harten Kugel dazumischen
    const g = Math.min(1, staerke / 3.5) ** 0.7;
    const s = new Float32Array(Math.max(koerper.length, kl ? kl.length : 0));
    for (let i = 0; i < s.length; i++) s[i] = ((koerper[i] || 0) * 0.95 + (nass[i] || 0) * (0.18 + 0.4 * weich) + (kl ? kl[i] * 0.4 : 0)) * g;
    return s;
  }
  // Durchflutschen: kurzer Saug-Plopp, Tonhöhe steigt
  function plopp(weich) {
    const len = 0.11, n = Math.round(len * RATE), s = new Float32Array(n);
    const f1 = um(170, 220), f2 = f1 * um(2.4, 2.9); let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE, u = Math.min(1, t / 0.035);
      ph += 2 * Math.PI * (f1 + (f2 - f1) * u * u) / RATE;
      s[i] = Math.sin(ph) * Math.min(1, t * 900) * Math.exp(-t * 38);
    }
    const luft = bandRausch(len, 900, 1.5, z, t => Math.min(1, t * 400) * Math.exp(-t * 60));
    norm(luft);
    for (let i = 0; i < n; i++) s[i] = s[i] * 0.8 + luft[i] * 0.25 * weich;
    return s;
  }
  // Quetschen: gummiartiges Knarzen (Haft-Gleit-Reibung) – leise, folgt dem Tempo
  function knarz(dauerS, tempo) {
    const n = Math.round(dauerS * RATE), x = new Float32Array(n);
    let t = 0;
    while (t < dauerS) { const i = Math.round(t * RATE); if (i < n) x[i] = um(0.6, 1); t += 1 / um(55, 90); }
    const s = moden(x, [[um(650, 760), 0.012, 1], [um(1500, 1750), 0.008, 0.6]], dauerS + 0.05);
    norm(s);
    for (let i = 0; i < s.length; i++) { const u = i / s.length; s[i] *= Math.sin(Math.PI * Math.min(1, u * 1.1)) * Math.min(1, tempo / 0.4); }
    return s;
  }

  // ---- Ereignisse auswählen: nur echte, sichtbare Treffer ----
  const zuletzt = new Map();       // `${runde}-${ort}` -> Zeit
  const erste = new Map();         // `${runde}-${ort}` -> Stärke des ersten Treffers
  let quetsch = [];                // gesammelte Quetsch-Bilder je Runde
  const legeQuetsch = () => {
    if (quetsch.length >= 4) {
      const [t0] = quetsch[0], [t1] = quetsch[quetsch.length - 1];
      const tempo = quetsch.reduce((a, q) => a + q[1], 0) / quetsch.length;
      lege(t0, knarz(t1 - t0 + 1 / FPS, tempo), 0.16 * Math.min(1, tempo / 0.5), quetsch[0][2], quetsch[0][3]);
    }
    quetsch = [];
  };
  bilder.forEach((liste, f) => {
    const t = Math.max(0, (f - 0.5) / FPS);
    for (const e of liste || []) {
      if (!e.sichtbar) continue;
      const ende = ((e.runde ?? Math.floor(f / (FPS * TAKT))) + 1) * TAKT;
      const weich = e.stufe / 100, pan = (e.pan ?? 0) * 0.5;
      if (e.art === 'quetsch') {
        if (quetsch.length && f - quetsch[quetsch.length - 1][4] > 2) legeQuetsch();
        quetsch.push([t, e.tempo, pan, ende, f]);
        continue;
      }
      if (e.art === 'durch') { lege(t, plopp(weich), 0.45, pan, ende); continue; }
      if (e.art !== 'stoss') continue;
      const schl = `${e.runde}-${e.ort}`;
      const vorher = zuletzt.get(schl);
      if (weich === 0) {
        // harte Kugel: jeder neue Aufsetzer ist ein echter Hüpfer -> eigener Klack
        if (e.staerke < 0.3 || (vorher !== undefined && t - vorher < 0.06)) continue;
      } else {
        // weiche Kugel: Wabbeln erzeugt viele Mini-Berührungen -> nur der erste Treffer + echte neue Aufpraller
        const e1 = erste.get(schl);
        if (vorher !== undefined && (t - vorher < 0.55 || e.staerke < 0.6 * e1)) continue;
      }
      if (!erste.has(schl)) erste.set(schl, e.staerke);
      zuletzt.set(schl, t);
      const sig = weich === 0 ? klack(e.staerke) : patsch(e.staerke, weich, e.ort === 'boden');
      lege(t, sig, 1, pan, ende);
    }
  });
  legeQuetsch();

  // ---- Raumhall: kurzer, heller Raum (Fotostudio), erzeugt aus abklingendem Rauschen ----
  const hallLen = Math.round(0.7 * RATE), vor = Math.round(0.009 * RATE);
  const irL = new Float32Array(hallLen), irR = new Float32Array(hallLen);
  for (const ir of [irL, irR]) {
    let a = 0;
    for (let i = vor; i < hallLen; i++) {
      const t = (i - vor) / RATE, fc = 7000 * Math.exp(-t * 4) + 900, k = 1 - Math.exp(-2 * Math.PI * fc / RATE);
      a += ((z() * 2 - 1) - a) * k;
      ir[i] = a * Math.exp(-t * 9.5);
    }
  }
  const nass = 0.11;
  const faltung = (src, ir) => {
    // nur Abschnitte mit Signal falten (schnell genug, weil fast alles still ist)
    const out = new Float32Array(src.length + ir.length);
    for (let i = 0; i < src.length; i++) {
      const v = src[i]; if (Math.abs(v) < 1e-4) continue;
      for (let k = 0; k < ir.length; k += 1) out[i + k] += v * ir[k];
    }
    return out;
  };
  // Hall auf eine heruntergerechnete Kopie (jede 4. Probe) -> viel schneller, Klang bleibt gleich
  const D = 4;
  const kl = new Float32Array(Math.ceil(L.length / D)), kr = new Float32Array(kl.length);
  for (let i = 0; i < kl.length; i++) { kl[i] = (L[i * D] + R[i * D]) / 2; }
  const irK = new Float32Array(Math.ceil(hallLen / D)), irK2 = new Float32Array(irK.length);
  for (let i = 0; i < irK.length; i++) { irK[i] = irL[i * D]; irK2[i] = irR[i * D]; }
  const hl = faltung(kl, irK), hr = faltung(kl, irK2);
  let mh = 0; for (let i = 0; i < hl.length; i++) mh = Math.max(mh, Math.abs(hl[i]), Math.abs(hr[i]));
  let md = 0; for (let i = 0; i < L.length; i++) md = Math.max(md, Math.abs(L[i]), Math.abs(R[i]));
  const hg = mh > 0 ? md / mh * nass * 2.2 : 0;
  for (let i = 0; i < L.length; i++) {
    const j = i / D, j0 = Math.floor(j), u = j - j0;
    L[i] += ((hl[j0] || 0) * (1 - u) + (hl[j0 + 1] || 0) * u) * hg;
    R[i] += ((hr[j0] || 0) * (1 - u) + (hr[j0 + 1] || 0) * u) * hg;
  }
  // Tiefen-Rumpeln unter 35 Hz weg (Hochpass), dann lautstärke angleichen
  for (const ch of [L, R]) { let a = 0; const k = 1 - Math.exp(-2 * Math.PI * 35 / RATE); for (let i = 0; i < ch.length; i++) { a += (ch[i] - a) * k; ch[i] -= a; } }
  let max = 0; for (let i = 0; i < L.length; i++) max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  const g = max > 0 ? 0.89 / max : 1;
  const buf = Buffer.alloc(44 + L.length * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + L.length * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(L.length * 4, 40);
  for (let i = 0; i < L.length; i++) {
    buf.writeInt16LE(Math.round(Math.tanh(L[i] * g * 1.05) * 31000), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.tanh(R[i] * g * 1.05) * 31000), 46 + i * 4);
  }
  fs.writeFileSync(datei, buf);
}
