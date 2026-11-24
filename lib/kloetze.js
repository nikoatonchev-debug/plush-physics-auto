// Eigene Physik für viele kleine Würfel-Klötzchen + ein Pendel (Kapsel an einer Stange).
// Verfahren: Starrkörper mit Positions-Korrektur in kleinen Teilschritten (wie XPBD von Müller et al.).
// Würfel haben ein gleichmäßiges Trägheitsmoment, deshalb reicht eine Zahl statt einer Matrix.
// Klötzchen sind am Anfang „geklebt“ (unbeweglich). Das Pendel löst sie, solange es genug Wucht hat:
// jedes gelöste Klötzchen kostet Bewegungsenergie. Danach fliegen sie frei herum.
const G = 9.81;

// Drehung eines Vektors mit Quaternion q (x,y,z,w) aus Feld Q ab Index i
function dreh(Q, i, vx, vy, vz, out) {
  const qx = Q[i], qy = Q[i + 1], qz = Q[i + 2], qw = Q[i + 3];
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + (qy * tz - qz * ty);
  out[1] = vy + qw * ty + (qz * tx - qx * tz);
  out[2] = vz + qw * tz + (qx * ty - qy * tx);
}
function drehZurueck(Q, i, vx, vy, vz, out) {
  const qx = -Q[i], qy = -Q[i + 1], qz = -Q[i + 2], qw = Q[i + 3];
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + (qy * tz - qz * ty);
  out[1] = vy + qw * ty + (qz * tx - qx * tz);
  out[2] = vz + qw * tz + (qx * ty - qy * tx);
}

export class Kloetze {
  constructor(lagen, b, { dichte = 650, reib = 0.55, bruch = 0.4, vKrit = Infinity, zone = 0, pendel, gitter }) {
    const opt_vKrit = vKrit;
    const n = this.n = lagen.length;
    this.b = b; this.h2 = b / 2;
    this.m = dichte * b ** 3; this.im = 1 / this.m;
    this.iI = 6 / (this.m * b * b);
    this.reib = reib; this.bruch = bruch;
    this.x = new Float64Array(3 * n); this.xp = new Float64Array(3 * n); this.v = new Float64Array(3 * n);
    this.q = new Float64Array(4 * n); this.qp = new Float64Array(4 * n); this.w = new Float64Array(3 * n);
    this.vAlt = new Float64Array(3 * n); this.xAlt = new Float64Array(3 * n);
    this.zust = new Uint8Array(n);           // 0 geklebt, 1 frei, 2 liegt still (unbeweglich, nicht geklebt)
    this.ruhig = new Float32Array(n);
    this.klemm = new Int32Array(n).fill(-9); this.sz = 0; this.grund = {}; this._grund = '?';
    this.vKrit = opt_vKrit; this.zoneMax = zone; this.vMax = 4.5; this.vHoch = 2.2; this.zoneAb = 30; this.zoneBis = 500;
    lagen.forEach((p, i) => { this.x.set(p, 3 * i); this.q[4 * i + 3] = 1; });
    // Gitter der geklebten Klötzchen (für schnelle Nachbarsuche)
    this.gitter = gitter;                    // { n, x0, y0, z0 }
    this.zelle = new Int32Array(gitter.n ** 3).fill(-1);
    lagen.forEach((p, i) => { const g = this.gz(p[0], p[1], p[2]); if (g >= 0) this.zelle[g] = i; });
    this.frei = [];                           // Liste der freien Klötzchen
    this.liegend = [];
    // Pendel
    const P = this.P = { ...pendel };
    P.I = P.m * (P.L * P.L + P.l * P.l / 12);
    P.phi = P.start; P.om = 0; P.phiP = P.phi;
    this.neueBrueche = 0; this.kontaktRamme = 0; this.rammeVorher = false; this.rammeStoss = 0;
    this._a = [0, 0, 0]; this._b = [0, 0, 0]; this._c = [0, 0, 0];
    this.hash = new Map();
  }
  gz(x, y, z) {
    const g = this.gitter, b = this.b;
    const i = Math.floor((x - g.x0) / b), j = Math.floor((y - g.y0) / b), k = Math.floor((z - g.z0) / b);
    if (i < 0 || j < 0 || k < 0 || i >= g.n || j >= g.n || k >= g.n) return -1;
    return (i * g.n + j) * g.n + k;
  }
  loese(i) {
    if (this.zust[i] === 1) return;
    if (this.zust[i] === 0) { const g = this.gz(this.x[3 * i], this.x[3 * i + 1], this.x[3 * i + 2]); if (g >= 0 && this.zelle[g] === i) this.zelle[g] = -1; this.neueBrueche++; }
    else this.liegend.splice(this.liegend.indexOf(i), 1);
    this.zust[i] = 1; this.ruhig[i] = 0; this.frei.push(i); this.grund[this._grund] = (this.grund[this._grund] ?? 0) + 1;
    for (let k = 0; k < 3; k++) this.xp[3 * i + k] = this.x[3 * i + k];
    for (let k = 0; k < 4; k++) this.qp[4 * i + k] = this.q[4 * i + k];
  }
  // ---------- Pendel-Geometrie ----------
  rammeLage() {
    const P = this.P, s = Math.sin(P.phi), c = Math.cos(P.phi);
    const mx = P.dreh[0] + s * P.L, my = P.dreh[1] - c * P.L;
    return { mx, my, ax: c, ay: s, hl: P.l / 2 - P.r };
  }
  energie() { return 0.5 * this.P.I * this.P.om * this.P.om; }

