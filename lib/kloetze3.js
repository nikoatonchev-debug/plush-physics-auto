// Starrkörper-Physik: Würfel aus Klötzchen + Steinpendel.
// Der heile Teil des Würfels ist EIN schwerer Körper (Masse aller noch verklebten Klötzchen).
// Trifft ihn genug Kraftstoß an einem Klötzchen, bricht dieses heraus und wird ein eigener Körper;
// der Überschuss läuft als Riss zu den Nachbarn weiter (vor allem in Stoßrichtung, aber auch zur Seite).
// Jedes Klötzchen bleibt immer da (keins verschwindet). Verfahren: kleine Teilschritte, Positions-Korrektur.
const G = 9.81;

function dreh(Q, i, vx, vy, vz, out) {
  const qx = Q[i], qy = Q[i + 1], qz = Q[i + 2], qw = Q[i + 3];
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + (qy * tz - qz * ty); out[1] = vy + qw * ty + (qz * tx - qx * tz); out[2] = vz + qw * tz + (qx * ty - qy * tx);
}
function drehZurueck(Q, i, vx, vy, vz, out) {
  const qx = -Q[i], qy = -Q[i + 1], qz = -Q[i + 2], qw = Q[i + 3];
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + (qy * tz - qz * ty); out[1] = vy + qw * ty + (qz * tx - qx * tz); out[2] = vz + qw * tz + (qx * ty - qy * tx);
}
function drehQ(q, p, ox, oy, oz) {
  const qx = q[p], qy = q[p + 1], qz = q[p + 2], qw = q[p + 3];
  q[p] += 0.5 * (ox * qw + oy * qz - oz * qy);
  q[p + 1] += 0.5 * (oy * qw + oz * qx - ox * qz);
  q[p + 2] += 0.5 * (oz * qw + ox * qy - oy * qx);
  q[p + 3] += 0.5 * (-ox * qx - oy * qy - oz * qz);
  const l = Math.hypot(q[p], q[p + 1], q[p + 2], q[p + 3]); q[p] /= l; q[p + 1] /= l; q[p + 2] /= l; q[p + 3] /= l;
}
function wGeschw(q, qp, p, h, out, o) {
  const ax = q[p], ay = q[p + 1], az = q[p + 2], aw = q[p + 3];
  const bx = -qp[p], by = -qp[p + 1], bz = -qp[p + 2], bw = qp[p + 3];
  const dx = aw * bx + ax * bw + ay * bz - az * by, dy = aw * by - ax * bz + ay * bw + az * bx, dz = aw * bz + ax * by - ay * bx + az * bw;
  const sg = (aw * bw - ax * bx - ay * by - az * bz) < 0 ? -1 : 1;
  out[o] = 2 * dx * sg / h; out[o + 1] = 2 * dy * sg / h; out[o + 2] = 2 * dz * sg / h;
}

const WUERFEL_ID = -2, FEST = -1;

