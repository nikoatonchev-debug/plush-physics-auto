// Szene 2: drei Goldkapseln fallen auf eine Steintreppe – 0 % bis 100 % weich.
import { treppeWelt, drehePunkte } from '../lib/physik.js';
import { TetKoerper, kapselTets } from '../lib/tetphysik.js';

export let FPS = 60;
export const RUNDE_SEK = 5.6;
export const STUFEN = [0, 25, 50, 75, 100];
export let SUBSCHRITTE = 40;

export let TREPPE = { stufen: 8, hoehe: 0.2, tiefe: 0.34, breite: 1.45 };
export let KAPSEL = { L: 0.38, r: 0.075, nl: 8, nv: 14 };
let ANZAHL = 3;
const ABSTAND = 0.44;                          // seitlicher Abstand der drei Kapseln

export function konfiguriere(v = {}, { fps } = {}) {
  if (v.kapseln) ANZAHL = v.kapseln;
  if (v.stufen) TREPPE = { ...TREPPE, stufen: v.stufen };
  if (v.kapselL) KAPSEL = { ...KAPSEL, L: v.kapselL };
  if (fps) { SUBSCHRITTE = Math.round(SUBSCHRITTE * FPS / fps); FPS = fps; }
}

export const WEICH = { 0: null, 25: 1.2e6, 50: 2.5e5, 75: 6e4, 100: 1.5e4 };

export function neueRunde(stufe, ueber = {}) {
  const welt = treppeWelt(TREPPE);
  const starr = stufe === 0;
  const oben = TREPPE.stufen * TREPPE.hoehe;
  const sub = ueber.sub ?? (stufe === 25 ? Math.round(SUBSCHRITTE * 2.4) : SUBSCHRITTE);
  const dt = 1 / FPS / sub;
  const kapseln = Array.from({ length: ANZAHL }, (_, n) => n - (ANZAHL - 1) / 2).map((k, n) => {
    const t = kapselTets(KAPSEL.L, KAPSEL.r, KAPSEL.nl, KAPSEL.nv);
    // Kapsel steht aufrecht (Achse y), leicht unterschiedlich gekippt -> natürlicher Fall
    drehePunkte(t.pos, 0, 1, 0, (n - 1) * 0.06, 0, 0, 0); // liegt quer zur Treppe -> rollt hinunter
    drehePunkte(t.pos, 0, 0, 1, (n - 1) * 0.08, k * ABSTAND, oben + 0.55 + n * 0.08, 0.26);
    const kp = new TetKoerper(t.pos, t.tets, {
      starr,
      E: ueber.E ?? WEICH[stufe] ?? 1e7, nu: 0.45,
      reib: starr ? 0.2 : { 25: 0.5, 50: 0.7, 75: 0.9, 100: 1.1 }[stufe],
      abprall: starr ? 0.4 : 0.05,
      daempf: starr ? 0.05 : 0.4,
    });
    kp.setzeBewegung(0, -0.4, 0.95, 8, 0, 0); // Schwung nach vorn + Rollen
    return { kp, t };
  });
  // Kapseln untereinander: Außenhaut-Punkte stoßen sich ab (räumliches Gitter)
  const haut = kapseln.map(({ t }) => t.ringe);
  const RAD = 0.034, ZELLE = 2 * RAD;
  function gegenseitig() {
    const gitter = new Map();
    kapseln.forEach(({ kp }, b) => {
      for (const id of haut[b]) {
        const key = `${Math.floor(kp.p[3 * id] / ZELLE)},${Math.floor(kp.p[3 * id + 1] / ZELLE)},${Math.floor(kp.p[3 * id + 2] / ZELLE)}`;
        let l = gitter.get(key); if (!l) gitter.set(key, l = []); l.push(b, id);
      }
    });
    kapseln.forEach(({ kp }, b) => {
      for (const id of haut[b]) {
        const px = kp.p[3 * id], py = kp.p[3 * id + 1], pz = kp.p[3 * id + 2];
        const cx = Math.floor(px / ZELLE), cy = Math.floor(py / ZELLE), cz = Math.floor(pz / ZELLE);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const l = gitter.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!l) continue;
          for (let q = 0; q < l.length; q += 2) {
            const b2 = l[q]; if (b2 <= b) continue;
            const o = kapseln[b2].kp, j = l[q + 1];
            const ex = o.p[3 * j] - kp.p[3 * id], ey = o.p[3 * j + 1] - kp.p[3 * id + 1], ez = o.p[3 * j + 2] - kp.p[3 * id + 2];
            const d = Math.hypot(ex, ey, ez);
            if (d >= 2 * RAD || d < 1e-9) continue;
            const k = Math.min(2 * RAD - d, 0.004) / d * 0.5; // sanft, damit nichts weggeschleudert wird
            kp.p[3 * id] -= ex * k; kp.p[3 * id + 1] -= ey * k; kp.p[3 * id + 2] -= ez * k;
            o.p[3 * j] += ex * k; o.p[3 * j + 1] += ey * k; o.p[3 * j + 2] += ez * k;
          }
        }
      }
    });
  }
  return {
    kapseln, sub, zeit: 0,
    schritte(k) {
      for (let s = 0; s < k; s++) {
        for (const { kp } of kapseln) { kp.vorher(dt); kp.loese(dt, welt); }
        gegenseitig();
        for (const { kp } of kapseln) {
          kp.nachher(dt);
          if (!starr && this.zeit > 3.8) kp.daempf = Math.min(4, kp.daempf + dt * 3);
        }
        this.zeit += dt;
      }
    },
    bild() { this.schritte(sub); return this.aufprall(); },
    aufprall() { let a = 0, k = 0; for (const { kp } of kapseln) { a = Math.max(a, kp.holeAufprall()); k += kp.holeKontakte(); } return { a, k }; },
    oberflaeche(n) {
      const { kp, t } = kapseln[n], x = kp.x;
      const ringe = new Float64Array(t.ringe.length * 3);
      t.ringe.forEach((id, i) => { ringe[3 * i] = x[3 * id]; ringe[3 * i + 1] = x[3 * id + 1]; ringe[3 * i + 2] = x[3 * id + 2]; });
      const sp = t.spitzen.map(id => [x[3 * id], x[3 * id + 1], x[3 * id + 2]]);
      return { ringe, spL: sp[0], spR: sp[1], ns: t.ns, nv: t.nv };
    },
  };
}
