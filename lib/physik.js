// Weichkörper-Physik ohne Blender: Partikel + Formabgleich (Shape Matching, Müller 2005)
// mit überlappenden Gruppen. Reines JavaScript – läuft im Browser und in Node gleich.
// Ein Durchlauf ist deterministisch: gleiche Eingabe -> gleiches Video.

export class Weichkoerper {
  // pos: Float64Array n*3 Ruhelage, gruppen: Array<Int32Array>
  constructor(pos, gruppen, opt = {}) {
    this.n = pos.length / 3;
    this.x = Float64Array.from(pos);
    this.p = new Float64Array(pos.length);
    this.v = new Float64Array(pos.length);
    this.acc = new Float64Array(pos.length);
    this.cnt = new Float64Array(this.n);
    this.steif = opt.steif ?? 1;          // 1 = starr, kleiner = weicher
    this.reib = opt.reib ?? 0.5;
    this.daempf = opt.daempf ?? 0.002;
    this.schwer = opt.schwer ?? -9.81;
    this.gruppen = gruppen.map(idx => {
      let cx = 0, cy = 0, cz = 0;
      for (const i of idx) { cx += pos[3*i]; cy += pos[3*i+1]; cz += pos[3*i+2]; }
      cx /= idx.length; cy /= idx.length; cz /= idx.length;
      const q = new Float64Array(idx.length * 3);
      idx.forEach((i, k) => { q[3*k] = pos[3*i]-cx; q[3*k+1] = pos[3*i+1]-cy; q[3*k+2] = pos[3*i+2]-cz; });
      return { idx, q, quat: [0, 0, 0, 1] };
    });
    this.aufprall = 0; // stärkster Aufprall seit letztem Abholen (m/s)
  }

  setzeBewegung(vx, vy, vz, wx = 0, wy = 0, wz = 0) {
    // Startgeschwindigkeit + Drehung um den Schwerpunkt
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < this.n; i++) { cx += this.x[3*i]; cy += this.x[3*i+1]; cz += this.x[3*i+2]; }
    cx /= this.n; cy /= this.n; cz /= this.n;
    for (let i = 0; i < this.n; i++) {
      const rx = this.x[3*i]-cx, ry = this.x[3*i+1]-cy, rz = this.x[3*i+2]-cz;
      this.v[3*i]   = vx + wy*rz - wz*ry;
      this.v[3*i+1] = vy + wz*rx - wx*rz;
      this.v[3*i+2] = vz + wx*ry - wy*rx;
    }
  }

  schritt(dt, welt) {
    const { x, p, v, n } = this;
    const d = 1 - this.daempf;
    for (let i = 0; i < n; i++) {
      v[3*i+1] += this.schwer * dt;
      v[3*i] *= d; v[3*i+1] *= d; v[3*i+2] *= d;
      p[3*i] = x[3*i] + v[3*i]*dt; p[3*i+1] = x[3*i+1] + v[3*i+1]*dt; p[3*i+2] = x[3*i+2] + v[3*i+2]*dt;
    }
    this.formabgleich();
    this.kollision(welt, dt);
    for (let i = 0; i < 3*n; i++) { v[i] = (p[i] - x[i]) / dt; x[i] = p[i]; }
  }

  formabgleich() {
    const { p, acc, cnt } = this;
    acc.fill(0); cnt.fill(0);
    const a = this.steif;
    for (const g of this.gruppen) {
      const { idx, q } = g;
      let cx = 0, cy = 0, cz = 0;
      for (const i of idx) { cx += p[3*i]; cy += p[3*i+1]; cz += p[3*i+2]; }
      cx /= idx.length; cy /= idx.length; cz /= idx.length;
      // A = Σ (p - c) qᵀ  (Spalten c0,c1,c2)
      const A = [0,0,0, 0,0,0, 0,0,0];
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        const px = p[3*i]-cx, py = p[3*i+1]-cy, pz = p[3*i+2]-cz;
        const qx = q[3*k], qy = q[3*k+1], qz = q[3*k+2];
        A[0] += px*qx; A[1] += py*qx; A[2] += pz*qx;
        A[3] += px*qy; A[4] += py*qy; A[5] += pz*qy;
        A[6] += px*qz; A[7] += py*qz; A[8] += pz*qz;
      }
      const R = drehteil(A, g.quat);
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        const qx = q[3*k], qy = q[3*k+1], qz = q[3*k+2];
        const gx = R[0]*qx + R[3]*qy + R[6]*qz + cx;
        const gy = R[1]*qx + R[4]*qy + R[7]*qz + cy;
        const gz = R[2]*qx + R[5]*qy + R[8]*qz + cz;
        acc[3*i] += gx - p[3*i]; acc[3*i+1] += gy - p[3*i+1]; acc[3*i+2] += gz - p[3*i+2];
        cnt[i] += 1;
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (!cnt[i]) continue;
      const f = a / cnt[i];
      p[3*i] += acc[3*i]*f; p[3*i+1] += acc[3*i+1]*f; p[3*i+2] += acc[3*i+2]*f;
    }
  }

  kollision(welt, dt) {
    const { p, x, n } = this;
    const mu = this.reib;
    const g = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const px = p[3*i], py = p[3*i+1], pz = p[3*i+2];
      const dist = welt.abstand(px, py, pz, g);
      if (dist >= 0) continue;
      // Aufprallgeschwindigkeit in die Fläche hinein
      const vn = -((px - x[3*i])*g[0] + (py - x[3*i+1])*g[1] + (pz - x[3*i+2])*g[2]) / dt;
      if (vn > this.aufprall) this.aufprall = vn;
      let nx = px - g[0]*dist, ny = py - g[1]*dist, nz = pz - g[2]*dist;
      // Reibung: seitliche Bewegung bremsen
      let tx = nx - x[3*i], ty = ny - x[3*i+1], tz = nz - x[3*i+2];
      const dn = tx*g[0] + ty*g[1] + tz*g[2];
      tx -= dn*g[0]; ty -= dn*g[1]; tz -= dn*g[2];
      const tl = Math.hypot(tx, ty, tz);
      const pen = -dist;
      if (tl > 0) {
        const k = tl < mu*pen*1.5 ? 1 : Math.min(mu*pen/tl, 1);
        nx -= tx*k; ny -= ty*k; nz -= tz*k;
      }
      p[3*i] = nx; p[3*i+1] = ny; p[3*i+2] = nz;
    }
  }

  holeAufprall() { const a = this.aufprall; this.aufprall = 0; return a; }
}