export class KloetzeBlock {
  constructor(lagen, b, { dichte = 650, reib = 0.8, festigkeit = 0.05, riss = 0.5, gedaechtnis = 0.004, schutt = 0.125, bruchEnergie = 0.1, druck = 1, pendel, gitter }) {
    const n = this.n = lagen.length;
    this.b = b; this.h2 = b / 2;
    this.m = dichte * b ** 3; this.im = 1 / this.m; this.iI = 6 / (this.m * b * b);
    this.reib = reib; this.fest = festigkeit; this.riss = riss; this.tau = gedaechtnis; this.schuttFaktor = schutt; this.bruchEnergie = bruchEnergie; this.druckFaktor = druck;
    this.x = new Float64Array(3 * n); this.xp = new Float64Array(3 * n); this.v = new Float64Array(3 * n);
    this.q = new Float64Array(4 * n); this.qp = new Float64Array(4 * n); this.w = new Float64Array(3 * n);
    this.vAlt = new Float64Array(3 * n); this.xAlt = new Float64Array(3 * n);
    this.zust = new Uint8Array(n);                 // 0 im Würfel, 1 lose, 2 lose & liegt still
    this.ruhig = new Float32Array(n);
    this.schaden = new Float64Array(n);
    this.gedrueckt = new Int32Array(n).fill(-9); this.sz = 0;
    this.imKontakt = new Uint8Array(n); this.maxAuf = 1.2;
    this.lose = [];
    lagen.forEach((p, i) => { this.x.set(p, 3 * i); this.q[4 * i + 3] = 1; });
    // Gitter (für Nachbarn im Würfel)
    const g = this.g = gitter;
    this.gi = new Int32Array(3 * n);
    this.zelle = new Int32Array(g.n ** 3).fill(-1);
    lagen.forEach((p, i) => {
      const I = Math.round((p[0] - g.x0) / b - 0.5), J = Math.round((p[1] - g.y0) / b - 0.5), K = Math.round((p[2] - g.z0) / b - 0.5);
      this.gi[3 * i] = I; this.gi[3 * i + 1] = J; this.gi[3 * i + 2] = K;
      this.zelle[(I * g.n + J) * g.n + K] = i;
    });
    // der Würfel als ein Körper: Bezugspunkt = Schwerpunkt am Anfang
    let sx = 0, sy = 0, sz = 0; lagen.forEach(p => { sx += p[0]; sy += p[1]; sz += p[2]; });
    const W = this.W = { X: [sx / n, sy / n, sz / n], XP: [0, 0, 0], V: [0, 0, 0], Q: new Float64Array([0, 0, 0, 1]), QP: new Float64Array([0, 0, 0, 1]), Wv: new Float64Array(3), anzahl: n };
    W.X0 = W.X.slice();
    this.lo = new Float64Array(3 * n);
    lagen.forEach((p, i) => { this.lo[3 * i] = p[0] - W.X[0]; this.lo[3 * i + 1] = p[1] - W.X[1]; this.lo[3 * i + 2] = p[2] - W.X[2]; });
    this.wMasse();
    // Ecken des ganzen Würfels (für den Boden)
    const a = g.n * b;
    this.wEcken = [];
    for (const ex of [g.x0, g.x0 + a]) for (const ez of [g.z0, g.z0 + a]) this.wEcken.push([ex - W.X[0], g.y0 - W.X[1], ez - W.X[2]]);
    // Pendel
    const P = this.P = { ...pendel };
    P.I = P.m * (P.L * P.L + P.l * P.l / 12);
    P.phi = P.start; P.om = 0; P.phiP = P.phi;
    this.neueBrueche = 0; this.rammeStoss = 0; this.rammeVorher = false; this.bruchOrt = [0, 0, 0];
    this._a = [0, 0, 0]; this._b = [0, 0, 0]; this._c = [0, 0, 0]; this._d = [0, 0, 0]; this._e = [0, 0, 0];
    this.rk = [];
    this.bruchListe = [];
  }
  wMasse() { const W = this.W; W.M = Math.max(1, W.anzahl) * this.m; W.iM = 0; W.iI = 0; }   // heiler Würfel steht fest auf dem Boden
  rammeLage() {
    const P = this.P, s = Math.sin(P.phi), c = Math.cos(P.phi);
    return { mx: P.dreh[0] + s * P.L, my: P.dreh[1] - c * P.L, ax: c, ay: s, hl: P.l / 2 - P.r };
  }
  // Weltlage aller Würfel-Klötzchen aus der Lage des Würfels
  wuerfelNachKloetze() {
    const W = this.W, Q = W.Q, c = this._a;
    for (let i = 0; i < this.n; i++) {
      if (this.zust[i] !== 0) continue;
      dreh(Q, 0, this.lo[3 * i], this.lo[3 * i + 1], this.lo[3 * i + 2], c);
      this.x[3 * i] = W.X[0] + c[0]; this.x[3 * i + 1] = W.X[1] + c[1]; this.x[3 * i + 2] = W.X[2] + c[2];
      this.q[4 * i] = Q[0]; this.q[4 * i + 1] = Q[1]; this.q[4 * i + 2] = Q[2]; this.q[4 * i + 3] = Q[3];
    }
  }

  lage(i) {
    if (this.zust[i] !== 0) return;
    const W = this.W, Q = W.Q, c = this._e;
    dreh(Q, 0, this.lo[3 * i], this.lo[3 * i + 1], this.lo[3 * i + 2], c);
    this.x[3 * i] = W.X[0] + c[0]; this.x[3 * i + 1] = W.X[1] + c[1]; this.x[3 * i + 2] = W.X[2] + c[2];
    this.q[4 * i] = Q[0]; this.q[4 * i + 1] = Q[1]; this.q[4 * i + 2] = Q[2]; this.q[4 * i + 3] = Q[3];
  }
  // ---------- Körper-Zugriff: id >= 0 loses Klötzchen, -2 Würfel, -1 fest ----------
  invM(id) { return id >= 0 ? (this.zust[id] === 1 ? this.im : 0) : id === WUERFEL_ID ? this.W.iM : 0; }
  invI(id) { return id >= 0 ? (this.zust[id] === 1 ? this.iI : 0) : id === WUERFEL_ID ? this.W.iI : 0; }
  wGen(id, r, nx, ny, nz) {
    const im = this.invM(id); if (im === 0) return 0;
    const cx = r[1] * nz - r[2] * ny, cy = r[2] * nx - r[0] * nz, cz = r[0] * ny - r[1] * nx;
    return im + this.invI(id) * (cx * cx + cy * cy + cz * cz);
  }
  schiebe(id, r, px, py, pz) {
    const im = this.invM(id); if (im === 0) return;
    const iI = this.invI(id);
    const ox = iI * (r[1] * pz - r[2] * py), oy = iI * (r[2] * px - r[0] * pz), oz = iI * (r[0] * py - r[1] * px);
    if (id >= 0) { const o = 3 * id; this.x[o] += px * im; this.x[o + 1] += py * im; this.x[o + 2] += pz * im; drehQ(this.q, 4 * id, ox, oy, oz); }
    else { const W = this.W; W.X[0] += px * im; W.X[1] += py * im; W.X[2] += pz * im; drehQ(W.Q, 0, ox, oy, oz); }
  }
  mitte(id) { return id >= 0 ? [this.x[3 * id], this.x[3 * id + 1], this.x[3 * id + 2]] : this.W.X; }
  // Lageänderung eines Körperpunkts (für die Reibung)
  punktWeg(id, r, out) {
    const c = this._e;
    if (id === FEST || this.invM(id) === 0) { out[0] = out[1] = out[2] = 0; return; }
    if (id >= 0) {
      const o = 3 * id;
      drehZurueck(this.q, 4 * id, r[0], r[1], r[2], c); dreh(this.qp, 4 * id, c[0], c[1], c[2], c);
      out[0] = this.x[o] + r[0] - this.xp[o] - c[0]; out[1] = this.x[o + 1] + r[1] - this.xp[o + 1] - c[1]; out[2] = this.x[o + 2] + r[2] - this.xp[o + 2] - c[2];
    } else {
      const W = this.W;
      drehZurueck(W.Q, 0, r[0], r[1], r[2], c); dreh(W.QP, 0, c[0], c[1], c[2], c);
      out[0] = W.X[0] + r[0] - W.XP[0] - c[0]; out[1] = W.X[1] + r[1] - W.XP[1] - c[1]; out[2] = W.X[2] + r[2] - W.XP[2] - c[2];
    }
  }
  // Berührung zweier Körper: A wird entlang n verschoben, B entgegen. Gibt den Kraftstoß zurück.
  kontakt(A, ra, B, rb, nx, ny, nz, tiefe, reib = this.reib) {
    // tiefe Überlappungen nur langsam auflösen (sonst schießen Klötzchen davon)
    tiefe = Math.min(tiefe, this.maxAuf * this.h);
    if (A >= 0 && this.zust[A] === 1) this.imKontakt[A] = 1;
    if (B >= 0 && this.zust[B] === 1) this.imKontakt[B] = 1;
    const wA = this.wGen(A, ra, nx, ny, nz), wB = this.wGen(B, rb, nx, ny, nz);
    if (wA + wB === 0) return 0;
    const lam = tiefe / (wA + wB);
    this.schiebe(A, ra, nx * lam, ny * lam, nz * lam);
    this.schiebe(B, rb, -nx * lam, -ny * lam, -nz * lam);
    if (reib > 0) {
      const da = this._c, db = this._d;
      this.punktWeg(A, ra, da); this.punktWeg(B, rb, db);
      let dx = da[0] - db[0], dy = da[1] - db[1], dz = da[2] - db[2];
      const dn = dx * nx + dy * ny + dz * nz; dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
      const dt = Math.hypot(dx, dy, dz);
      if (dt > 1e-10) {
        const tx = dx / dt, ty = dy / dt, tz = dz / dt;
        const wt = this.wGen(A, ra, tx, ty, tz) + this.wGen(B, rb, tx, ty, tz);
        if (wt > 0) {
          const lt = Math.min(dt / wt, reib * lam);
          this.schiebe(A, ra, -tx * lt, -ty * lt, -tz * lt);
          this.schiebe(B, rb, tx * lt, ty * lt, tz * lt);
        }
      }
    }
    return lam;
  }
  koerperVon(i) { return this.zust[i] === 0 ? WUERFEL_ID : i; }