  // ---------- ein Bild weiter (k Teilschritte) ----------
  schritt(dt, k) {
    const h = dt / k; this.h = h;
    this.vAlt.set(this.v); this.xAlt.set(this.x);
    this.paare();
    for (let s = 0; s < k; s++) this.teilschritt(h);
    this.einschlafen(dt);
  }
  paare() {
    // Raster für freie + liegende Klötzchen
    const H = this.hash; H.clear();
    const c = this.b * 1.8;
    const ein = i => { const key = Math.floor(this.x[3 * i] / c) + ',' + Math.floor(this.x[3 * i + 1] / c) + ',' + Math.floor(this.x[3 * i + 2] / c); let l = H.get(key); if (!l) H.set(key, l = []); l.push(i); };
    for (const i of this.frei) ein(i);
    for (const i of this.liegend) ein(i);
    const paare = [], d2 = (this.b * 1.85) ** 2;
    for (const i of this.frei) {
      const cx = Math.floor(this.x[3 * i] / c), cy = Math.floor(this.x[3 * i + 1] / c), cz = Math.floor(this.x[3 * i + 2] / c);
      for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let e = -1; e <= 1; e++) {
        const l = H.get((cx + a) + ',' + (cy + bb) + ',' + (cz + e)); if (!l) continue;
        for (const j of l) {
          if (j === i || (this.zust[j] === 1 && j < i)) continue;
          const dx = this.x[3 * j] - this.x[3 * i], dy = this.x[3 * j + 1] - this.x[3 * i + 1], dz = this.x[3 * j + 2] - this.x[3 * i + 2];
          if (dx * dx + dy * dy + dz * dz < d2) paare.push(i, j);
        }
      }
      // geklebte Nachbarn aus dem Gitter
      const g = this.gitter, b = this.b;
      const gi = Math.floor((this.x[3 * i] - g.x0) / b), gj = Math.floor((this.x[3 * i + 1] - g.y0) / b), gk = Math.floor((this.x[3 * i + 2] - g.z0) / b);
      for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let e = -1; e <= 1; e++) {
        const I = gi + a, J = gj + bb, K = gk + e;
        if (I < 0 || J < 0 || K < 0 || I >= g.n || J >= g.n || K >= g.n) continue;
        const j = this.zelle[(I * g.n + J) * g.n + K];
        if (j >= 0) paare.push(i, j);
      }
    }
    this.paarListe = paare;
  }
  teilschritt(h) {
    const { x, xp, v, q, qp, w } = this;
    this.sz++;
    for (const i of this.frei) {
      const o = 3 * i, p = 4 * i;
      v[o + 1] -= G * h;
      xp[o] = x[o]; xp[o + 1] = x[o + 1]; xp[o + 2] = x[o + 2];
      x[o] += v[o] * h; x[o + 1] += v[o + 1] * h; x[o + 2] += v[o + 2] * h;
      qp[p] = q[p]; qp[p + 1] = q[p + 1]; qp[p + 2] = q[p + 2]; qp[p + 3] = q[p + 3];
      const wx = w[o], wy = w[o + 1], wz = w[o + 2], qx = q[p], qy = q[p + 1], qz = q[p + 2], qw = q[p + 3];
      q[p] += 0.5 * h * (wx * qw + wy * qz - wz * qy);
      q[p + 1] += 0.5 * h * (wy * qw + wz * qx - wx * qz);
      q[p + 2] += 0.5 * h * (wz * qw + wx * qy - wy * qx);
      q[p + 3] += 0.5 * h * (-wx * qx - wy * qy - wz * qz);
      const l = Math.hypot(q[p], q[p + 1], q[p + 2], q[p + 3]); q[p] /= l; q[p + 1] /= l; q[p + 2] /= l; q[p + 3] /= l;
    }
    const P = this.P;
    P.om += -G * P.m * P.L * Math.sin(P.phi) / P.I * h;
    P.om *= 1 - P.daempf * h;
    P.phiP = P.phi; P.phi += P.om * h;
    // Berührungen
    for (const i of this.frei) this.boden(i);
    const pl = this.paarListe;
    for (let k = 0; k < pl.length; k += 2) this.kloetzchenPaar(pl[k], pl[k + 1]);
    this.ramme(h);
    // Geschwindigkeiten aus der Bewegung
    for (const i of this.frei) {
      const o = 3 * i, p = 4 * i;
      v[o] = (x[o] - xp[o]) / h; v[o + 1] = (x[o + 1] - xp[o + 1]) / h; v[o + 2] = (x[o + 2] - xp[o + 2]) / h;
      // dq = q * inv(qp)
      const ax = q[p], ay = q[p + 1], az = q[p + 2], aw = q[p + 3];
      const bx = -qp[p], by = -qp[p + 1], bz = -qp[p + 2], bw = qp[p + 3];
      let dx = aw * bx + ax * bw + ay * bz - az * by, dy = aw * by - ax * bz + ay * bw + az * bx, dz = aw * bz + ax * by - ay * bx + az * bw;
      const dw = aw * bw - ax * bx - ay * by - az * bz;
      const sg = dw < 0 ? -1 : 1;
      w[o] = 2 * dx * sg / h; w[o + 1] = 2 * dy * sg / h; w[o + 2] = 2 * dz * sg / h;
      if (v[o + 1] > this.vHoch) v[o + 1] = this.vHoch;
      const sp = Math.hypot(v[o], v[o + 1], v[o + 2]); if (sp > this.vMax) { v[o] *= this.vMax / sp; v[o + 1] *= this.vMax / sp; v[o + 2] *= this.vMax / sp; }
      const dmp = 1 - 0.4 * h;
      v[o] *= dmp; v[o + 1] *= dmp; v[o + 2] *= dmp; w[o] *= 1 - 1.5 * h; w[o + 1] *= 1 - 1.5 * h; w[o + 2] *= 1 - 1.5 * h;
    }
    if (this.rammeAbprall) P.om = -P.om * P.abprall;   // federt vom festen Würfel zurück
    this.rammeAbprall = false;
  }
  // Positions-Korrektur zwischen Körper A (frei) und B (frei oder fest); n zeigt von B nach A
  korrigiere(a, ra, b, rb, nx, ny, nz, tiefe, mitReib = true) {
    const { x, q, xp, qp } = this, im = this.im, iI = this.iI;
    const c = this._c;
    // generalisierte inverse Masse
    const ca = [ra[1] * nz - ra[2] * ny, ra[2] * nx - ra[0] * nz, ra[0] * ny - ra[1] * nx];
    let wA = im + iI * (ca[0] * ca[0] + ca[1] * ca[1] + ca[2] * ca[2]);
    let wB = 0, cb = null;
    if (b >= 0 && this.zust[b] === 1) {
      cb = [rb[1] * nz - rb[2] * ny, rb[2] * nx - rb[0] * nz, rb[0] * ny - rb[1] * nx];
      wB = im + iI * (cb[0] * cb[0] + cb[1] * cb[1] + cb[2] * cb[2]);
    }
    const lam = tiefe / (wA + wB);
    this.schiebe(a, ra, nx * lam, ny * lam, nz * lam);
    if (cb) this.schiebe(b, rb, -nx * lam, -ny * lam, -nz * lam);
    if (!mitReib) return;
    // Haftreibung: seitliches Rutschen des Berührpunkts zurücknehmen (begrenzt)
    const pa = [x[3 * a] + ra[0], x[3 * a + 1] + ra[1], x[3 * a + 2] + ra[2]];
    drehZurueck(q, 4 * a, ra[0], ra[1], ra[2], c); dreh(qp, 4 * a, c[0], c[1], c[2], c);
    let dx = pa[0] - (xp[3 * a] + c[0]), dy = pa[1] - (xp[3 * a + 1] + c[1]), dz = pa[2] - (xp[3 * a + 2] + c[2]);
    if (cb) {
      const pb = [x[3 * b] + rb[0], x[3 * b + 1] + rb[1], x[3 * b + 2] + rb[2]];
      drehZurueck(q, 4 * b, rb[0], rb[1], rb[2], c); dreh(qp, 4 * b, c[0], c[1], c[2], c);
      dx -= pb[0] - (xp[3 * b] + c[0]); dy -= pb[1] - (xp[3 * b + 1] + c[1]); dz -= pb[2] - (xp[3 * b + 2] + c[2]);
    }
    const dn = dx * nx + dy * ny + dz * nz;
    dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
    const dt = Math.hypot(dx, dy, dz);
    if (dt < 1e-9) return;
    const tx = dx / dt, ty = dy / dt, tz = dz / dt;
    const ta = [ra[1] * tz - ra[2] * ty, ra[2] * tx - ra[0] * tz, ra[0] * ty - ra[1] * tx];
    let wt = im + iI * (ta[0] * ta[0] + ta[1] * ta[1] + ta[2] * ta[2]);
    let tb = null;
    if (cb) { tb = [rb[1] * tz - rb[2] * ty, rb[2] * tx - rb[0] * tz, rb[0] * ty - rb[1] * tx]; wt += im + iI * (tb[0] * tb[0] + tb[1] * tb[1] + tb[2] * tb[2]); }
    let lt = dt / wt;
    const grenze = this.reib * lam;
    if (lt > grenze) lt = grenze;
    this.schiebe(a, ra, -tx * lt, -ty * lt, -tz * lt);
    if (cb) this.schiebe(b, rb, tx * lt, ty * lt, tz * lt);
  }
  schiebe(i, r, px, py, pz) {
    const { x, q, im, iI } = this, o = 3 * i, p = 4 * i;
    x[o] += px * im; x[o + 1] += py * im; x[o + 2] += pz * im;
    const ox = iI * (r[1] * pz - r[2] * py), oy = iI * (r[2] * px - r[0] * pz), oz = iI * (r[0] * py - r[1] * px);
    const qx = q[p], qy = q[p + 1], qz = q[p + 2], qw = q[p + 3];
    q[p] += 0.5 * (ox * qw + oy * qz - oz * qy);
    q[p + 1] += 0.5 * (oy * qw + oz * qx - ox * qz);
    q[p + 2] += 0.5 * (oz * qw + ox * qy - oy * qx);
    q[p + 3] += 0.5 * (-ox * qx - oy * qy - oz * qz);
    const l = Math.hypot(q[p], q[p + 1], q[p + 2], q[p + 3]); q[p] /= l; q[p + 1] /= l; q[p + 2] /= l; q[p + 3] /= l;
  }
  boden(i) {
    const { x, q } = this, h2 = this.h2, c = this._a;
    const o = 3 * i;
    if (x[o + 1] > h2 * 1.8) return;
    for (let s = 0; s < 8; s++) {
      dreh(q, 4 * i, s & 1 ? h2 : -h2, s & 2 ? h2 : -h2, s & 4 ? h2 : -h2, c);
      const y = x[o + 1] + c[1];
      if (y < 0) this.korrigiere(i, [c[0], c[1], c[2]], -1, null, 0, 1, 0, -y);
    }
  }
  // Ecken von A gegen die Fläche von B, die A zugewandt ist (und umgekehrt)
  kloetzchenPaar(a, b) {
    this.eckenGegen(a, b);
    if (this.zust[b] === 1) this.eckenGegen(b, a);
    else this.eckenGegen(b, a, true);
  }
  eckenGegen(a, b, umgekehrt = false) {
    // Ecken von a, Fläche von b. Wenn umgekehrt: b ist fest, Ecken des festen b drücken a weg.
    const { x, q } = this, h2 = this.h2, c = this._a, l = this._b, ax = this._c;
    const oa = 3 * a, ob = 3 * b;
    const dx = x[oa] - x[ob], dy = x[oa + 1] - x[ob + 1], dz = x[oa + 2] - x[ob + 2];
    // Achse von b, die am meisten zu a zeigt
    drehZurueck(q, 4 * b, dx, dy, dz, l);
    let achse = 0; if (Math.abs(l[1]) > Math.abs(l[achse])) achse = 1; if (Math.abs(l[2]) > Math.abs(l[achse])) achse = 2;
    const sg = l[achse] >= 0 ? 1 : -1;
    const nl = [0, 0, 0]; nl[achse] = sg;
    dreh(q, 4 * b, nl[0], nl[1], nl[2], ax);
    const nx = ax[0], ny = ax[1], nz = ax[2];
    const rand = h2 * 1.04;
    for (let s = 0; s < 8; s++) {
      dreh(q, 4 * a, s & 1 ? h2 : -h2, s & 2 ? h2 : -h2, s & 4 ? h2 : -h2, c);
      const px = x[oa] + c[0] - x[ob], py = x[oa + 1] + c[1] - x[ob + 1], pz = x[oa + 2] + c[2] - x[ob + 2];
      drehZurueck(q, 4 * b, px, py, pz, l);
      const tiefe = h2 - l[achse] * sg;
      if (tiefe <= 0 || tiefe > h2) continue;
      const u = (achse + 1) % 3, v = (achse + 2) % 3;
      if (Math.abs(l[u]) > rand || Math.abs(l[v]) > rand) continue;
      if (!umgekehrt) {
        const rb = [px, py, pz];
        if (this.zust[b] === 1) this.korrigiere(a, [c[0], c[1], c[2]], b, rb, nx, ny, nz, tiefe);
        else { this.klemm[a] = this.sz; this.anprall(a, b, nx, ny, nz); this.druck(b, tiefe); if (this.zust[b] === 1) continue; this.korrigiere(a, [c[0], c[1], c[2]], -1, null, nx, ny, nz, tiefe); }
      } else {
        // Ecke des festen a steckt im freien b -> b wegschieben (Normale zeigt von a weg = -n)
        const rb = [x[oa] + c[0] - x[ob], x[oa + 1] + c[1] - x[ob + 1], x[oa + 2] + c[2] - x[ob + 2]];
        this.klemm[b] = this.sz; this.anprall(b, a, -nx, -ny, -nz); this.druck(a, tiefe); if (this.zust[a] === 1) continue;
        this.korrigiere(b, rb, -1, null, -nx, -ny, -nz, tiefe);
      }
    }
  }
  // freies Klötzchen i fliegt schnell gegen festes j (n zeigt von j nach i) -> j bricht heraus
  anprall(i, j, nx, ny, nz) {
    if (this.zust[j] !== 0) return;
    const o = 3 * i, vn = -(this.v[o] * nx + this.v[o + 1] * ny + this.v[o + 2] * nz);
    if (vn > this.vKrit) { this._grund = 'anprall'; this.loese(j); }
  }
  // Ein festes Klötzchen wird stark gedrückt -> löst sich, wenn noch Wucht da ist
  druck(i, tiefe) {
    if (this.zust[i] === 2) { if (tiefe > this.b * 0.12) { this._grund = 'liegend'; this.loese(i); } return; }
    if (tiefe > this.b * this.P.druckTiefe && this.rammeNah(i) && this.energie() > this.bruch) {
      this.zahle(this.bruch * this.P.druckKosten); this._grund = 'druck'; this.loese(i);
    }
  }
  rammeNah(i) {
    const R = this.rammeLage(), x = this.x;
    const dx = x[3 * i] - R.mx, dy = x[3 * i + 1] - R.my;
    return Math.hypot(dx, dy, x[3 * i + 2]) < this.P.l * 0.5 + this.b * 3;
  }
  zahle(k = this.bruch) {
    const P = this.P, E = this.energie(), neu = Math.max(0, E - k);
    P.om *= Math.sqrt(neu / E);
  }
  // Pendel (Kapsel + Stange) gegen Klötzchen
  ramme(h) {
    const P = this.P, R = this.rammeLage(), x = this.x;
    const kandidaten = [];
    // feste Klötzchen über das Gitter in der Nähe der Kapsel
    const g = this.gitter, b = this.b, rr = P.r + b;
    const x0 = Math.min(R.mx - R.ax * R.hl, R.mx + R.ax * R.hl) - rr, x1 = Math.max(R.mx - R.ax * R.hl, R.mx + R.ax * R.hl) + rr;
    const y0 = Math.min(R.my - R.ay * R.hl, R.my + R.ay * R.hl) - rr, y1 = Math.max(R.my - R.ay * R.hl, R.my + R.ay * R.hl) + rr;
    const I0 = Math.max(0, Math.floor((x0 - g.x0) / b)), I1 = Math.min(g.n - 1, Math.floor((x1 - g.x0) / b));
    const J0 = Math.max(0, Math.floor((y0 - g.y0) / b)), J1 = Math.min(g.n - 1, Math.floor((y1 - g.y0) / b));
    const K0 = Math.max(0, Math.floor((-rr - g.z0) / b)), K1 = Math.min(g.n - 1, Math.floor((rr - g.z0) / b));
    for (let I = I0; I <= I1; I++) for (let J = J0; J <= J1; J++) for (let K = K0; K <= K1; K++) {
      const j = this.zelle[(I * g.n + J) * g.n + K]; if (j >= 0) kandidaten.push(j);
    }
    for (const i of this.frei) { const dx = x[3 * i] - R.mx, dy = x[3 * i + 1] - R.my; if (dx * dx + dy * dy + x[3 * i + 2] ** 2 < (P.l * 0.5 + b) ** 2) kandidaten.push(i); }
    for (const i of this.liegend) { const dx = x[3 * i] - R.mx, dy = x[3 * i + 1] - R.my; if (dx * dx + dy * dy + x[3 * i + 2] ** 2 < (P.l * 0.5 + b) ** 2) kandidaten.push(i); }
    // Stange: nur der Teil nahe am Würfel
    let beruehrt = false;
    for (const i of kandidaten) {
      const zone = this.zust[i] === 0 ? this.zoneMax * Math.min(1, Math.max(0, (this.energie() - this.zoneAb) / (this.zoneBis - this.zoneAb))) : 0;
      if (this.kapselGegen(i, R.mx, R.my, R.ax, R.ay, R.hl, P.r, zone)) beruehrt = true;
    }
    // Stange (dünne Kapsel vom Drehpunkt zur Kapselmitte), nur für feste Klötzchen im Weg
    {
      const sx = (P.dreh[0] + R.mx) / 2, sy = (P.dreh[1] + R.my) / 2, ax = R.mx - P.dreh[0], ay = R.my - P.dreh[1];
      const L = Math.hypot(ax, ay);
      const yo = this.gitter.y0 + g.n * b + b;
      if (R.my + P.r < yo) {
        // Abschnitt der Stange unterhalb der Würfel-Oberkante
        const t0 = Math.max(0, (yo - P.dreh[1]) / (R.my - P.dreh[1]));
        const ex = P.dreh[0] + ax * t0, ey = P.dreh[1] + ay * t0;
        const mx = (ex + R.mx) / 2, my = (ey + R.my) / 2, hl = Math.hypot(R.mx - ex, R.my - ey) / 2;
        const I0s = Math.max(0, Math.floor((Math.min(ex, R.mx) - 0.02 - g.x0) / b)), I1s = Math.min(g.n - 1, Math.floor((Math.max(ex, R.mx) + 0.02 - g.x0) / b));
        const J0s = Math.max(0, Math.floor((R.my - g.y0) / b)), J1s = g.n - 1;
        const K0s = Math.max(0, Math.floor((-0.02 - g.z0) / b)), K1s = Math.min(g.n - 1, Math.floor((0.02 - g.z0) / b));
        for (let I = I0s; I <= I1s; I++) for (let J = J0s; J <= J1s; J++) for (let K = K0s; K <= K1s; K++) {
          const j = this.zelle[(I * g.n + J) * g.n + K]; if (j >= 0) this.kapselGegen(j, mx, my, ax / L, ay / L, hl, P.stangeR);
        }
      }
      void sx; void sy;
    }
    if (beruehrt && !this.rammeVorher) this.rammeStoss = Math.max(this.rammeStoss, Math.abs(P.om) * P.L);
    if (beruehrt) this.kontaktRamme++;
    this.rammeVorher = beruehrt;
  }
  // Kapsel (Mitte m, Richtung a in der x-y-Ebene, halbe Länge hl, Radius r) gegen Klötzchen i
  kapselGegen(i, mx, my, ax, ay, hl, r, zone = 0) {
    const { x, q } = this, h2 = this.h2, l = this._b, c = this._a, o = 3 * i;
    // nächster Punkt auf der Achse zum Klötzchen-Mittelpunkt
    let t = (x[o] - mx) * ax + (x[o + 1] - my) * ay; t = Math.max(-hl, Math.min(hl, t));
    let sx = mx + ax * t, sy = my + ay * t, sz = 0;
    for (let it = 0; it < 2; it++) {
      // nächster Punkt im Klötzchen zu s
      drehZurueck(q, 4 * i, sx - x[o], sy - x[o + 1], sz - x[o + 2], l);
      const kx = Math.max(-h2, Math.min(h2, l[0])), ky = Math.max(-h2, Math.min(h2, l[1])), kz = Math.max(-h2, Math.min(h2, l[2]));
      dreh(q, 4 * i, kx, ky, kz, c);
      const px = x[o] + c[0], py = x[o + 1] + c[1];
      t = (px - mx) * ax + (py - my) * ay; t = Math.max(-hl, Math.min(hl, t));
      sx = mx + ax * t; sy = my + ay * t;
    }
    drehZurueck(q, 4 * i, sx - x[o], sy - x[o + 1], sz - x[o + 2], l);
    const innen = Math.abs(l[0]) < h2 && Math.abs(l[1]) < h2 && Math.abs(l[2]) < h2;
    const kx = Math.max(-h2, Math.min(h2, l[0])), ky = Math.max(-h2, Math.min(h2, l[1])), kz = Math.max(-h2, Math.min(h2, l[2]));
    dreh(q, 4 * i, kx, ky, kz, c);
    const px = x[o] + c[0], py = x[o + 1] + c[1], pz = x[o + 2] + c[2];
    let nx = px - sx, ny = py - sy, nz = pz - sz;
    let d = Math.hypot(nx, ny, nz);
    if (innen || d < 1e-7) { nx = x[o] - sx; ny = x[o + 1] - sy; nz = x[o + 2] - sz; const dd = Math.hypot(nx, ny, nz) || 1; nx /= dd; ny /= dd; nz /= dd; d = -h2 * 0.5; }
    else { nx /= d; ny /= d; nz /= d; }
    const P = this.P;
    if (zone > 0 && d > 0 && d < r + zone && d > r - 0.002 && P.om * ((px - P.dreh[0]) * ny - (py - P.dreh[1]) * nx) > 0.05 && this.energie() > this.bruch) {
      // Bruchzone: bei viel Wucht reißen auch Klötzchen kurz vor dem Pendel heraus
      this.zahle(); this._grund = 'zone'; this.loese(i); return false;
    }
    const tiefe = r - d;
    if (tiefe <= 0) return false;
    // Hebel am Pendel
    const rpx = px - nx * 0 - P.dreh[0], rpy = py - P.dreh[1];
    const kreuz = rpx * ny - rpy * nx;            // (r × n)_z, n zeigt vom Pendel zum Klötzchen
    const wP = kreuz * kreuz / P.I;
    if (this.zust[i] === 0 || this.zust[i] === 2) {
      // festes Klötzchen: lösen, wenn genug Wucht (bei liegenden: immer), sonst prallt das Pendel ab
      const vn = P.om * kreuz;                    // Geschwindigkeit des Pendels in Richtung Klötzchen
      if (this.zust[i] === 2 || (vn > 0.05 && this.energie() > this.bruch)) {
        if (this.zust[i] === 0) this.zahle();
        this._grund = 'ramme'; this.loese(i);
      } else {
        const kk = Math.sign(kreuz || 1) * Math.max(Math.abs(kreuz), P.L * 0.3);
        P.phi -= tiefe / kk;                      // ganz zurückschieben
        if (vn > 0) this.rammeAbprall = true;
        return true;
      }
    }
    // freies Klötzchen: eingeklemmt und keine Wucht mehr -> wirkt wie fest (Pendel bleibt stecken)
    const vn = P.om * kreuz;
    if (this.klemm[i] >= this.sz - 1) {
      if (this.energie() <= this.bruch * 0.5) {
        const kk = Math.sign(kreuz || 1) * Math.max(Math.abs(kreuz), P.L * 0.3);
        P.phi -= tiefe / kk; if (vn > 0) this.rammeAbprall = true;
        return true;
      }
      // eingeklemmter Schutt wird in Fahrtrichtung durch das Loch nach vorn geschoben
      const rx = px - P.dreh[0], ry = py - P.dreh[1], sg = Math.sign(P.om || 1);
      let tx = -ry * sg, ty = rx * sg; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
      const R = this.rammeLage();
      // nach innen zur Lochachse
      const ix = -(x[o + 1] - R.my) * 0, iy = -(x[o + 1] - R.my), iz = -x[o + 2];
      const il = Math.hypot(iy, iz) || 1;
      let dx = tx + 0.6 * ix / il, dy = ty + 0.6 * iy / il, dz = 0.6 * iz / il; const dl = Math.hypot(dx, dy, dz);
      dx /= dl; dy /= dl; dz /= dl;
      const ra0 = [0, 0, 0];
      this.schiebe(i, ra0, dx * tiefe * this.m, dy * tiefe * this.m, dz * tiefe * this.m);
      this.zahle(P.reibKosten * tiefe);
      return true;
    }
    // sonst wird das Klötzchen weggeschoben; das Pendel gibt dabei Schwung ab (unelastischer Stoß)
    const ra = [px - x[o], py - x[o + 1], pz - x[o + 2]];
    this.schiebe(i, ra, nx * tiefe * this.m, ny * tiefe * this.m, nz * tiefe * this.m);
    const vb = this.v[o] * nx + this.v[o + 1] * ny + this.v[o + 2] * nz;
    if (vn > vb && Math.abs(kreuz) > 1e-4) {
      const mu = 1 / (this.im + wP);
      const J = mu * (vn - vb) * 0.5;
      const E0 = this.energie();
      P.om -= J * kreuz / P.I;
      if (this.energie() > E0) P.om = Math.sign(P.om) * Math.sqrt(2 * E0 / P.I);
    }
    return true;
  }
  einschlafen(dt) {
    const v = this.v, w = this.w;
    for (let k = this.frei.length - 1; k >= 0; k--) {
      const i = this.frei[k], o = 3 * i;
      const s = v[o] * v[o] + v[o + 1] * v[o + 1] + v[o + 2] * v[o + 2] + (w[o] * w[o] + w[o + 1] * w[o + 1] + w[o + 2] * w[o + 2]) * this.b * this.b;
      this.ruhig[i] = s < 0.0016 ? this.ruhig[i] + dt : 0;
      if (this.ruhig[i] > 0.4) {
        this.zust[i] = 2; this.frei.splice(k, 1); this.liegend.push(i);
        v[o] = v[o + 1] = v[o + 2] = 0; w[o] = w[o + 1] = w[o + 2] = 0;
      }
    }
  }
  // Wie viele Klötzchen wurden in diesem Bild hart angestoßen (für das Klappern)?
  stoesse() {
    const v = this.v, va = this.vAlt; let n = 0, summe = 0, sx = 0, sy = 0, sz = 0;
    for (const i of this.frei) {
      const o = 3 * i;
      const dv = Math.hypot(v[o] - va[o], v[o + 1] - va[o + 1], v[o + 2] - va[o + 2]);
      // nur echte Treffer: das Klötzchen muss sich wirklich bewegt haben (kein Zittern im Schutthaufen)
      const weg = Math.hypot(this.x[o] - this.xAlt[o], this.x[o + 1] - this.xAlt[o + 1], this.x[o + 2] - this.xAlt[o + 2]);
      const tempo = Math.max(Math.hypot(va[o], va[o + 1], va[o + 2]), Math.hypot(v[o], v[o + 1], v[o + 2]));
      if (dv > 0.5 && weg > 0.006 && tempo > 0.6 && weg < tempo * 1.5 / 30 + 0.01) { n++; summe += dv; sx += this.x[o]; sy += this.x[o + 1]; sz += this.x[o + 2]; }
    }
    return { n, mittel: n ? summe / n : 0, pos: n ? [sx / n, sy / n, sz / n] : [0, 0, 0] };
  }
}
