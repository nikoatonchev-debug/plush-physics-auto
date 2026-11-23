// Gemeinsame Bühne: Renderer, Licht, Hintergrund, Materialien, Schrift.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const B = 1080, H = 1920;

// kleiner fester Zufall, damit jedes Bild gleich wird
export function zufall(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function buehne({ farbe = '#b8c1cd', kamera = [0, 1.9, 6.2], ziel = [0, 1.35, 0], fov = 28, breite = B, hoehe = H, fein = 1, mitAO = true } = {}) {
  // fein > 1: intern größer rechnen und verkleinern -> glattere Kanten, sauberere Flächen
  const RB = Math.round(breite * fein), RH = Math.round(hoehe * fein);
  const leinwand = document.createElement('canvas');
  leinwand.width = RB; leinwand.height = RH;
  const renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(RB, RH, false);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const szene = new THREE.Scene();
  const bg = new THREE.Color(farbe);
  szene.background = bg;
  szene.fog = new THREE.Fog(bg, 9, 22);

  const pmrem = new THREE.PMREMGenerator(renderer);
  szene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  szene.environmentIntensity = 0.85;

  const cam = new THREE.PerspectiveCamera(fov, breite / hoehe, 0.1, 60);
  cam.position.set(...kamera); cam.lookAt(...ziel);

  // Hohlkehle: Boden geht weich in die Rückwand über (wie im Fotostudio)
  const kehle = hohlkehle(farbe);
  szene.add(kehle);

  // Licht: großes weiches Fensterlicht von links oben + Aufhellung
  const sonne = new THREE.DirectionalLight(0xfff4e6, 2.4);
  sonne.position.set(-3.5, 6, 3.2);
  sonne.castShadow = true;
  sonne.shadow.mapSize.set(2048, 2048);
  sonne.shadow.camera.left = -3; sonne.shadow.camera.right = 3;
  sonne.shadow.camera.top = 4; sonne.shadow.camera.bottom = -2;
  sonne.shadow.radius = 14; sonne.shadow.blurSamples = 24;
  sonne.shadow.bias = -0.0004;
  szene.add(sonne);
  const fuell = new THREE.HemisphereLight(0xe9f0ff, 0x8d8a85, 0.7);
  szene.add(fuell);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(RB, RH, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(szene, cam));
  const ao = new GTAOPass(szene, cam, RB, RH);
  ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
  ao.blendIntensity = 0.9;
  if (mitAO) composer.addPass(ao);
  composer.addPass(new OutputPass());

  // Ausgabe mit Schrift
  const aus = document.createElement('canvas');
  aus.width = breite; aus.height = hoehe;
  const ctx = aus.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

  return {
    THREE, renderer, szene, cam, sonne, leinwand, aus,
    ctx,
    // Bewegungsunschärfe: mehrere Zwischenbilder gemittelt übereinanderlegen
    mischeAnfang() { this._n = 0; },
    mischeBild() {
      composer.render();
      this._n++;
      ctx.globalAlpha = 1 / this._n;
      ctx.drawImage(leinwand, 0, 0, breite, hoehe);
      ctx.globalAlpha = 1;
    },
    mischeEnde(text) {
      if (text) schrift(ctx, text);
      return aus.toDataURL('image/jpeg', 0.95);
    },
    zeichne(text, art = 'image/jpeg') {
      composer.render();
      ctx.drawImage(leinwand, 0, 0, breite, hoehe);
      if (typeof text === 'function') text(ctx); else if (text) schrift(ctx, text);
      return aus.toDataURL(art, 0.94);
    },
  };
}

function schrift(ctx, text) {
  ctx.save();
  ctx.font = '800 84px "Segoe UI", "Arial Black", "DejaVu Sans", "Liberation Sans", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(30,40,60,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, B / 2, 205);
  ctx.restore();
}

function hohlkehle(farbe) {
  // Profil: Boden (z vorne) -> Rundung -> Wand nach oben
  const pts = [];
  const r = 3, zWand = -4.5;
  pts.push(new THREE.Vector2(14, 0)); // weit vorne (x-Achse des Profils = z)
  for (let i = 0; i <= 24; i++) {
    const a = i / 24 * Math.PI / 2;
    pts.push(new THREE.Vector2(zWand + r - Math.sin(a) * r, r - Math.cos(a) * r));
  }
  pts.push(new THREE.Vector2(zWand, 14));
  const geo = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  const xs = [-14, 14], seg = 1;
  pts.forEach((p, i) => xs.forEach((x, j) => { pos.push(x, p.y, p.x); uv.push(j, i / (pts.length - 1)); }));
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.95, metalness: 0, envMapIntensity: 0.4 });
  // weiche diagonale Lichtstreifen wie durch ein Fenster
  mat.emissive = new THREE.Color('#ffffff');
  mat.emissiveMap = streifen();
  mat.emissiveIntensity = 0.12;
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

