// Szene 3: Goldpillen rollen einen weißen Hügel hinunter, springen über eine Schanze
// und landen nacheinander in einem Trinkglas – 0 % bis 100 % weich. Das Glas füllt sich.
import { drehePunkte } from '../lib/physik.js';
import { TetKoerper, kapselTets } from '../lib/tetphysik.js';

export let FPS = 60;
export const STUFEN = [0, 25, 50, 75, 100];
export const TAKT = 3.2;                 // Sekunden zwischen zwei Pillen
export const NACHLAUF = 2.2;             // Sekunden nach der letzten Pille
export let SUBSCHRITTE = 72;
export const GESAMT_SEK = TAKT * STUFEN.length + NACHLAUF;

// Hügel (Profil in x, quer in z ausgedehnt)
export const HUEGEL = { tal: -0.55, talH: 0.3, oben: 0.85, breite: 1.1, schanzeK: 0.8, lippe: -0.25, hinten: -1.95, halbZ: 0.42 };
export let GLAS = { x: 0.23, ri: 0.14, ra: 0.15, h: 0.31, boden: 0.02 };
export let PILLE = { L: 0.17, r: 0.047, nl: 6, nv: 12 };
export const WEICH = { 0: null, 25: 1.0e6, 50: 2.2e5, 75: 6e4, 100: 1.6e4 };
// Anschub je Stufe (weiche Pillen verlieren beim Rollen mehr Schwung)
export let ANSCHUB = { 0: 0.75, 25: 0, 50: 0, 75: 0, 100: 0.7 };

export function konfiguriere(v = {}, { fps } = {}) {
  if (v.glasX) GLAS = { ...GLAS, x: v.glasX };
  if (fps) { SUBSCHRITTE = Math.round(SUBSCHRITTE * FPS / fps); FPS = fps; }
}

export function hoehe(x) {
  const H = HUEGEL;
  if (x <= H.tal) {
    const u = Math.min(1, (H.tal - x) / H.breite);
    return H.talH + (H.oben - H.talH) * 0.5 * (1 - Math.cos(Math.PI * u));
  }
  return H.talH + H.schanzeK * (x - H.tal) ** 2;
}
const steigung = x => (hoehe(x + 1e-4) - hoehe(x - 1e-4)) / 2e-4;

