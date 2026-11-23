// Echte Weichkörper-Physik: Körper aus Tetraedern, gelöst mit XPBD
// (Macklin & Müller, „Small Steps in Physics Simulation“, Ten Minute Physics #10).
// Jedes Tetraeder hält sein Volumen, jede Kante ist eine Feder mit Nachgiebigkeit.
// Dazu: Abprallen (Restitution), Haft-/Gleitreibung, optional starrer Körper.
import { drehteil } from './physik.js';

export class TetKoerper {
  constructor(pos, tets, opt = {}) {
    this.n = pos.length / 3;
    this.x = Float64Array.from(pos);
    this.p = new Float64Array(pos.length);
    this.v = new Float64Array(pos.length);
    this.rest = Float64Array.from(pos);
    this.tets = Int32Array.from(tets);
    this.nt = tets.length / 4;
    this.dichte = opt.dichte ?? 1100;          // kg/m³ (Gelee/Gummi)
    // Neo-Hooke-Material (Macklin & Müller 2021): E = Elastizitätsmodul, nu = Querdehnzahl
    const E = opt.E ?? 1e6, nu = opt.nu ?? 0.45;
    this.mu = E / (2 * (1 + nu));
    this.lam = E * nu / ((1 + nu) * (1 - 2 * nu));
    this.w = new Float64Array(this.n);
    this.kantenNach = opt.kantenNach ?? 0;     // Nachgiebigkeit der Kanten (0 = steif)
    this.volNach = opt.volNach ?? 0;           // Nachgiebigkeit des Volumens
    this.starr = !!opt.starr;
    this.reib = opt.reib ?? 0.4;
    this.abprall = opt.abprall ?? 0.0;
    this.daempf = opt.daempf ?? 0.0;
    this.schwer = opt.schwer ?? -9.81;
    this.aufprall = 0;
    this._g = new Float64Array(12);
    this.neueKontakte = 0;
    this.kontaktN = new Float64Array(pos.length);
    this.vorN = new Float64Array(this.n);
    this.kontakt = new Uint8Array(this.n);
    // Ruhevolumen, Massen und inverse Ruhematrix je Tetraeder
    this.vol0 = new Float64Array(this.nt);
    this.dmInv = new Float64Array(this.nt * 9);
    const masse = new Float64Array(this.n);
    for (let t = 0; t < this.nt; t++) {
      this.vol0[t] = this.volumen(t, this.x);
      for (let k = 0; k < 4; k++) masse[this.tets[4 * t + k]] += this.dichte * Math.abs(this.vol0[t]) / 4;
      const T = this.tets, a = T[4 * t];
      const M = [];
      for (let k = 1; k < 4; k++) { const b = T[4 * t + k]; M.push(pos[3 * b] - pos[3 * a], pos[3 * b + 1] - pos[3 * a + 1], pos[3 * b + 2] - pos[3 * a + 2]); }
      invertiere3(M, this.dmInv, 9 * t);
    }
    this.masse = 0;
    for (let i = 0; i < this.n; i++) { this.w[i] = masse[i] > 0 ? 1 / masse[i] : 0; this.masse += masse[i]; }
    // eindeutige Kanten
    const s = new Set(), k = [];
    const paare = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    for (let t = 0; t < this.nt; t++) for (const [a, b] of paare) {
      let i = this.tets[4 * t + a], j = this.tets[4 * t + b];
      if (i > j) [i, j] = [j, i];
      const key = i * 1e6 + j;
      if (!s.has(key)) { s.add(key); k.push(i, j); }
    }
    this.kanten = Int32Array.from(k);
    this.len0 = new Float64Array(k.length / 2);
    for (let e = 0; e < this.len0.length; e++) {
      const i = k[2 * e], j = k[2 * e + 1];
      this.len0[e] = Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2]);
    }
    if (this.starr) {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < this.n; i++) { cx += pos[3 * i]; cy += pos[3 * i + 1]; cz += pos[3 * i + 2]; }
      cx /= this.n; cy /= this.n; cz /= this.n;
      this.q = new Float64Array(pos.length);
      for (let i = 0; i < this.n; i++) { this.q[3 * i] = pos[3 * i] - cx; this.q[3 * i + 1] = pos[3 * i + 1] - cy; this.q[3 * i + 2] = pos[3 * i + 2] - cz; }
      this.quat = [0, 0, 0, 1];
    }
  }

  volumen(t, x) {
    const T = this.tets, a = T[4 * t], b = T[4 * t + 1], c = T[4 * t + 2], d = T[4 * t + 3];
    const ax = x[3 * b] - x[3 * a], ay = x[3 * b + 1] - x[3 * a + 1], az = x[3 * b + 2] - x[3 * a + 2];
    const bx = x[3 * c] - x[3 * a], by = x[3 * c + 1] - x[3 * a + 1], bz = x[3 * c + 2] - x[3 * a + 2];
    const cx = x[3 * d] - x[3 * a], cy = x[3 * d + 1] - x[3 * a + 1], cz = x[3 * d + 2] - x[3 * a + 2];
    return ((ay * bz - az * by) * cx + (az * bx - ax * bz) * cy + (ax * by - ay * bx) * cz) / 6;
  }

  setzeBewegung(vx, vy, vz, wx = 0, wy = 0, wz = 0) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < this.n; i++) { cx += this.x[3 * i]; cy += this.x[3 * i + 1]; cz += this.x[3 * i + 2]; }
    cx /= this.n; cy /= this.n; cz /= this.n;
    for (let i = 0; i < this.n; i++) {
      const rx = this.x[3 * i] - cx, ry = this.x[3 * i + 1] - cy, rz = this.x[3 * i + 2] - cz;
      this.v[3 * i] = vx + wy * rz - wz * ry;
      this.v[3 * i + 1] = vy + wz * rx - wx * rz;
      this.v[3 * i + 2] = vz + wx * ry - wy * rx;
    }
  }

  schritt(dt, welt) { this.vorher(dt); this.loese(dt, welt); this.nachher(dt); }

  // Phase 1: Schwerkraft, Dämpfung, Vorhersage
  vorher(dt) {
    const { x, p, v, n } = this;
    const d = 1 - this.daempf * dt;
    for (let i = 0; i < n; i++) {
      v[3 * i + 1] += this.schwer * dt;
      v[3 * i] *= d; v[3 * i + 1] *= d; v[3 * i + 2] *= d;
      p[3 * i] = x[3 * i] + v[3 * i] * dt; p[3 * i + 1] = x[3 * i + 1] + v[3 * i + 1] * dt; p[3 * i + 2] = x[3 * i + 2] + v[3 * i + 2] * dt;
    }
  }
  // Phase 2: Material + Kollision mit der Welt
  loese(dt, welt) {
    if (this.starr) this.formStarr(); else this.loeseNeoHooke(dt);
    this.kollision(welt, dt);
    if (this.starr) { this.formStarr(); this.kollision(welt, dt); }
  }
  // Phase 3: Geschwindigkeit aus der Bewegung, Abprallen
  nachher(dt) {
    const { x, p, v, n } = this;
    if (this.starr) this.formStarr();
    for (let i = 0; i < 3 * n; i++) { v[i] = (p[i] - x[i]) / dt; x[i] = p[i]; }
    this.geschwindigkeitKontakt();
  }

  loeseKanten(dt) {
    const { p, w, kanten, len0 } = this;
    const a = this.kantenNach / (dt * dt);
    for (let e = 0; e < len0.length; e++) {
      const i = kanten[2 * e], j = kanten[2 * e + 1];
      const dx = p[3 * i] - p[3 * j], dy = p[3 * i + 1] - p[3 * j + 1], dz = p[3 * i + 2] - p[3 * j + 2];
      const l = Math.hypot(dx, dy, dz);
      if (l < 1e-12) continue;
      const ws = w[i] + w[j];
      const lam = -(l - len0[e]) / (ws + a) / l;
      p[3 * i] += dx * lam * w[i]; p[3 * i + 1] += dy * lam * w[i]; p[3 * i + 2] += dz * lam * w[i];
      p[3 * j] -= dx * lam * w[j]; p[3 * j + 1] -= dy * lam * w[j]; p[3 * j + 2] -= dz * lam * w[j];
    }
  }

  loeseVolumen(dt) {
    const { p, w, tets, vol0 } = this;
    const a = this.volNach / (dt * dt);
    const g = new Float64Array(12);
    // Reihenfolge der Seitenflächen für die Gradienten (Ten Minute Physics)
    const F = [[1, 3, 2], [0, 2, 3], [0, 3, 1], [0, 1, 2]];
    for (let t = 0; t < this.nt; t++) {
      let ws = 0;
      for (let k = 0; k < 4; k++) {
        const i0 = tets[4 * t + F[k][0]], i1 = tets[4 * t + F[k][1]], i2 = tets[4 * t + F[k][2]];
        const ax = p[3 * i1] - p[3 * i0], ay = p[3 * i1 + 1] - p[3 * i0 + 1], az = p[3 * i1 + 2] - p[3 * i0 + 2];
        const bx = p[3 * i2] - p[3 * i0], by = p[3 * i2 + 1] - p[3 * i0 + 1], bz = p[3 * i2 + 2] - p[3 * i0 + 2];
        g[3 * k] = (ay * bz - az * by) / 6; g[3 * k + 1] = (az * bx - ax * bz) / 6; g[3 * k + 2] = (ax * by - ay * bx) / 6;
        const id = tets[4 * t + k];
        ws += w[id] * (g[3 * k] ** 2 + g[3 * k + 1] ** 2 + g[3 * k + 2] ** 2);
      }
      if (ws < 1e-14) continue;
      const C = this.volumen(t, p) - vol0[t];
      const lam = -C / (ws + a);
      for (let k = 0; k < 4; k++) {
        const id = tets[4 * t + k];
        p[3 * id] += lam * w[id] * g[3 * k]; p[3 * id + 1] += lam * w[id] * g[3 * k + 1]; p[3 * id + 2] += lam * w[id] * g[3 * k + 2];
      }
    }
  }

  // Stabiles Neo-Hooke-Material: je Tetraeder eine Form- und eine Volumen-Bedingung
  loeseNeoHooke(dt) {
    const { p, w, tets, dmInv, vol0 } = this;
    const F = new Float64Array(9), G = new Float64Array(12);
    const idt2 = 1 / (dt * dt);
    const gamma = 1; // beide Bedingungen sind in Ruhe genau null
    for (let t = 0; t < this.nt; t++) {
      const V = Math.abs(vol0[t]);
      const i0 = tets[4 * t], i1 = tets[4 * t + 1], i2 = tets[4 * t + 2], i3 = tets[4 * t + 3];
      for (let art = 0; art < 2; art++) {
        // F = Ds * Dm⁻¹ (Spalten f0,f1,f2)
        const ids = [i1, i2, i3];
        for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
          let s = 0;
          for (let k = 0; k < 3; k++) s += (p[3 * ids[k] + r] - p[3 * i0 + r]) * dmInv[9 * t + 3 * c + k];
          F[3 * c + r] = s;
        }
        let C, alpha;
        // dC/dF in G[0..8] (spaltenweise)
        if (art === 0) {
          let tr = 0; for (let k = 0; k < 9; k++) tr += F[k] * F[k];
          C = Math.sqrt(tr);
          if (C < 1e-9) continue;
          for (let k = 0; k < 9; k++) G[k] = F[k] / C;
          C -= Math.sqrt(3); // Ruhelage: tr(FᵀF) = 3 – verschiebt nur den Nullpunkt
          alpha = 1 / (this.mu * V) * idt2;
        } else {
          const f0 = [F[0], F[1], F[2]], f1 = [F[3], F[4], F[5]], f2 = [F[6], F[7], F[8]];
          const kr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          const c0 = kr(f1, f2), c1 = kr(f2, f0), c2 = kr(f0, f1);
          G[0] = c0[0]; G[1] = c0[1]; G[2] = c0[2]; G[3] = c1[0]; G[4] = c1[1]; G[5] = c1[2]; G[6] = c2[0]; G[7] = c2[1]; G[8] = c2[2];
          C = f0[0] * c0[0] + f0[1] * c0[1] + f0[2] * c0[2] - gamma;
          alpha = 1 / (this.lam * V) * idt2;
        }
        // Gradienten nach den Punkten: g_k = (dC/dF) * Dm⁻ᵀ, Zeile k
        let wsum = 0;
        for (let k = 0; k < 3; k++) {
          for (let r = 0; r < 3; r++) {
            let s = 0;
            for (let c = 0; c < 3; c++) s += G[3 * c + r] * dmInv[9 * t + 3 * c + k];
            this._g[3 * (k + 1) + r] = s;
          }
        }
        const g = this._g;
        g[0] = -(g[3] + g[6] + g[9]); g[1] = -(g[4] + g[7] + g[10]); g[2] = -(g[5] + g[8] + g[11]);
        const idsAll = [i0, i1, i2, i3];
        for (let k = 0; k < 4; k++) wsum += w[idsAll[k]] * (g[3 * k] ** 2 + g[3 * k + 1] ** 2 + g[3 * k + 2] ** 2);
        if (wsum < 1e-14) continue;
        const dl = -C / (wsum + alpha);
        for (let k = 0; k < 4; k++) {
          const id = idsAll[k], f = dl * w[id];
          p[3 * id] += f * g[3 * k]; p[3 * id + 1] += f * g[3 * k + 1]; p[3 * id + 2] += f * g[3 * k + 2];
        }
      }
    }
  }

  formStarr() {
    const { p, q, n } = this;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += p[3 * i]; cy += p[3 * i + 1]; cz += p[3 * i + 2]; }
    cx /= n; cy /= n; cz /= n;
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const px = p[3 * i] - cx, py = p[3 * i + 1] - cy, pz = p[3 * i + 2] - cz;
      const qx = q[3 * i], qy = q[3 * i + 1], qz = q[3 * i + 2];
      A[0] += px * qx; A[1] += py * qx; A[2] += pz * qx; A[3] += px * qy; A[4] += py * qy; A[5] += pz * qy; A[6] += px * qz; A[7] += py * qz; A[8] += pz * qz;
    }
    const R = drehteil(A, this.quat);
    for (let i = 0; i < n; i++) {
      const qx = q[3 * i], qy = q[3 * i + 1], qz = q[3 * i + 2];
      p[3 * i] = R[0] * qx + R[3] * qy + R[6] * qz + cx;
      p[3 * i + 1] = R[1] * qx + R[4] * qy + R[7] * qz + cy;
      p[3 * i + 2] = R[2] * qx + R[5] * qy + R[8] * qz + cz;
    }
  }

  kollision(welt, dt) {
    const { p, x, n, kontaktN, vorN, kontakt } = this;
    const mu = this.reib, g = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const px = p[3 * i], py = p[3 * i + 1], pz = p[3 * i + 2];
      const dist = welt.abstand(px, py, pz, g);
      if (dist >= 0) continue;
      const vn = ((px - x[3 * i]) * g[0] + (py - x[3 * i + 1]) * g[1] + (pz - x[3 * i + 2]) * g[2]) / dt;
      if (kontakt[i] === 0) {
        vorN[i] = this.v[3 * i] * g[0] + this.v[3 * i + 1] * g[1] + this.v[3 * i + 2] * g[2];
        kontakt[i] = 3;
        // Aufprall-Stärke nur aus NEUEN Berührungen (für den Ton)
        if (-vorN[i] > this.aufprall) this.aufprall = -vorN[i];
        this.neueKontakte++;
      }
      else if (kontakt[i] === 2) kontakt[i] = 1;
      kontaktN[3 * i] = g[0]; kontaktN[3 * i + 1] = g[1]; kontaktN[3 * i + 2] = g[2];
      let nx = px - g[0] * dist, ny = py - g[1] * dist, nz = pz - g[2] * dist;
      let tx = nx - x[3 * i], ty = ny - x[3 * i + 1], tz = nz - x[3 * i + 2];
      const dn = tx * g[0] + ty * g[1] + tz * g[2];
      tx -= dn * g[0]; ty -= dn * g[1]; tz -= dn * g[2];
      const tl = Math.hypot(tx, ty, tz), pen = -dist;
      if (tl > 0) {
        const k = tl < mu * pen * 1.5 ? 1 : Math.min(mu * pen / tl, 1);
        nx -= tx * k; ny -= ty * k; nz -= tz * k;
      }
      p[3 * i] = nx; p[3 * i + 1] = ny; p[3 * i + 2] = nz;
    }
  }

  // Abprallen: Normalgeschwindigkeit nach dem Stoß = -e * vorher (nur beim ersten Kontakt)
  geschwindigkeitKontakt() {
    const { v, kontaktN, vorN, kontakt, n } = this;
    for (let i = 0; i < n; i++) {
      // 0 = frei, 3 = neuer Kontakt, 1 = Kontakt geht weiter, 2 = lag auf (noch nicht geprüft)
      const k = kontakt[i];
      if (k === 2) { kontakt[i] = 0; continue; }
      if (k === 0) continue;
      kontakt[i] = 2;
      if (k === 3 && this.abprall > 0 && vorN[i] < -0.4) {
        const nx = kontaktN[3 * i], ny = kontaktN[3 * i + 1], nz = kontaktN[3 * i + 2];
        const jetzt = v[3 * i] * nx + v[3 * i + 1] * ny + v[3 * i + 2] * nz;
        const ziel = -this.abprall * vorN[i];
        const d = ziel - jetzt;
        v[3 * i] += nx * d; v[3 * i + 1] += ny * d; v[3 * i + 2] += nz * d;
      }
    }
    // Teilchen ohne Kontakt in diesem Schritt wieder freigeben
  }

  holeAufprall() { const a = this.aufprall; this.aufprall = 0; return a; }
  holeKontakte() { const k = this.neueKontakte; this.neueKontakte = 0; return k; }
}

