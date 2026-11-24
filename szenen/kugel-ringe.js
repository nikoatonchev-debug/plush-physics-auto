// Szene 5: Goldkugel fällt durch schwebende Granitringe (Löcher kleiner als die Kugel) auf einen Steinkegel.
// Hart bleibt im obersten Ring liegen, je weicher, desto mehr Ringe schafft sie.
// Jede Stufe ist eine eigene kurze Aufnahme (harter Schnitt), Kamera steht still.
import { TetKoerper } from '../lib/tetphysik.js';
import { drehePunkte } from '../lib/physik.js';

export let FPS = 60;
export let SUBSCHRITTE = 60;
export const STUFEN = [0, 25, 50, 75, 100];
export const TAKT = 4.0;                       // Sekunden je Stufe
export const GESAMT_SEK = TAKT * STUFEN.length;

export let KUGEL = { r: 0.11, nv: 16, fallH: 0.35, v0: 0 };
export let RINGE = [{ y: 0.9, R: 0.165, r: 0.068 }, { y: 0.64, R: 0.158, r: 0.068 }, { y: 0.38, R: 0.152, r: 0.068 }];
export let KEGEL = { Rb: 0.15, h: 0.2, rr: 0.012 };
export const PLATTE = { oben: 0.97 };
export const STUETZE = { innen: 0.16, aussen: 0.29 };
export let WEICH = { 0: null, 25: 2.5e5, 50: 1e5, 75: 3e4, 100: 8e3 };

// Rückstellkraft je Stufe (pro Teilschritt): hält die Kugel rund und lässt sie wie Gelee wabbeln
export let FORM = { 25: 0.001, 50: 0.001, 75: 0.001, 100: 0.001 };

export function konfiguriere(v = {}, { fps } = {}) {

  if (fps) { SUBSCHRITTE = Math.round(SUBSCHRITTE * FPS / fps); FPS = fps; }
}

// Kugel aus Tetraedern: Scheiben entlang x (Mittelpunkt + innere + äußere Lage), Spitzen an den Polen
export function kugelTets(r, nv) {
  const per = 1 + 2 * nv, kap = 6;
  const prof = [];
  for (let k = kap; k >= 1; k--) { const th = k / (kap + 1) * Math.PI / 2; prof.push([-r * Math.sin(th), r * Math.cos(th)]); }
  prof.push([0, r]);
  for (let k = 1; k <= kap; k++) { const th = k / (kap + 1) * Math.PI / 2; prof.push([r * Math.sin(th), r * Math.cos(th)]); }
  const ns = prof.length;
  const pos = new Float64Array((ns * per + 2) * 3);
  const M = i => i * per, A = (i, j) => i * per + 1 + (j % nv), B = (i, j) => i * per + 1 + nv + (j % nv);
  const setze = (id, x, y, z) => { pos[3 * id] = x; pos[3 * id + 1] = y; pos[3 * id + 2] = z; };
  prof.forEach(([s, rad], i) => {
    setze(M(i), s, 0, 0);
    for (let j = 0; j < nv; j++) {
      const w = j / nv * Math.PI * 2;
      setze(A(i, j), s, rad * 0.55 * Math.cos(w), rad * 0.55 * Math.sin(w));
      setze(B(i, j), s, rad * Math.cos(w), rad * Math.sin(w));
    }
  });
  const spL = ns * per, spR = ns * per + 1;
  setze(spL, -r, 0, 0); setze(spR, r, 0, 0);
  const tets = [];
  const prisma = (a0, a1, a2, b0, b1, b2) => tets.push(a0, a1, a2, b0, a1, a2, b0, b1, a2, b0, b1, b2);
  for (let i = 0; i + 1 < ns; i++) for (let j = 0; j < nv; j++) {
    prisma(M(i), A(i, j), A(i, j + 1), M(i + 1), A(i + 1, j), A(i + 1, j + 1));
    prisma(A(i, j), A(i, j + 1), B(i, j + 1), A(i + 1, j), A(i + 1, j + 1), B(i + 1, j + 1));
    prisma(A(i, j), B(i, j + 1), B(i, j), A(i + 1, j), B(i + 1, j + 1), B(i + 1, j));
  }
  for (const [i, sp] of [[0, spL], [ns - 1, spR]]) for (let j = 0; j < nv; j++) {
    tets.push(M(i), A(i, j), A(i, j + 1), sp, A(i, j), A(i, j + 1), B(i, j + 1), sp, A(i, j), B(i, j + 1), B(i, j), sp);
  }
  const ringe = new Int32Array(ns * nv);
  for (let i = 0; i < ns; i++) for (let j = 0; j < nv; j++) ringe[i * nv + j] = B(i, j);
  return { pos, tets, ringe, ns, nv, spitzen: [spL, spR] };
}