function box2(qx, qy, hx, hy) {
  const dx = Math.abs(qx) - hx, dy = Math.abs(qy) - hy;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

export function welt() {
  const H = HUEGEL, G = GLAS, haut = 0.003;
  const mulde = z => 0.9 * z * z;            // flache Rinne, hält die Pillen mittig
  const huegel = (x, y, z) => {
    const xx = Math.min(Math.max(x, H.hinten), H.lippe);
    const s = steigung(xx);
    const d = (y - hoehe(xx) - mulde(z)) / Math.sqrt(1 + s * s);
    return Math.max(d, x - H.lippe, H.hinten - x, Math.abs(z) - H.halbZ);
  };
  const glas = (x, y, z) => {
    const q = Math.hypot(x - G.x, z);
    const wand = box2(q - (G.ri + G.ra) / 2, y - G.h / 2, (G.ra - G.ri) / 2, G.h / 2) - 0.002;
    const boden = box2(q, y - G.boden / 2, G.ra, G.boden / 2);
    return Math.min(wand, boden);
  };
  const f = (x, y, z) => Math.min(y, huegel(x, y, z), glas(x, y, z)) - haut;
  return {
    glas, huegel,
    abstand(x, y, z, g) {
      const d = f(x, y, z);
      if (d >= 0) return d;
      const h = 1e-4;
      const gx = f(x + h, y, z) - f(x - h, y, z), gy = f(x, y + h, z) - f(x, y - h, z), gz = f(x, y, z + h) - f(x, y, z - h);
      const l = Math.hypot(gx, gy, gz) || 1;
      g[0] = gx / l; g[1] = gy / l; g[2] = gz / l;
      return d;
    },
  };
}

export function neuerLauf(ueber = {}) {
  const W = welt();
  const sub = ueber.sub ?? SUBSCHRITTE;
  const dt = 1 / FPS / sub;
  const pillen = STUFEN.map((stufe, n) => {
    const t = kapselTets(PILLE.L, PILLE.r, PILLE.nl, PILLE.nv);
    const starr = stufe === 0;
    const x0 = HUEGEL.tal - HUEGEL.breite + 0.02;
    drehePunkte(t.pos, 0, 1, 0, Math.PI / 2 + (n % 2 ? 0.05 : -0.05), x0, hoehe(x0) + PILLE.r + 0.01, 0);
    const kp = new TetKoerper(t.pos, t.tets, {
      starr, E: WEICH[stufe] ?? 1e7, nu: 0.45,
      reib: starr ? 0.15 : 0.6, abprall: starr ? 0.2 : 0.05, daempf: starr ? 0.05 : 0.3,
    });
    const anschub = ueber.anschub?.[stufe] ?? ANSCHUB[stufe];
    kp.setzeBewegung(0.7 + anschub, 0, 0, 0, 0, -(0.7 + anschub) / PILLE.r);
    return { kp, t, stufe, start: n * TAKT, aktiv: false, zeit: 0, stoss: 0, glasStoss: 0 };
  });

  // Pillen untereinander (Außenhaut stößt sich ab)
  const RAD = 0.026, ZELLE = 2 * RAD;
  let pillenStoss = 0;
  function gegenseitig(aktive) {
    if (aktive.length < 2) return;
    const gitter = new Map();
    aktive.forEach((pl, b) => {
      const kp = pl.kp;
      for (const id of pl.t.ringe) {
        const key = `${Math.floor(kp.p[3 * id] / ZELLE)},${Math.floor(kp.p[3 * id + 1] / ZELLE)},${Math.floor(kp.p[3 * id + 2] / ZELLE)}`;
        let l = gitter.get(key); if (!l) gitter.set(key, l = []); l.push(b, id);
      }
    });
    aktive.forEach((pl, b) => {
      const kp = pl.kp;
      for (const id of pl.t.ringe) {
        const px = kp.p[3 * id], py = kp.p[3 * id + 1], pz = kp.p[3 * id + 2];
        const cx = Math.floor(px / ZELLE), cy = Math.floor(py / ZELLE), cz = Math.floor(pz / ZELLE);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const l = gitter.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!l) continue;
          for (let q = 0; q < l.length; q += 2) {
            const b2 = l[q]; if (b2 <= b) continue;
            const o = aktive[b2].kp, j = l[q + 1];
            const ex = o.p[3 * j] - kp.p[3 * id], ey = o.p[3 * j + 1] - kp.p[3 * id + 1], ez = o.p[3 * j + 2] - kp.p[3 * id + 2];
            const d = Math.hypot(ex, ey, ez);
            if (d >= 2 * RAD || d < 1e-9) continue;
            const vn = ((o.v[3 * j] - kp.v[3 * id]) * ex + (o.v[3 * j + 1] - kp.v[3 * id + 1]) * ey + (o.v[3 * j + 2] - kp.v[3 * id + 2]) * ez) / d;
            if (b2 === aktive.length - 1 && -vn > pillenStoss) pillenStoss = -vn;   // nur die neueste Pille klingt
            const k = Math.min(2 * RAD - d, 0.004) / d * 0.5;
            kp.p[3 * id] -= ex * k; kp.p[3 * id + 1] -= ey * k; kp.p[3 * id + 2] -= ez * k;
            o.p[3 * j] += ex * k; o.p[3 * j + 1] += ey * k; o.p[3 * j + 2] += ez * k;
          }
        }
      }
    });
  }

  const lauf = {
    pillen, sub, zeit: 0, welt: W,
    schritte(k) {
      for (let s = 0; s < k; s++) {
        for (const pl of pillen) if (!pl.aktiv && this.zeit >= pl.start) pl.aktiv = true;
        const aktive = pillen.filter(pl => pl.aktiv);
        for (const pl of aktive) { pl.kp.vorher(dt); pl.kp.loese(dt, W); }
        gegenseitig(aktive);
        for (const pl of aktive) {
          pl.kp.nachher(dt);
          pl.zeit += dt;
          // im Glas zur Ruhe kommen lassen
          if (pl.zeit > 1.6) pl.kp.daempf = Math.min(pl.kp.starr ? 1.5 : 4, pl.kp.daempf + dt * 3);
        }
        this.zeit += dt;
      }
    },
    mitte(n) {
      const x = pillen[n].kp.x, m = [0, 0, 0], N = x.length / 3;
      for (let i = 0; i < N; i++) { m[0] += x[3 * i]; m[1] += x[3 * i + 1]; m[2] += x[3 * i + 2]; }
      return m.map(v => v / N);
    },
    // Geräusch-Ereignisse dieses Bildes: je Pille Aufprall (Boden/Hügel/Glas), Rollen; dazu Pille-auf-Pille
    ereignisse() {
      const liste = [];
      pillen.forEach((pl, n) => {
        if (!pl.aktiv) return;
        const a = pl.kp.holeAufprall(), k = pl.kp.holeKontakte();
        const m = this.mitte(n);
        const imGlas = Math.hypot(m[0] - GLAS.x, m[2]) < GLAS.ra + 0.06 && m[1] < GLAS.h + 0.15;
        const ort = imGlas ? 'glas' : (m[0] < HUEGEL.lippe + 0.02 ? 'huegel' : 'boden');
        if (a > 0.25 && k >= 2) liste.push({ art: 'stoss', ort, staerke: a, stufe: pl.stufe, pille: n, pos: m });
        // Rollgeschwindigkeit, solange die Pille auf dem Hügel liegt
        const v = pl.kp.v; let vx = 0, vy = 0; const N = v.length / 3;
        for (let i = 0; i < N; i++) { vx += v[3 * i]; vy += v[3 * i + 1]; }
        const tempo = Math.hypot(vx / N, vy / N);
        const naheHuegel = m[0] < HUEGEL.lippe && m[1] - hoehe(m[0]) < PILLE.r * 1.6;
        if (naheHuegel && tempo > 0.15) liste.push({ art: 'rollen', tempo, stufe: pl.stufe, pille: n, pos: m });
      });
      if (pillenStoss > 0.6) {
        const n = pillen.reduce((b, pl, i) => pl.aktiv ? i : b, 0);
        liste.push({ art: 'stoss', ort: 'pille', staerke: pillenStoss, stufe: pillen[n].stufe, pille: n, pos: this.mitte(n) });
      }
      pillenStoss = 0;
      return liste;
    },
    aktuelleStufe() { let s = STUFEN[0]; for (const pl of pillen) if (this.zeit >= pl.start) s = pl.stufe; return s; },
    oberflaeche(n) {
      const { kp, t } = pillen[n], x = kp.x;
      const ringe = new Float64Array(t.ringe.length * 3);
      t.ringe.forEach((id, i) => { ringe[3 * i] = x[3 * id]; ringe[3 * i + 1] = x[3 * id + 1]; ringe[3 * i + 2] = x[3 * id + 2]; });
      const sp = t.spitzen.map(id => [x[3 * id], x[3 * id + 1], x[3 * id + 2]]);
      return { ringe, spL: sp[0], spR: sp[1], ns: t.ns, nv: t.nv };
    },
  };
  return lauf;
}