// 3x3 invertieren; M spaltenweise (Spalten = Kantenvektoren), Ergebnis spaltenweise in out[o..o+8]
// Konvention: dmInv[3c+k] = (Dm⁻¹)[k][c]  (Zeile k, Spalte c)
function invertiere3(M, out, o) {
  // Dm[r][c] = M[3c+r]
  const a = (r, c) => M[3 * c + r];
  const det = a(0,0)*(a(1,1)*a(2,2)-a(1,2)*a(2,1)) - a(0,1)*(a(1,0)*a(2,2)-a(1,2)*a(2,0)) + a(0,2)*(a(1,0)*a(2,1)-a(1,1)*a(2,0));
  const id = 1 / det;
  const inv = [
    [(a(1,1)*a(2,2)-a(1,2)*a(2,1))*id, (a(0,2)*a(2,1)-a(0,1)*a(2,2))*id, (a(0,1)*a(1,2)-a(0,2)*a(1,1))*id],
    [(a(1,2)*a(2,0)-a(1,0)*a(2,2))*id, (a(0,0)*a(2,2)-a(0,2)*a(2,0))*id, (a(0,2)*a(1,0)-a(0,0)*a(1,2))*id],
    [(a(1,0)*a(2,1)-a(1,1)*a(2,0))*id, (a(0,1)*a(2,0)-a(0,0)*a(2,1))*id, (a(0,0)*a(1,1)-a(0,1)*a(1,0))*id],
  ];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[o + 3 * c + r] = inv[r][c];
}