function streifen() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  g.filter = 'blur(18px)';
  g.fillStyle = '#fff';
  g.translate(256, 256); g.rotate(-0.55); g.translate(-256, -256);
  for (let i = 0; i < 6; i++) g.fillRect(-200 + i * 95, 300, 38 + (i % 2) * 22, 900);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------- Materialien ----------

export function gold({ farbe = '#ffcf63', metall = 1, rau = 0.09 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: farbe, metalness: metall, roughness: rau,
    clearcoat: 0.5, clearcoatRoughness: 0.05, envMapIntensity: 1.6,
  });
}

// Stein: heller Beton mit Poren und feinen Goldsprenkeln
export function stein(seed = 3, { ton = [206, 203, 196], sprenkel = 1 } = {}) {
  const W = 2048, Hh = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  const rau = document.createElement('canvas'); rau.width = W; rau.height = Hh;
  const gr = rau.getContext('2d');
  const met = document.createElement('canvas'); met.width = W; met.height = Hh;
  const gm = met.getContext('2d');
  const z = zufall(seed);
  const um = (x, r, fn) => { fn(x); if (x - r < 0) fn(x + W); if (x + r > W) fn(x - W); };
  g.fillStyle = `rgb(${ton})`; g.fillRect(0, 0, W, Hh);
  gr.fillStyle = 'rgb(200,200,200)'; gr.fillRect(0, 0, W, Hh);
  gm.fillStyle = '#000'; gm.fillRect(0, 0, W, Hh);
  // wolkige Flecken
  for (let i = 0; i < 900; i++) {
    const x = z() * W, y = z() * Hh, r = 40 + z() * 160, a = 0.02 + z() * 0.03;
    const d = z() < 0.5 ? 0 : 255;
    um(x, r, x => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${d},${d},${d},${a})`); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    });
  }
  // feines Korn
  const korn = g.getImageData(0, 0, W, Hh);
  for (let i = 0; i < korn.data.length; i += 4) {
    const n = (z() - 0.5) * 7;
    korn.data[i] += n; korn.data[i + 1] += n; korn.data[i + 2] += n;
  }
  g.putImageData(korn, 0, 0);
  // Poren
  for (let i = 0; i < 650; i++) {
    const x = z() * W, y = z() * Hh, r = 0.8 + z() ** 3 * 5;
    const f = `rgba(95,90,84,${0.18 + z() * 0.25})`;
    um(x, r * 2, x => {
      g.fillStyle = f; g.beginPath(); g.ellipse(x, y, r * 1.3, r, 0, 0, 7); g.fill();
      gr.fillStyle = 'rgb(255,255,255)'; gr.beginPath(); gr.arc(x, y, r, 0, 7); gr.fill();
    });
  }
  // Goldsprenkel
  for (let i = 0; i < 520 * sprenkel; i++) {
    const x = z() * W, y = z() * Hh, r = 1 + z() ** 2 * 3.5;
    const f = z() < 0.6 ? '#d9a54c' : '#c27a45';
    um(x, r, x => {
      g.fillStyle = f; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      gm.fillStyle = '#fff'; gm.beginPath(); gm.arc(x, y, r, 0, 7); gm.fill();
      gr.fillStyle = 'rgb(60,60,60)'; gr.beginPath(); gr.arc(x, y, r, 0, 7); gr.fill();
    });
  }
  const tex = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return new THREE.MeshStandardMaterial({
    map: tex(c, true), roughnessMap: tex(rau), metalnessMap: tex(met),
    roughness: 0.92, metalness: 1, envMapIntensity: 0.9,
  });
}

// ---------- weiche Oberfläche aus dem Physikgitter (periodisch in u und v) ----------
export function glattesRingNetz(nu, nv, fein = 2) {
  const Nu = nu * fein, Nv = nv * fein;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(Nu * Nv * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i < Nu; i++) for (let j = 0; j < Nv; j++) {
    const a = i * Nv + j, b = ((i + 1) % Nu) * Nv + j, c = ((i + 1) % Nu) * Nv + (j + 1) % Nv, d = i * Nv + (j + 1) % Nv;
    idx.push(a, d, b, b, d, c);
  }
  geo.setIndex(idx);
  const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const tmp = new Float64Array(Nu * nv * 3);
  return {
    geo,
    aktualisiere(x) {
      // erst entlang u verfeinern, dann entlang v
      for (let I = 0; I < Nu; I++) {
        const i = Math.floor(I / fein), t = (I % fein) / fein;
        for (let j = 0; j < nv; j++) for (let k = 0; k < 3; k++) {
          const g = q => x[(((i + q + nu) % nu) * nv + j) * 3 + k];
          tmp[(I * nv + j) * 3 + k] = cr(g(-1), g(0), g(1), g(2), t);
        }
      }
      for (let I = 0; I < Nu; I++) for (let J = 0; J < Nv; J++) {
        const j = Math.floor(J / fein), t = (J % fein) / fein;
        for (let k = 0; k < 3; k++) {
          const g = q => tmp[(I * nv + ((j + q + nv) % nv)) * 3 + k];
          pos[(I * Nv + J) * 3 + k] = cr(g(-1), g(0), g(1), g(2), t);
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    },
  };
}

// Glatte Kapsel-Oberfläche: Ringe entlang der Achse (offen) × rundherum (periodisch), Enden mit Spitze geschlossen
export function glattesKapselNetz(ns, nv, fein = 3) {
  const Ns = (ns - 1) * fein + 1, Nv = nv * fein;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((Ns * Nv + 2) * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i + 1 < Ns; i++) for (let j = 0; j < Nv; j++) {
    const a = i * Nv + j, b = (i + 1) * Nv + j, c = (i + 1) * Nv + (j + 1) % Nv, d = i * Nv + (j + 1) % Nv;
    idx.push(a, b, d, b, c, d);
  }
  const tl = Ns * Nv, tr = Ns * Nv + 1;
  for (let j = 0; j < Nv; j++) { idx.push(tl, j, (j + 1) % Nv); idx.push(tr, (Ns - 1) * Nv + (j + 1) % Nv, (Ns - 1) * Nv + j); }
  geo.setIndex(idx);
  const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const tmp = new Float64Array(Ns * nv * 3);
  return {
    geo,
    aktualisiere(ringe, spL, spR) { // ringe: ns×nv Punkte (x,y,z), spL/spR: Spitzen
      for (let I = 0; I < Ns; I++) {
        const i = Math.min(Math.floor(I / fein), ns - 2), t = I / fein - i;
        for (let j = 0; j < nv; j++) for (let k = 0; k < 3; k++) {
          const g = q => ringe[(Math.min(ns - 1, Math.max(0, i + q)) * nv + j) * 3 + k];
          tmp[(I * nv + j) * 3 + k] = cr(g(-1), g(0), g(1), g(2), t);
        }
      }
      for (let I = 0; I < Ns; I++) for (let J = 0; J < Nv; J++) {
        const j = Math.floor(J / fein), t = (J % fein) / fein;
        for (let k = 0; k < 3; k++) {
          const g = q => tmp[(I * nv + ((j + q + nv) % nv)) * 3 + k];
          pos[(I * Nv + J) * 3 + k] = cr(g(-1), g(0), g(1), g(2), t);
        }
      }
      for (let k = 0; k < 3; k++) { pos[tl * 3 + k] = spL[k]; pos[tr * 3 + k] = spR[k]; }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    },
  };
}
