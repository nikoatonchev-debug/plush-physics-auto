// Szene 1: Goldring fällt auf einen Steinturm – 0 % bis 100 % weich.
// Version 2: echter Weichkörper aus Tetraedern (XPBD), 60 Bilder/s.
// (Version 1 mit Formabgleich liegt in ring-steinturm-v1.js)
import { drehePunkte, steinturmWelt } from '../lib/physik.js';
import { TetKoerper, ringTets } from '../lib/tetphysik.js';

export let FPS = 60;
export const RUNDE_SEK = 4.6;
export const STUFEN = [0, 25, 50, 75, 100];
export let SUBSCHRITTE = 32;          // Physikschritte pro Videobild

function stapel(s) {
  s = s.map(e => ({ ...e }));
  let y = 0;
  s.forEach((e, i) => { e.rz = e.rz ?? e.rx; e.x = 0; e.z = 0; e.y = y + e.ry - (i ? 0.045 : 0.0); y = e.y + e.ry; });
  return s;
}
export let STEINE = stapel([
    { rx: 0.78, ry: 0.19, rz: 0.78 },
    { rx: 0.43, ry: 0.31, rz: 0.43 },
    { rx: 0.33, ry: 0.25, rz: 0.33 },
    { rx: 0.235, ry: 0.19, rz: 0.235 },
]);

export let RING = { R: 0.29, r: 0.082, nu: 48, nv: 16 };

// Tägliche Abwandlung (lib/variante.js) + Tempo-Einstellung für Rechner ohne Grafikkarte
export function konfiguriere(v = {}, { fps } = {}) {
  if (v.steine) STEINE = stapel(v.steine);
  if (v.ring) RING = { ...RING, ...v.ring };
  if (fps) { SUBSCHRITTE = Math.round(SUBSCHRITTE * FPS / fps); FPS = fps; }
}

// Weichheit -> Nachgiebigkeit der Kanten (XPBD-„compliance“); Volumen bleibt erhalten
export const WEICH = { 0: null, 25: 2e6, 50: 4e5, 75: 1e5, 100: 8e3 };  // Elastizitätsmodul E in Pa

export function neueRunde(stufe, ueber = {}) {
  const t = ringTets(RING.R, RING.r, RING.nu, RING.nv);
  const oben = STEINE[STEINE.length - 1].y + STEINE[STEINE.length - 1].ry;
  drehePunkte(t.pos, 1, 0, 0.3 / Math.hypot(1, 0.3), 0.09, 0.035, oben + 1.25, 0.0);
  const starr = stufe === 0;
  const koerper = new TetKoerper(t.pos, t.tets, {
    starr,
    E: ueber.E ?? WEICH[stufe] ?? 1e7,
    nu: 0.45,
    reib: starr ? 0.6 : 0.35,
    abprall: starr ? 0.3 : 0.05,
    daempf: ueber.daempf ?? (starr ? 0.8 : 0.4),
  });
  koerper.setzeBewegung(0, -0.6, 0);
  const welt = steinturmWelt(STEINE);
  // steife Ringe brauchen feinere Zeitschritte, sonst zittern sie
  const sub = ueber.sub ?? (stufe === 25 ? SUBSCHRITTE * 4 : SUBSCHRITTE);
  const dt = 1 / FPS / sub;
  const ob = new Float64Array(t.oberflaeche.length * 3);
  return {
    koerper, sub,
    zeit: 0,
    schritte(k) {
      for (let s = 0; s < k; s++) {
        koerper.schritt(dt, welt);
        this.zeit += dt;
        // nach der Hauptbewegung sanft zur Ruhe kommen lassen (kein Nachzittern)
        if (!starr && this.zeit > 2.4) koerper.daempf = Math.min(4, koerper.daempf + dt * 3);
      }
    },
    bild() { this.schritte(sub); return koerper.holeAufprall(); },
    oberflaeche() { // Punkte der Außenhaut als nu×nv-Gitter
      const x = koerper.x;
      t.oberflaeche.forEach((id, k) => { ob[3 * k] = x[3 * id]; ob[3 * k + 1] = x[3 * id + 1]; ob[3 * k + 2] = x[3 * id + 2]; });
      return ob;
    },
  };
}