// Drehteil einer 3x3-Matrix (Müller et al. 2016), mit Warmstart-Quaternion q.
export function drehteil(A, q) {
  const R = new Array(9);
  for (let it = 0; it < 12; it++) {
    quatZuMatrix(q, R);
    const wx = (R[1]*A[2]-R[2]*A[1]) + (R[4]*A[5]-R[5]*A[4]) + (R[7]*A[8]-R[8]*A[7]);
    const wy = (R[2]*A[0]-R[0]*A[2]) + (R[5]*A[3]-R[3]*A[5]) + (R[8]*A[6]-R[6]*A[8]);
    const wz = (R[0]*A[1]-R[1]*A[0]) + (R[3]*A[4]-R[4]*A[3]) + (R[6]*A[7]-R[7]*A[6]);
    const s = 1 / Math.abs(R[0]*A[0]+R[1]*A[1]+R[2]*A[2] + R[3]*A[3]+R[4]*A[4]+R[5]*A[5] + R[6]*A[6]+R[7]*A[7]+R[8]*A[8] + 1e-12);
    const ox = wx*s, oy = wy*s, oz = wz*s;
    const w = Math.hypot(ox, oy, oz);
    if (w < 1e-10) break;
    const h = w/2, sn = Math.sin(h)/w;
    const ax = ox*sn, ay = oy*sn, az = oz*sn, aw = Math.cos(h);
    // q = a * q
    const [qx, qy, qz, qw] = q;
    q[0] = aw*qx + ax*qw + ay*qz - az*qy;
    q[1] = aw*qy - ax*qz + ay*qw + az*qx;
    q[2] = aw*qz + ax*qy - ay*qx + az*qw;
    q[3] = aw*qw - ax*qx - ay*qy - az*qz;
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  }
  quatZuMatrix(q, R);
  return R;
}

function quatZuMatrix([x, y, z, w], R) {
  // spaltenweise
  R[0] = 1-2*(y*y+z*z); R[1] = 2*(x*y+z*w);   R[2] = 2*(x*z-y*w);
  R[3] = 2*(x*y-z*w);   R[4] = 1-2*(x*x+z*z); R[5] = 2*(y*z+x*w);
  R[6] = 2*(x*z+y*w);   R[7] = 2*(y*z-x*w);   R[8] = 1-2*(x*x+y*y);
}

// ---------- Formen ----------