// Ring aus Tetraedern: je Ringscheibe ein Mittelpunkt, eine innere und eine äußere Lage
export function ringTets(R, r, nu, nv) {
  const per = 1 + 2 * nv;
  const pos = new Float64Array(nu * per * 3);
  const setze = (id, u, rad, w) => {
    pos[3 * id] = (R + rad * Math.cos(w)) * Math.cos(u);
    pos[3 * id + 1] = rad * Math.sin(w);
    pos[3 * id + 2] = (R + rad * Math.cos(w)) * Math.sin(u);
  };
  const M = i => i * per, A = (i, j) => i * per + 1 + (j % nv), B = (i, j) => i * per + 1 + nv + (j % nv);
  for (let i = 0; i < nu; i++) {
    const u = i / nu * Math.PI * 2;
    setze(M(i), u, 0, 0);
    for (let j = 0; j < nv; j++) {
      const w = j / nv * Math.PI * 2;
      setze(A(i, j), u, r * 0.55, w);
      setze(B(i, j), u, r, w);
    }
  }
  const tets = [];
  const prisma = (a0, a1, a2, b0, b1, b2) => {
    tets.push(a0, a1, a2, b0, a1, a2, b0, b1, a2, b0, b1, b2);
  };
  for (let i = 0; i < nu; i++) {
    const i2 = (i + 1) % nu;
    for (let j = 0; j < nv; j++) {
      prisma(M(i), A(i, j), A(i, j + 1), M(i2), A(i2, j), A(i2, j + 1));
      prisma(A(i, j), A(i, j + 1), B(i, j + 1), A(i2, j), A(i2, j + 1), B(i2, j + 1));
      prisma(A(i, j), B(i, j + 1), B(i, j), A(i2, j), B(i2, j + 1), B(i2, j));
    }
  }
  // Oberfläche = äußere Lage, als nu×nv-Gitter
  const oberflaeche = new Int32Array(nu * nv);
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) oberflaeche[i * nv + j] = B(i, j);
  return { pos, tets, oberflaeche, nu, nv };
}

