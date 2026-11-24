// Szene 6: Steinpendel (längliche Kapsel an einer Stange) schwingt in einen Würfel aus vielen Klötzchen.
// Im Würfel ist ein rundes Loch, etwas kleiner als das Pendel – je schwerer, desto mehr geht kaputt.
import { KloetzeBlock } from '../lib/kloetze3.js';
export const STUFEN = [0.1, 1, 10, 30, 100];          // Kilogramm
export let FPS = 60;
export const TAKT = 4.0;

// Würfel: N×N×N Klötzchen, rechte Seite bei x = 0, steht auf dem Boden
export const WUERFEL = { n: 16, a: 0.56 };
WUERFEL.b = WUERFEL.a / WUERFEL.n;                       // Kantenlänge eines Klötzchens
export const LOCH = { y: WUERFEL.a / 2, r: 0.098 };      // Lochachse entlang x
// Pendel: Kapsel entlang x (Radius r, Gesamtlänge l), lange Stange nach oben zum Drehpunkt.
// Im tiefsten Punkt berührt die Kapselspitze genau die Lochseite.
export const PENDEL = { r: 0.112, l: 0.78, L: 2.5, start: 0.45 };
PENDEL.dreh = [PENDEL.l / 2, LOCH.y + PENDEL.L, 0];
export const EINST = { fest: 0.3, riss: 0.49, schutt: 0.125, bruchE: 0.05, druck: 1, start: 0.6, gedaechtnis: 0.004, dichte: 2000, sub: 15, zeitlupe: 0.5 };

export function konfiguriere(V = {}, { fps } = {}) { if (fps) FPS = fps; Object.assign(EINST, V.einst ?? {}); }

// Klötzchen ohne die im Loch
export function kloetze() {
  const { n, b } = WUERFEL, liste = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const x = -WUERFEL.a + (i + 0.5) * b, y = (j + 0.5) * b, z = -WUERFEL.a / 2 + (k + 0.5) * b;
    if (Math.hypot(y - LOCH.y, z) < LOCH.r) continue;
    liste.push([x, y, z]);
  }
  return liste;
}

// Lage des Pendels bei Winkel w (0 = senkrecht nach unten, positiv = nach rechts ausgeschwenkt)
export function pendelLage(w) {
  const [px, py] = PENDEL.dreh, L = PENDEL.L;
  return { mitte: [px + Math.sin(w) * L, py - Math.cos(w) * L, 0], winkel: w };
}

export function neueRunde(kg, ueber = {}) {
  const E = { ...EINST, ...ueber };
  const sim = new KloetzeBlock(kloetze(), WUERFEL.b, {
    dichte: E.dichte, festigkeit: E.fest, riss: E.riss, schutt: E.schutt, bruchEnergie: E.bruchE, druck: E.druck, gedaechtnis: E.gedaechtnis,
    gitter: { n: WUERFEL.n, x0: -WUERFEL.a, y0: 0, z0: -WUERFEL.a / 2 },
    pendel: { ...PENDEL, start: E.start, m: kg, abprall: 0.25, stangeR: 0.0055 },
  });
  // Zeitlupe: pro Videobild vergeht weniger echte Zeit -> ruhiger, „satisfying“
  const sub = Math.round(E.sub * 60 / FPS), dt = E.zeitlupe / FPS;
  return {
    sim, kg, zeit: 0,
    bild() { sim.schritt(dt, sub); this.zeit += dt; },
    ereignisse() {
      const liste = [];
      if (sim.rammeStoss > 0) {
        const L = sim.rammeLage();
        liste.push({ art: 'ramme', kg, tempo: sim.rammeStoss, pos: [L.mx - L.ax * PENDEL.l / 2, L.my, 0] });
        sim.rammeStoss = 0;
      }
      if (sim.neueBrueche > 0) {
        liste.push({ art: 'bruch', n: sim.neueBrueche, kg, pos: sim.bruchOrt.slice() });
        sim.neueBrueche = 0;
      }
      const s = sim.stoesse();
      if (s.n > 0) liste.push({ art: 'klapper', n: s.n, tempo: s.mittel, kg, pos: s.pos });
      return liste;
    },
  };
}