// Ring (Torus) als geschlossenes Gitter ohne doppelte Nahtpunkte
export function ringGitter(R, r, nu, nv) {
  const pos = new Float64Array(nu*nv*3), winkel = new Float64Array(nu*nv);
  for (let i = 0; i < nu; i++) {
    const u = i/nu*Math.PI*2;
    for (let j = 0; j < nv; j++) {
      const w = j/nv*Math.PI*2, k = i*nv+j;
      pos[3*k] = (R + r*Math.cos(w))*Math.cos(u);
      pos[3*k+1] = r*Math.sin(w);
      pos[3*k+2] = (R + r*Math.cos(w))*Math.sin(u);
      winkel[k] = u;
    }
  }
  const index = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i*nv+j, b = ((i+1)%nu)*nv+j, c = ((i+1)%nu)*nv+(j+1)%nv, d = i*nv+(j+1)%nv;
    index.push(a, d, b, b, d, c);
  }
  return { pos, index, winkel, nu, nv };
}

// Gruppen entlang des Ringwinkels: anzahl Gruppen, jede deckt "breite" Grad ab
export function ringGruppen(winkel, anzahl, breiteGrad) {
  if (anzahl <= 1) return [Int32Array.from(winkel.keys())];
  const g = [], h = breiteGrad/360*Math.PI;
  for (let k = 0; k < anzahl; k++) {
    const m = k/anzahl*Math.PI*2, idx = [];
    winkel.forEach((u, i) => {
      let d = Math.abs(u - m); d = Math.min(d, Math.PI*2 - d);
      if (d <= h + 1e-9) idx.push(i);
    });
    g.push(Int32Array.from(idx));
  }
  return g;
}

// Punkt drehen (Achse normiert, Winkel rad) – zum Kippen der Startlage
export function drehePunkte(pos, ax, ay, az, w, ox = 0, oy = 0, oz = 0) {
  const c = Math.cos(w), s = Math.sin(w), t = 1 - c;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i+1], z = pos[i+2];
    pos[i]   = (t*ax*ax+c)*x + (t*ax*ay-s*az)*y + (t*ax*az+s*ay)*z + ox;
    pos[i+1] = (t*ax*ay+s*az)*x + (t*ay*ay+c)*y + (t*ay*az-s*ax)*z + oy;
    pos[i+2] = (t*ax*az-s*ay)*x + (t*ay*az+s*ax)*y + (t*az*az+c)*z + oz;
  }
  return pos;
}

// ---------- Welt aus Abstandsfeldern ----------

export function ellipsoidAbstand(px, py, pz, e) {
  const x = px-e.x, y = py-e.y, z = pz-e.z;
  const k0 = Math.hypot(x/e.rx, y/e.ry, z/e.rz);
  const k1 = Math.hypot(x/(e.rx*e.rx), y/(e.ry*e.ry), z/(e.rz*e.rz));
  return k1 < 1e-12 ? -Math.min(e.rx, e.ry, e.rz) : k0*(k0-1)/k1;
}

export function steinturmWelt(steine, haut = 0.004) {
  const f = (x, y, z) => {
    let d = y; // Boden
    for (const e of steine) d = Math.min(d, ellipsoidAbstand(x, y, z, e));
    return d - haut;
  };
  return {
    abstand(x, y, z, g) {
      const d = f(x, y, z);
      if (d >= 0) return d;
      const h = 1e-4;
      let gx = f(x+h,y,z)-f(x-h,y,z), gy = f(x,y+h,z)-f(x,y-h,z), gz = f(x,y,z+h)-f(x,y,z-h);
      const l = Math.hypot(gx, gy, gz) || 1;
      g[0] = gx/l; g[1] = gy/l; g[2] = gz/l;
      return d;
    }
  };
}

// Treppe aus Steinstufen (absteigend Richtung +z) + Boden
export function treppeWelt({ stufen, hoehe, tiefe, breite, haut = 0.004 }) {
  const box = (px, py, pz, cx, cy, cz, hx, hy, hz) => {
    const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy, qz = Math.abs(pz - cz) - hz;
    const ax = Math.max(qx, 0), ay = Math.max(qy, 0), az = Math.max(qz, 0);
    return Math.hypot(ax, ay, az) + Math.min(Math.max(qx, qy, qz), 0);
  };
  const kasten = [];
  for (let k = 0; k < stufen; k++) {
    const top = (stufen - k) * hoehe;
    kasten.push([0, top / 2, k * tiefe + tiefe / 2, breite / 2, top / 2, tiefe / 2]);
  }
  const f = (x, y, z) => {
    let d = y;
    for (const b of kasten) d = Math.min(d, box(x, y, z, ...b));
    return d - haut;
  };
  return {
    kasten,
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