// Kapsel (Zylinder mit runden Enden) aus Tetraedern, Achse entlang x.
// Scheiben entlang der Achse: Mittelpunkt + innere + äußere Lage; an beiden Enden eine Spitze.
export function kapselTets(L, r, nl, nv) {
  const per = 1 + 2 * nv;
  // Achsenpositionen + Radius: Kappen als Halbkugel-Profil
  const prof = [];
  const kap = 5;                                   // Scheiben je Kappe
  const halb = L / 2 - r;
  for (let k = kap; k >= 1; k--) { const th = k / (kap + 1) * Math.PI / 2; prof.push([-halb - r * Math.sin(th), r * Math.cos(th)]); }
  for (let k = 0; k <= nl; k++) prof.push([-halb + 2 * halb * k / nl, r]);
  for (let k = 1; k <= kap; k++) { const th = k / (kap + 1) * Math.PI / 2; prof.push([halb + r * Math.sin(th), r * Math.cos(th)]); }
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
  const spitzeL = ns * per, spitzeR = ns * per + 1;
  setze(spitzeL, -L / 2, 0, 0); setze(spitzeR, L / 2, 0, 0);
  const tets = [];
  const prisma = (a0, a1, a2, b0, b1, b2) => tets.push(a0, a1, a2, b0, a1, a2, b0, b1, a2, b0, b1, b2);
  for (let i = 0; i + 1 < ns; i++) for (let j = 0; j < nv; j++) {
    prisma(M(i), A(i, j), A(i, j + 1), M(i + 1), A(i + 1, j), A(i + 1, j + 1));
    prisma(A(i, j), A(i, j + 1), B(i, j + 1), A(i + 1, j), A(i + 1, j + 1), B(i + 1, j + 1));
    prisma(A(i, j), B(i, j + 1), B(i, j), A(i + 1, j), B(i + 1, j + 1), B(i + 1, j));
  }
  for (const [i, sp] of [[0, spitzeL], [ns - 1, spitzeR]]) for (let j = 0; j < nv; j++) {
    tets.push(M(i), A(i, j), A(i, j + 1), sp, A(i, j), A(i, j + 1), B(i, j + 1), sp, A(i, j), B(i, j + 1), B(i, j), sp);
  }
  const ringe = new Int32Array(ns * nv);
  for (let i = 0; i < ns; i++) for (let j = 0; j < nv; j++) ringe[i * nv + j] = B(i, j);
  return { pos, tets, ringe, ns, nv, spitzen: [spitzeL, spitzeR] };
}