function box2(qx, qy, hx, hy) {
  const dx = Math.abs(qx) - hx, dy = Math.abs(qy) - hy;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}
function box3(qx, qy, qz, hx, hy, hz) {
  const dx = Math.abs(qx) - hx, dy = Math.abs(qy) - hy, dz = Math.abs(qz) - hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0);
}

export function kegelProfil(punkteJeEcke = 8) {
  const K = KEGEL;
  return rundeEcken([[0, 0], [K.Rb, 0], [0, K.h]], K.rr, punkteJeEcke, [0]);
}
function rundeEcken(ecken, rr, punkteJeEcke, ohne = []) {
  const out = [];
  for (let i = 0; i < ecken.length; i++) {
    if (ohne.includes(i)) { out.push(ecken[i]); continue; }
    const a = ecken[(i + ecken.length - 1) % ecken.length], b = ecken[i], c = ecken[(i + 1) % ecken.length];
    const d1 = [a[0] - b[0], a[1] - b[1]], d2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
    const e1 = [d1[0] / l1, d1[1] / l1], e2 = [d2[0] / l2, d2[1] / l2];
    const w = Math.acos(Math.max(-1, Math.min(1, e1[0] * e2[0] + e1[1] * e2[1])));
    const t = rr / Math.tan(w / 2);
    const p1 = [b[0] + e1[0] * t, b[1] + e1[1] * t], p2 = [b[0] + e2[0] * t, b[1] + e2[1] * t];
    // Bogen zwischen p1 und p2 (quadratische Bezierkurve über die Ecke – sieht wie eine Rundung aus)
    for (let k = 0; k <= punkteJeEcke; k++) {
      const s = k / punkteJeEcke;
      out.push([(1 - s) ** 2 * p1[0] + 2 * (1 - s) * s * b[0] + s * s * p2[0], (1 - s) ** 2 * p1[1] + 2 * (1 - s) * s * b[1] + s * s * p2[1]]);
    }
  }
  return out;
}
// vorzeichenbehafteter Abstand zu einem geschlossenen Vieleck (negativ = innen), nach Inigo Quilez
function vieleckAbstand(v, px, py) {
  let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2, s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1], wx = px - v[i][0], wy = py - v[i][1];
    const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    const bx = wx - ex * h, by = wy - ey * h;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= v[i][1], c2 = py < v[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

export function welt() {
  const haut = 0.0025, kp = kegelProfil();
  const ringe = (x, y, z) => {
    const q = Math.hypot(x, z); let d = 9;
    for (const R of RINGE) d = Math.min(d, Math.hypot(q - R.R, y - R.y) - R.r);
    return d;
  };
  const kegel = (x, y, z) => {
    const q = Math.hypot(x, z);
    if (y > KEGEL.h + 0.05 || q > KEGEL.Rb + 0.05) return Math.max(y - KEGEL.h, q - KEGEL.Rb, 0.04);
    return vieleckAbstand(kp, q, y);
  };
  const platte = ringe;
  const f = (x, y, z) => Math.min(y, ringe(x, y, z), kegel(x, y, z)) - haut;
  return {
    platte,
    // Abstand + Richtung nach außen, immer (für die exakte harte Kugel)
    feld(x, y, z, g) {
      const d = f(x, y, z), h = 1e-4;
      const gx = f(x + h, y, z) - f(x - h, y, z), gy = f(x, y + h, z) - f(x, y - h, z), gz = f(x, y, z + h) - f(x, y, z - h);
      const l = Math.hypot(gx, gy, gz) || 1;
      g[0] = gx / l; g[1] = gy / l; g[2] = gz / l;
      return d;
    },
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

// Wackeln dämpfen: jede Ecke wird zur gemeinsamen Bewegung hingezogen (Rutschen bleibt erhalten)
function beruhige(kp, k) {
  const v = kp.v, n = v.length / 3; let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += v[3 * i]; b += v[3 * i + 1]; c += v[3 * i + 2]; }
  a /= n; b /= n; c /= n; const f = Math.max(0, 1 - k);
  for (let i = 0; i < n; i++) { v[3 * i] = a + (v[3 * i] - a) * f; v[3 * i + 1] = b + (v[3 * i + 1] - b) * f; v[3 * i + 2] = c + (v[3 * i + 2] - c) * f; }
}

export function neueRunde(stufe, ueber = {}) {
  const W = welt();
  const sub = ueber.sub ?? SUBSCHRITTE;
  const dt = 1 / FPS / sub;
  const K = KUGEL, P = { oben: RINGE[0].y + RINGE[0].r };
  const t = kugelTets(K.r, K.nv);
  const starr = stufe === 0;
  // leicht schräg und minimal neben der Mitte, damit es natürlich aussieht
  drehePunkte(t.pos, 0.3, 1, 0.2, 0.9 + stufe * 0.01, starr ? 0.0015 : 0.004, P.oben + K.fallH + K.r, 0.002);
  const kp = starr ? new HarteKugel(t.pos, K.r, W) : new TetKoerper(t.pos, t.tets, {
    starr, E: (ueber.weich ?? WEICH)[stufe] ?? 1e7, nu: 0.47, dichte: 1100, form: (ueber.form ?? FORM)[stufe] ?? 0,
    reib: starr ? 0.25 : (ueber.reib ?? 0.06), abprall: starr ? 0.45 : 0.05, daempf: starr ? 0.02 : 0.35,
  });
  kp.setzeBewegung(0, -(ueber.v0 ?? K.v0), 0);
  const r = {
    stufe, kp, t, sub, zeit: 0, welt: W,
    durch: false, ziel: null, vorY: null,
    schritte(k) {
      for (let s = 0; s < k; s++) {
        kp.schritt(dt, W); this.zeit += dt;
        // nach dem Aufklatschen unten langsam beruhigen (sonst wabbelt sie ewig)
        if (!starr && this.unten !== undefined && this.zeit - this.unten > 0.5) kp.daempf = Math.min(4, kp.daempf + dt * 4);
        if (!starr && this.ruhe > 0) beruhige(kp, this.ruhe * dt);
      }
      if (!starr) {
        // Steckt die Kugel fest (Mitte bewegt sich kaum), klingt das Wackeln zügig aus.
        // Gedämpft wird nur das Wackeln, nicht das Rutschen – langsames Durchquetschen geht weiter.
        // „Fest“ heißt: über die letzten 0,4 s kaum vom Fleck gekommen (Hin-und-her-Schaukeln zählt nicht als Bewegung)
        const m1 = this.mitte(), spur = (this.spur ??= []);
        spur.push([this.zeit, m1]); while (spur.length > 2 && this.zeit - spur[1][0] > 0.4) spur.shift();
        const [ta, ma] = spur[0], weg = Math.hypot(m1[0] - ma[0], m1[1] - ma[1], m1[2] - ma[2]);
        this.still = this.zeit - ta > 0.35 && weg < 0.012 && this.zeit > 0.5 ? (this.still ?? 0) + k * dt : 0;
        this.ruhe = this.still > 0.25 ? Math.min(14, (this.ruhe ?? 0) + k * dt * 20) : Math.max(0, (this.ruhe ?? 0) - k * dt * 40);
      }
      if (kp.aktualisiere) kp.aktualisiere();
    },
    mitte() {
      const x = kp.x, N = x.length / 3; let a = 0, b = 0, c = 0;
      for (let i = 0; i < N; i++) { a += x[3 * i]; b += x[3 * i + 1]; c += x[3 * i + 2]; }
      return [a / N, b / N, c / N];
    },
    tiefster() { let m = 9; for (let i = 1; i < kp.x.length; i += 3) m = Math.min(m, kp.x[i]); return m; },
    // Geräusch-Ereignisse seit dem letzten Aufruf (einmal pro Bild)
    ereignisse() {
      const liste = [];
      const m = this.mitte();
      const a = kp.holeAufprall(); kp.holeKontakte();
      const vy = this.vorY === null ? 0 : (m[1] - this.vorY) * FPS;
      this.vorY = m[1];
      const ort = m[1] > KEGEL.h + K.r * 0.7 ? 'platte' : 'boden';
      if (a > 0.3) liste.push({ art: 'stoss', ort, staerke: a, stufe, pos: [m[0], m[1] - K.r * 0.8, m[2]] });
      // durch einen Ring geflutscht?
      const R = RINGE[this.ringNr ?? 0];
      if (R) {
        const imLoch = m[1] < R.y + K.r * 0.6 && m[1] > R.y - K.r * 0.9;
        if (!starr && imLoch && -vy > 0.02) liste.push({ art: 'quetsch', tempo: -vy, stufe, pos: [m[0], R.y, m[2]] });
        if (m[1] < R.y - K.r * 0.55) { this.durch = true; this.ringNr = (this.ringNr ?? 0) + 1; liste.push({ art: 'durch', stufe, staerke: -vy, pos: [m[0], R.y, m[2]] }); }
      } else if (this.unten === undefined) this.unten = this.zeit;
      return liste;
    },
    oberflaeche() {
      const x = kp.x;
      const ringe = new Float64Array(t.ringe.length * 3);
      t.ringe.forEach((id, i) => { ringe[3 * i] = x[3 * id]; ringe[3 * i + 1] = x[3 * id + 1]; ringe[3 * i + 2] = x[3 * id + 2]; });
      const sp = t.spitzen.map(id => [x[3 * id], x[3 * id + 1], x[3 * id + 2]]);
      return { ringe, spL: sp[0], spR: sp[1], ns: t.ns, nv: t.nv };
    },
  };
  return r;
}

// Harte Kugel exakt: Mittelpunkt gegen das Abstandsfeld (Abstand < Radius = Berührung),
// mit Abprallen, Reibung und echtem Rollen (Vollkugel, I = 2/5 m r²).
class HarteKugel {
  constructor(pos, r, W) {
    this.r = r; this.n = pos.length / 3; this.x = Float64Array.from(pos);
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < this.n; i++) { a += pos[3 * i]; b += pos[3 * i + 1]; c += pos[3 * i + 2]; }
    this.c = [a / this.n, b / this.n, c / this.n];
    this.q = Float64Array.from(pos, (v, i) => v - this.c[i % 3]);
    this.v = [0, 0, 0]; this.w = [0, 0, 0]; this.rot = [0, 0, 0, 1];
    this.abprall = 0.32; this.reib = 0.3; this.aufprall = 0; this.anlage = false; this.g = [0, 0, 0];
  }
  setzeBewegung(vx, vy, vz) { this.v = [vx, vy, vz]; }
  schritt(dt, W) {
    const { c, v, w, g, r } = this;
    v[1] -= 9.81 * dt;
    for (let k = 0; k < 3; k++) c[k] += v[k] * dt;
    const d = W.feld(c[0], c[1], c[2], g) - r;
    if (d < 0) {
      for (let k = 0; k < 3; k++) c[k] -= g[k] * d;
      const vn = v[0] * g[0] + v[1] * g[1] + v[2] * g[2];
      let dvn = 0;
      if (vn < 0) {
        if (!this.anlage && -vn > this.aufprall) this.aufprall = -vn;
        dvn = -vn * (-vn > 0.35 ? 1 + this.abprall : 1);
        for (let k = 0; k < 3; k++) v[k] += g[k] * dvn;
      }
      // Rutschgeschwindigkeit am Berührpunkt (rc = -r n)
      const rc = [-r * g[0], -r * g[1], -r * g[2]];
      const vc = [v[0] + w[1] * rc[2] - w[2] * rc[1], v[1] + w[2] * rc[0] - w[0] * rc[2], v[2] + w[0] * rc[1] - w[1] * rc[0]];
      const vcn = vc[0] * g[0] + vc[1] * g[1] + vc[2] * g[2];
      const vt = [vc[0] - vcn * g[0], vc[1] - vcn * g[1], vc[2] - vcn * g[2]];
      const vtl = Math.hypot(...vt);
      if (vtl > 1e-9) {
        const max = this.reib * Math.max(dvn, 9.81 * dt * Math.max(0, g[1]));
        const s = Math.min(vtl * 2 / 7, max) / vtl;
        const P = vt.map(x => -x * s);                       // Impuls je Masse
        for (let k = 0; k < 3; k++) v[k] += P[k];
        // Δw = rc × P / (2/5 r²)
        const f = 1 / (0.4 * r * r);
        w[0] += (rc[1] * P[2] - rc[2] * P[1]) * f; w[1] += (rc[2] * P[0] - rc[0] * P[2]) * f; w[2] += (rc[0] * P[1] - rc[1] * P[0]) * f;
      }
      for (let k = 0; k < 3; k++) { w[k] *= 1 - 2.5 * dt; v[k] *= 1 - 0.6 * dt; }   // Rollwiderstand
      this.anlage = true;
    } else if (d > 0.002) this.anlage = false;
    // Drehung weiterführen
    const [qx, qy, qz, qw] = this.rot, h = dt / 2;
    const n = [qx + h * (w[0] * qw + w[1] * qz - w[2] * qy), qy + h * (w[1] * qw + w[2] * qx - w[0] * qz), qz + h * (w[2] * qw + w[0] * qy - w[1] * qx), qw - h * (w[0] * qx + w[1] * qy + w[2] * qz)];
    const l = Math.hypot(...n); this.rot = n.map(x => x / l);
  }
  aktualisiere() {
    const [x, y, z, s] = this.rot, { q, c } = this;
    const R = [1 - 2 * (y * y + z * z), 2 * (x * y - s * z), 2 * (x * z + s * y), 2 * (x * y + s * z), 1 - 2 * (x * x + z * z), 2 * (y * z - s * x), 2 * (x * z - s * y), 2 * (y * z + s * x), 1 - 2 * (x * x + y * y)];
    for (let i = 0; i < this.n; i++) {
      const a = q[3 * i], b = q[3 * i + 1], d = q[3 * i + 2];
      this.x[3 * i] = R[0] * a + R[1] * b + R[2] * d + c[0];
      this.x[3 * i + 1] = R[3] * a + R[4] * b + R[5] * d + c[1];
      this.x[3 * i + 2] = R[6] * a + R[7] * b + R[8] * d + c[2];
    }
  }
  holeAufprall() { const a = this.aufprall; this.aufprall = 0; return a; }
  holeKontakte() { return 0; }
}