  // ---------- Bild ----------
  schritt(dt, k) {
    const h = dt / k; this.h = h;
    this.vAlt.set(this.v); this.xAlt.set(this.x);
    this.wuerfelNachKloetze();
    this.paare();
    for (let s = 0; s < k; s++) this.teilschritt(h);
    if (this.haltPruefen) { this.haltPruefen = false; this.halt(); }
    this.wuerfelNachKloetze();
    this.einschlafen(dt);
  }
  // Klötzchen, die über heile Nachbarn nicht mehr mit dem Boden verbunden sind, fallen herunter
  halt() {
    const g = this.g, n = g.n, besucht = new Uint8Array(this.n), stapel = [];
    for (let i = 0; i < this.n; i++) if (this.zust[i] === 0 && this.gi[3 * i + 1] === 0) { besucht[i] = 1; stapel.push(i); }
    while (stapel.length) {
      const i = stapel.pop(), I = this.gi[3 * i], J = this.gi[3 * i + 1], K = this.gi[3 * i + 2];
      for (const [a, bb, e] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const A = I + a, B = J + bb, C = K + e;
        if (A < 0 || B < 0 || C < 0 || A >= n || B >= n || C >= n) continue;
        const j = this.zelle[(A * n + B) * n + C];
        if (j >= 0 && !besucht[j] && this.zust[j] === 0) { besucht[j] = 1; stapel.push(j); }
      }
    }
    let fiel = 0;
    for (let i = 0; i < this.n; i++) if (this.zust[i] === 0 && !besucht[i]) { this.loese(i); fiel++; }
    if (fiel) this.wMasse();
  }
  paare() {
    // Raster für lose Klötzchen
    const c = this.b * 1.9, x = this.x, H = new Map();
    const key = (a, b, d) => ((a + 256) * 512 + (b + 256)) * 512 + (d + 256);
    for (const i of this.lose) {
      const k = key(Math.floor(x[3 * i] / c), Math.floor(x[3 * i + 1] / c), Math.floor(x[3 * i + 2] / c));
      let l = H.get(k); if (!l) H.set(k, l = []); l.push(i);
    }
    const out = [], d2 = (this.b * 1.85) ** 2;
    for (const i of this.lose) {
      if (this.zust[i] !== 1) continue;
      const cx = Math.floor(x[3 * i] / c), cy = Math.floor(x[3 * i + 1] / c), cz = Math.floor(x[3 * i + 2] / c);
      for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let e = -1; e <= 1; e++) {
        const l = H.get(key(cx + a, cy + bb, cz + e)); if (!l) continue;
        for (const j of l) {
          if (j === i || (this.zust[j] === 1 && j < i)) continue;
          const dx = x[3 * j] - x[3 * i], dy = x[3 * j + 1] - x[3 * i + 1], dz = x[3 * j + 2] - x[3 * i + 2];
          if (dx * dx + dy * dy + dz * dz < d2) out.push(i, j);
        }
      }
    }
    this.paarListe = out;
    // Kandidaten für das Pendel
    const R = this.rammeLage(), P = this.P, kand = [];
    const segs = [[R.mx - R.ax * R.hl, R.my - R.ay * R.hl, R.mx + R.ax * R.hl, R.my + R.ay * R.hl, P.r + this.b + 0.04],
      [R.mx, R.my, P.dreh[0] + (R.mx - P.dreh[0]) * 0.8, P.dreh[1] + (R.my - P.dreh[1]) * 0.8, this.b + 0.04]];
    const nahe = (px, py, pz) => { for (const [x0, y0, x1, y1, r] of segs) { const sx = x1 - x0, sy = y1 - y0; let t = ((px - x0) * sx + (py - y0) * sy) / (sx * sx + sy * sy); t = Math.max(0, Math.min(1, t)); const dx = px - x0 - sx * t, dy = py - y0 - sy * t; if (dx * dx + dy * dy + pz * pz < r * r) return true; } return false; };
    for (let i = 0; i < this.n; i++) if (nahe(x[3 * i], x[3 * i + 1], x[3 * i + 2])) kand.push(i);
    this.rammeKand = kand;
  }
  // Würfel-Klötzchen in der Nähe eines Weltpunkts
  wuerfelNahe(px, py, pz, r) {
    const W = this.W, l = this._b, g = this.g, b = this.b, res = [];
    drehZurueck(W.Q, 0, px - W.X[0], py - W.X[1], pz - W.X[2], l);
    // zurück in Gitter-Koordinaten (Gitter liegt im Würfel-Raum fest)
    const I = Math.floor((l[0] + W.X0[0] - g.x0) / b), J = Math.floor((l[1] + W.X0[1] - g.y0) / b), K = Math.floor((l[2] + W.X0[2] - g.z0) / b);
    for (let a = -r; a <= r; a++) for (let bb = -r; bb <= r; bb++) for (let e = -r; e <= r; e++) {
      const A = I + a, B = J + bb, C = K + e;
      if (A < 0 || B < 0 || C < 0 || A >= g.n || B >= g.n || C >= g.n) continue;
      const j = this.zelle[(A * g.n + B) * g.n + C];
      if (j >= 0 && this.zust[j] === 0) res.push(j);
    }
    return res;
  }
  teilschritt(h) {
    const { x, xp, v, q, qp, w } = this, P = this.P, W = this.W;
    this.sz++;
    for (const i of this.lose) {
      if (this.zust[i] !== 1) continue;
      const o = 3 * i, p = 4 * i;
      v[o + 1] -= G * h;
      xp[o] = x[o]; xp[o + 1] = x[o + 1]; xp[o + 2] = x[o + 2];
      x[o] += v[o] * h; x[o + 1] += v[o + 1] * h; x[o + 2] += v[o + 2] * h;
      qp[p] = q[p]; qp[p + 1] = q[p + 1]; qp[p + 2] = q[p + 2]; qp[p + 3] = q[p + 3];
      drehQ(q, p, w[o] * h, w[o + 1] * h, w[o + 2] * h);
    }
    W.XP[0] = W.X[0]; W.XP[1] = W.X[1]; W.XP[2] = W.X[2]; W.QP.set(W.Q);
    P.om += -G * P.m * P.L * Math.sin(P.phi) / P.I * h;
    P.phiP = P.phi; P.phi += P.om * h;
    const abkl = Math.exp(-h / this.tau);
    for (let i = 0; i < this.n; i++) this.schaden[i] *= abkl;

    for (const i of this.lose) if (this.zust[i] === 1 && x[3 * i + 1] < this.h2 * 1.8) this.boden(i);
    const pl = this.paarListe;
    for (let k = 0; k < pl.length; k += 2) { this.ecken(pl[k], pl[k + 1]); this.ecken(pl[k + 1], pl[k]); }
    for (const i of this.lose) if (this.zust[i] === 1) this.wand(i);
    this.ramme();

    // Geschwindigkeiten
    for (const i of this.lose) {
      if (this.zust[i] !== 1) continue;
      const o = 3 * i;
      v[o] = (x[o] - xp[o]) / h; v[o + 1] = (x[o + 1] - xp[o + 1]) / h; v[o + 2] = (x[o + 2] - xp[o + 2]) / h;
      wGeschw(q, qp, 4 * i, h, w, o);
      const sp = Math.hypot(v[o], v[o + 1], v[o + 2]);
      if (sp > 2.6) { v[o] *= 2.6 / sp; v[o + 1] *= 2.6 / sp; v[o + 2] *= 2.6 / sp; }
      // Klötzchen, die aufliegen, verlieren schnell Schwung (Holz auf Holz rutscht nicht ewig)
      const kd = this.imKontakt[i] ? 1 - 6 * h : 1, kw = this.imKontakt[i] ? 1 - 12 * h : 1;
      this.imKontakt[i] = 0;
      const dl = (1 - 0.1 * h) * kd, da = (1 - 0.6 * h) * kw;
      const ws = Math.hypot(w[o], w[o + 1], w[o + 2]);
      if (ws > 14) { w[o] *= 14 / ws; w[o + 1] *= 14 / ws; w[o + 2] *= 14 / ws; }
      v[o] *= dl; v[o + 1] *= dl; v[o + 2] *= dl; w[o] *= da; w[o + 1] *= da; w[o + 2] *= da;
    }
    P.om = (P.phi - P.phiP) / h;
    this.abprall();
    this.brechen();
  }
  boden(i) {
    const { x, q } = this, h2 = this.h2, c = this._a, o = 3 * i;
    for (let s = 0; s < 8; s++) {
      dreh(q, 4 * i, s & 1 ? h2 : -h2, s & 2 ? h2 : -h2, s & 4 ? h2 : -h2, c);
      const y = x[o + 1] + c[1];
      if (y < 0) this.kontakt(i, [c[0], c[1], c[2]], FEST, null, 0, 1, 0, -y);
    }
  }
  // Ecken von a gegen die zugewandte Fläche von b (a oder b darf im Würfel stecken)
  ecken(a, b) {
    const { x, q } = this, h2 = this.h2, c = this._a, l = this._b, axv = this._d;
    if (this.zust[a] !== 1 && this.zust[b] !== 1) return;   // mindestens einer muss sich bewegen
    this.lage(a); this.lage(b);
    const oa = 3 * a, ob = 3 * b;
    drehZurueck(q, 4 * b, x[oa] - x[ob], x[oa + 1] - x[ob + 1], x[oa + 2] - x[ob + 2], l);
    let achse = 0; if (Math.abs(l[1]) > Math.abs(l[achse])) achse = 1; if (Math.abs(l[2]) > Math.abs(l[achse])) achse = 2;
    const sg = l[achse] >= 0 ? 1 : -1;
    const nl = [0, 0, 0]; nl[achse] = sg;
    dreh(q, 4 * b, nl[0], nl[1], nl[2], axv);
    const nx = axv[0], ny = axv[1], nz = axv[2], rand = h2 * 1.02, u = (achse + 1) % 3, vv = (achse + 2) % 3;
    const A = this.koerperVon(a), B = this.koerperVon(b);
    const ma = this.mitte(A), mb = this.mitte(B);
    for (let s = 0; s < 8; s++) {
      dreh(q, 4 * a, s & 1 ? h2 : -h2, s & 2 ? h2 : -h2, s & 4 ? h2 : -h2, c);
      const px = x[oa] + c[0], py = x[oa + 1] + c[1], pz = x[oa + 2] + c[2];
      drehZurueck(q, 4 * b, px - x[ob], py - x[ob + 1], pz - x[ob + 2], l);
      const tiefe = h2 - l[achse] * sg;
      if (tiefe <= 0 || tiefe > h2) continue;
      if (Math.abs(l[u]) > rand || Math.abs(l[vv]) > rand) continue;
      // ruhendes Klötzchen wird bei kräftigem Stoß wieder beweglich
      if (this.zust[b] === 2 && tiefe > this.b * 0.06) this.wecke(b);
      if (this.zust[a] === 2 && tiefe > this.b * 0.06) this.wecke(a);
      // Druck des Pendels geht durch den Schutt weiter
      if (this.zust[a] === 1 && this.zust[b] === 1) {
        if (this.gedrueckt[a] >= this.sz - 1) this.gedrueckt[b] = Math.max(this.gedrueckt[b], this.sz - 1);
        else if (this.gedrueckt[b] >= this.sz - 1) this.gedrueckt[a] = Math.max(this.gedrueckt[a], this.sz - 1);
      }
      // Schutt, den das Pendel vor sich herschiebt, bricht festes Klötzchen heraus, solange das Pendel Schwung hat
      if (tiefe > this.b * 0.12) {
        if (this.zust[b] === 0 && this.gedrueckt[a] >= this.sz - 1 && this.zahle()) { this.schaden[b] = this.fest * 1.6; this.bruchListe.push(b, -nx, -ny, -nz); this.loese(b); }
        else if (this.zust[a] === 0 && this.zust[b] === 1 && this.gedrueckt[b] >= this.sz - 1 && this.zahle()) { this.schaden[a] = this.fest * 1.6; this.bruchListe.push(a, nx, ny, nz); this.loese(a); }
      }
      const lam = this.kontakt(this.koerperVon(a), [px - ma[0], py - ma[1], pz - ma[2]], this.koerperVon(b), [px - mb[0], py - mb[1], pz - mb[2]], nx, ny, nz, tiefe);
      // Schutt, den das Pendel gerade vor sich herschiebt, drückt mit der Kraft des Pendels auf den Würfel
      if (this.zust[b] === 0 && this.gedrueckt[a] >= this.sz - 1) this.belaste(b, lam * this.druckFaktor, -nx, -ny, -nz);
      if (this.zust[a] === 0 && this.zust[b] === 1 && this.gedrueckt[b] >= this.sz - 1) this.belaste(a, lam * this.druckFaktor, nx, ny, nz);
      // Schaden am Würfel nur durch echten Aufprall (Masse × Aufprall-Tempo), nicht durch Überlappung
      if (this.zust[b] === 0 && this.zust[a] === 1) { const an = -(this.v[oa] * nx + this.v[oa + 1] * ny + this.v[oa + 2] * nz); if (an > 0.4) this.belaste(b, this.m * an * this.h * this.schuttFaktor, -nx, -ny, -nz); }
      if (this.zust[a] === 0 && this.zust[b] === 1) { const an = this.v[ob] * nx + this.v[ob + 1] * ny + this.v[ob + 2] * nz; if (an > 0.4) this.belaste(a, this.m * an * this.h * this.schuttFaktor, nx, ny, nz); }
      this.lage(a); this.lage(b);
    }
  }
  // Losreißen kostet Schwung; ohne genug Schwung gelingt es nicht
  zahle(immer = false) {
    const P = this.P, E = 0.5 * P.I * P.om * P.om;
    if (!immer && E < this.bruchEnergie * 1.5) return false;
    const neu = Math.max(0, E - this.bruchEnergie), k = E > 0 ? Math.sqrt(neu / E) : 0;
    P.phi = P.phiP + (P.phi - P.phiP) * k; P.om *= k;
    return true;
  }
  // loses Klötzchen gegen den festen Würfel: jede Ecke, die in einer belegten Gitterzelle steckt,
  // wird zur nächsten FREIEN Zellenseite hinausgeschoben (nie in einen Nachbarn hinein)
  wand(i) {
    const { x, q } = this, g = this.g, b = this.b, h2 = this.h2, c = this._a, W = this.W, o = 3 * i, n = g.n;
    const lx = x[o] - g.x0, ly = x[o + 1] - g.y0, lz = x[o + 2] - g.z0, rand = h2 * 1.8;
    if (lx < -rand || ly < -rand || lz < -rand || lx > n * b + rand || ly > n * b + rand || lz > n * b + rand) return;
    const belegt = (I, J, K) => { if (I < 0 || J < 0 || K < 0 || I >= n || J >= n || K >= n) return -1; const j = this.zelle[(I * n + J) * n + K]; return j >= 0 && this.zust[j] === 0 ? j : -1; };
    for (let s = 0; s < 8; s++) {
      dreh(q, 4 * i, s & 1 ? h2 : -h2, s & 2 ? h2 : -h2, s & 4 ? h2 : -h2, c);
      const px = x[o] + c[0], py = x[o + 1] + c[1], pz = x[o + 2] + c[2];
      const fx = (px - g.x0) / b, fy = (py - g.y0) / b, fz = (pz - g.z0) / b;
      const I = Math.floor(fx), J = Math.floor(fy), K = Math.floor(fz);
      const j = belegt(I, J, K); if (j < 0) continue;
      const seiten = [[fx - I, -1, 0, 0, I - 1, J, K], [I + 1 - fx, 1, 0, 0, I + 1, J, K], [fy - J, 0, -1, 0, I, J - 1, K], [J + 1 - fy, 0, 1, 0, I, J + 1, K], [fz - K, 0, 0, -1, I, J, K - 1], [K + 1 - fz, 0, 0, 1, I, J, K + 1]];
      let best = null;
      for (const sd of seiten) if (belegt(sd[4], sd[5], sd[6]) < 0 && (!best || sd[0] < best[0])) best = sd;
      if (!best) continue;
      const tiefe = best[0] * b, nx = best[1], ny = best[2], nz = best[3];
      if (tiefe > h2) continue;
      // vom Pendel geschobener Schutt bricht das Klötzchen heraus (kostet Schwung)
      if (tiefe > b * 0.12 && this.gedrueckt[i] >= this.sz - 1 && this.zahle()) { this.schaden[j] = this.fest * 1.6; this.bruchListe.push(j, -nx, -ny, -nz); this.loese(j); continue; }
      const an = -(this.v[o] * nx + this.v[o + 1] * ny + this.v[o + 2] * nz);
      this.kontakt(i, [c[0], c[1], c[2]], WUERFEL_ID, [px - W.X[0], py - W.X[1], pz - W.X[2]], nx, ny, nz, tiefe);
      if (an > 0.4) this.belaste(j, this.m * an * this.h * this.schuttFaktor, -nx, -ny, -nz);
    }
  }
  belaste(i, lam, dx, dy, dz) {
    const s = lam / this.h;
    this.schaden[i] += s;
    if (this.schaden[i] > this.fest) this.bruchListe.push(i, dx, dy, dz);
  }
  wecke(i) { if (this.zust[i] === 2) { this.zust[i] = 1; this.ruhig[i] = 0; } }
  // Pendel gegen Klötzchen (Kapsel und Stange)
  ramme() {
    const P = this.P, R = this.rammeLage();
    const st = { mx: (R.mx + P.dreh[0]) / 2, my: (R.my + P.dreh[1]) / 2, ax: (R.mx - P.dreh[0]) / P.L, ay: (R.my - P.dreh[1]) / P.L, hl: P.L / 2 };
    let beruehrt = false;
    this.rk.length = 0;
    for (const i of this.rammeKand) {
      if (this.kapsel(i, R.mx, R.my, R.ax, R.ay, R.hl, P.r)) beruehrt = true;
      if (this.zust[i] !== 0 || this.W) this.kapsel(i, st.mx, st.my, st.ax, st.ay, st.hl, P.stangeR);
    }
    if (beruehrt && !this.rammeVorher) this.rammeStoss = Math.max(this.rammeStoss, Math.abs(P.om) * P.L);
    this.rammeVorher = beruehrt;
  }
  kapsel(i, mx, my, ax, ay, hl, r) {
    this.lage(i);
    const { x, q } = this, h2 = this.h2, l = this._b, c = this._a, o = 3 * i, P = this.P;
    let t = (x[o] - mx) * ax + (x[o + 1] - my) * ay; t = Math.max(-hl, Math.min(hl, t));
    let sx = mx + ax * t, sy = my + ay * t;
    for (let it = 0; it < 2; it++) {
      drehZurueck(q, 4 * i, sx - x[o], sy - x[o + 1], -x[o + 2], l);
      dreh(q, 4 * i, Math.max(-h2, Math.min(h2, l[0])), Math.max(-h2, Math.min(h2, l[1])), Math.max(-h2, Math.min(h2, l[2])), c);
      t = (x[o] + c[0] - mx) * ax + (x[o + 1] + c[1] - my) * ay; t = Math.max(-hl, Math.min(hl, t));
      sx = mx + ax * t; sy = my + ay * t;
    }
    drehZurueck(q, 4 * i, sx - x[o], sy - x[o + 1], -x[o + 2], l);
    const innen = Math.abs(l[0]) < h2 && Math.abs(l[1]) < h2 && Math.abs(l[2]) < h2;
    dreh(q, 4 * i, Math.max(-h2, Math.min(h2, l[0])), Math.max(-h2, Math.min(h2, l[1])), Math.max(-h2, Math.min(h2, l[2])), c);
    const px = x[o] + c[0], py = x[o + 1] + c[1], pz = x[o + 2] + c[2];
    let nx = px - sx, ny = py - sy, nz = pz, d = Math.hypot(nx, ny, nz);
    if (innen || d < 1e-8) { nx = x[o] - sx; ny = x[o + 1] - sy; nz = x[o + 2]; const dd = Math.hypot(nx, ny, nz) || 1; nx /= dd; ny /= dd; nz /= dd; d = 0; }
    else { nx /= d; ny /= d; nz /= d; }
    const tiefe = r - d;
    if (tiefe <= 0) return false;
    if (this.zust[i] === 2) this.wecke(i);
    const kr0 = (px - P.dreh[0]) * ny - (py - P.dreh[1]) * nx;
    if (this.zust[i] === 0) {
      // Stoß, den das feste Klötzchen aushalten müsste, um das Pendel hier aufzuhalten
      const stoss = tiefe / (kr0 * kr0 / P.I + 1e-12) / this.h;
      this.schaden[i] += Math.min(stoss, 50);
      if (this.schaden[i] > this.fest) {
        this.bruchListe.push(i, nx, ny, nz);
        this.loese(i);
        this.zahle(true);
      }
    }
    const B = this.koerperVon(i), mb = this.mitte(B);
    const rb = [px - mb[0], py - mb[1], pz - mb[2]];
    const kreuz = (px - P.dreh[0]) * ny - (py - P.dreh[1]) * nx;
    const wP = kreuz * kreuz / P.I, wB = this.wGen(B, rb, nx, ny, nz);
    // lose Klötzchen höchstens so schnell wegschieben, wie sich der Stein in diese Richtung bewegt (kein Wegschießen)
    const tief2 = B >= 0 ? Math.min(tiefe, (Math.abs(P.om * kreuz) + 0.3) * this.h) : tiefe;
    const lam = tief2 / (wB + wP);
    this.schiebe(B, rb, nx * lam, ny * lam, nz * lam);
    P.phi -= lam * kreuz / P.I;
    if (this.zust[i] === 0) this.lage(i); else this.gedrueckt[i] = this.sz;
    if (r > 0.02) {
      const vb = this.punktTempo(B, rb, nx, ny, nz);
      this.rk.push(i, nx, ny, nz, kreuz, vb, P.om * kreuz);
    }
    return true;
  }
  punktTempo(B, r, nx, ny, nz) {
    if (B >= 0) { const o = 3 * B, w = this.w; return (this.v[o] + w[o + 1] * r[2] - w[o + 2] * r[1]) * nx + (this.v[o + 1] + w[o + 2] * r[0] - w[o] * r[2]) * ny + (this.v[o + 2] + w[o] * r[1] - w[o + 1] * r[0]) * nz; }
    const W = this.W, w = W.Wv; return (W.V[0] + w[1] * r[2] - w[2] * r[1]) * nx + (W.V[1] + w[2] * r[0] - w[0] * r[2]) * ny + (W.V[2] + w[0] * r[1] - w[1] * r[0]) * nz;
  }
  // nach dem Teilschritt: Stein federt etwas zurück
  abprall() {
    const K = this.rk, P = this.P;
    const erledigt = new Set();
    for (let k = 0; k < K.length; k += 7) {
      const i = K[k], nx = K[k + 1], ny = K[k + 2], nz = K[k + 3], kreuz = K[k + 4], vbAlt = K[k + 5], vpAlt = K[k + 6];
      const B = this.koerperVon(i);
      if (B !== WUERFEL_ID) continue;              // nur vom festen Würfel federt der Stein zurück
      if (erledigt.has('w')) continue; erledigt.add('w');
      const anAlt = vpAlt - vbAlt;
      if (anAlt < 0.25) continue;
      const mb = this.mitte(B), o = 3 * i;
      const rb = [this.x[o] - mb[0], this.x[o + 1] - mb[1], this.x[o + 2] - mb[2]];
      const jetzt = P.om * kreuz - this.punktTempo(B, rb, nx, ny, nz), ziel = -P.abprall * anAlt;
      if (jetzt <= ziel) continue;
      const wP = kreuz * kreuz / P.I, wB = this.wGen(B, rb, nx, ny, nz);
      const J = (jetzt - ziel) / (wP + wB);
      P.om -= J * kreuz / P.I;
      const im = this.invM(B), iI = this.invI(B);
      const ox = iI * (rb[1] * nz - rb[2] * ny) * J, oy = iI * (rb[2] * nx - rb[0] * nz) * J, oz = iI * (rb[0] * ny - rb[1] * nx) * J;
      if (B >= 0) { this.v[o] += J * nx * im; this.v[o + 1] += J * ny * im; this.v[o + 2] += J * nz * im; this.w[o] += ox; this.w[o + 1] += oy; this.w[o + 2] += oz; }
      else { const W = this.W; W.V[0] += J * nx * im; W.V[1] += J * ny * im; W.V[2] += J * nz * im; W.Wv[0] += ox; W.Wv[1] += oy; W.Wv[2] += oz; }
    }
  }
  // überlastete Würfel-Klötzchen brechen heraus; Überschuss läuft als Riss weiter
  brechen() {
    const L = this.bruchListe; if (!L.length) return;
    const g = this.g, W = this.W;
    const schlange = [];
    for (let k = 0; k < L.length; k += 4) schlange.push([L[k], L[k + 1], L[k + 2], L[k + 3]]);
    L.length = 0;
    while (schlange.length) {
      const [i, dx, dy, dz] = schlange.shift();
      if (this.schaden[i] <= this.fest) continue;
      const ueber = Math.min(this.schaden[i] - this.fest, this.fest * 6);
      this.schaden[i] = 0;
      if (this.zust[i] === 0) this.loese(i);
      // Riss zu den Nachbarn (Richtung im Würfel-Raum)
      const l = this._c; drehZurueck(W.Q, 0, dx, dy, dz, l);
      const I = this.gi[3 * i], J = this.gi[3 * i + 1], K = this.gi[3 * i + 2];
      const ll = Math.hypot(l[0], l[1], l[2]) || 1;
      const nachb = [];
      let summe = 0;
      for (const [a, bb, e] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const A = I + a, B = J + bb, C = K + e;
        if (A < 0 || B < 0 || C < 0 || A >= g.n || B >= g.n || C >= g.n) continue;
        const j = this.zelle[(A * g.n + B) * g.n + C];
        if (j < 0 || this.zust[j] !== 0) continue;
        const gew = 0.3 + Math.max(0, (a * l[0] + bb * l[1] + e * l[2]) / ll);
        nachb.push([j, gew]); summe += gew;
      }
      // Überschuss wird verteilt (insgesamt weniger als ankam -> der Riss läuft sich tot)
      for (const [j, gew] of nachb) {
        this.schaden[j] += ueber * this.riss * gew / summe * Math.min(2, nachb.length);
        if (this.schaden[j] > this.fest && this.zust[j] === 0) schlange.push([j, dx, dy, dz]);
      }
    }
    this.wMasse();
    this.haltPruefen = true;
  }
  loese(i) {
    const W = this.W, o = 3 * i, p = 4 * i;
    this.lage(i);
    // Geschwindigkeit des Würfels an dieser Stelle übernehmen
    const rx = this.x[o] - W.X[0], ry = this.x[o + 1] - W.X[1], rz = this.x[o + 2] - W.X[2], w = W.Wv;
    this.v[o] = W.V[0] + w[1] * rz - w[2] * ry; this.v[o + 1] = W.V[1] + w[2] * rx - w[0] * rz; this.v[o + 2] = W.V[2] + w[0] * ry - w[1] * rx;
    this.w[o] = w[0]; this.w[o + 1] = w[1]; this.w[o + 2] = w[2];
    for (let k = 0; k < 3; k++) this.xp[o + k] = this.x[o + k] - this.v[o + k] * this.h;
    for (let k = 0; k < 4; k++) this.qp[p + k] = this.q[p + k];
    this.zust[i] = 1; this.lose.push(i); W.anzahl--;
    this.neueBrueche++; this.bruchOrt = [this.x[o], this.x[o + 1], this.x[o + 2]];
  }
  einschlafen(dt) {
    const v = this.v, w = this.w;
    for (const i of this.lose) {
      if (this.zust[i] !== 1) continue;
      const o = 3 * i;
      const s = v[o] * v[o] + v[o + 1] * v[o + 1] + v[o + 2] * v[o + 2] + (w[o] * w[o] + w[o + 1] * w[o + 1] + w[o + 2] * w[o + 2]) * this.b * this.b;
      this.ruhig[i] = s < 0.0025 ? this.ruhig[i] + dt : 0;
      if (this.ruhig[i] > 0.25) { this.zust[i] = 2; v[o] = v[o + 1] = v[o + 2] = 0; w[o] = w[o + 1] = w[o + 2] = 0; }
    }
  }
  stoesse() {
    const v = this.v, va = this.vAlt; let n = 0, summe = 0, sx = 0, sy = 0, sz = 0;
    for (const i of this.lose) {
      if (this.zust[i] !== 1) continue;
      const o = 3 * i;
      const dv = Math.hypot(v[o] - va[o], v[o + 1] - va[o + 1], v[o + 2] - va[o + 2]);
      const tempo = Math.max(Math.hypot(va[o], va[o + 1], va[o + 2]), Math.hypot(v[o], v[o + 1], v[o + 2]));
      if (dv > 0.5 && tempo > 0.5) { n++; summe += dv; sx += this.x[o]; sy += this.x[o + 1]; sz += this.x[o + 2]; }
    }
    return { n, mittel: n ? summe / n : 0, pos: n ? [sx / n, sy / n, sz / n] : [0, 0, 0] };
  }
}
