// Würfelt aus einem Startwert (z. B. dem Datum) jeden Tag eine andere Szene.
// Gleicher Startwert -> immer dieselbe Szene (nachvollziehbar, wiederholbar).

export function zufallAus(text) {
  let h = 2166136261;
  for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const HINTERGRUENDE = [
  { name: 'Nebelblau', farbe: '#b9c2cd' }, { name: 'Salbei', farbe: '#bcc8bd' }, { name: 'Sand', farbe: '#d3c7b6' },
  { name: 'Lavendel', farbe: '#c4bfd3' }, { name: 'Pfirsich', farbe: '#dcc3b6' }, { name: 'Steingrau', farbe: '#c4c4c2' },
];
const MATERIALIEN = [
  { name: 'Gold', en: 'Gold', farbe: '#ffcf63', metall: 1, rau: 0.09 },
  { name: 'Roségold', en: 'Rose Gold', farbe: '#f2b29a', metall: 1, rau: 0.1 },
  { name: 'Silber', en: 'Silver', farbe: '#e8ecf0', metall: 1, rau: 0.08 },
  { name: 'Kupfer', en: 'Copper', farbe: '#e8875a', metall: 1, rau: 0.12 },
  { name: 'Rosa', en: 'Pink', farbe: '#ff8fb8', metall: 0, rau: 0.18 },
  { name: 'Mint', en: 'Mint', farbe: '#7fe0c0', metall: 0, rau: 0.18 },
  { name: 'Himmelblau', en: 'Blue', farbe: '#7fb6ff', metall: 0, rau: 0.18 },
];

export function waehleVariante(startwert) {
  const z = zufallAus(startwert);
  const aus = l => l[Math.floor(z() * l.length)];
  const zw = (a, b) => a + (b - a) * z();
  z();                                               // (früher: Szenenwahl – Zufallsfolge bleibt gleich)
  // Zurzeit nur „Kugel durch Granitringe“ (Vorbild vom Nutzer: Granit + Gold + Farbhintergrund)
  // vorher: „Kugel durchs Loch“ (nach dem Vorbild der erfolgreichsten TikTok-Videos, mit neuem Ton).
  // Nur Metall-Farben, weil der harte Klang eine Metallkugel ist.
  const szene = 'kugel-ringe';
  const v = { startwert: String(startwert), szene, hintergrund: aus(HINTERGRUENDE), material: aus(MATERIALIEN.filter(m => m.metall === 1)), steinSaat: Math.floor(z() * 1000) };
  if (szene === 'ring-steinturm') {
    const n = 3 + Math.floor(z() * 3);                 // 3 bis 5 Kiesel über der Bodenplatte
    const oben = zw(0.21, 0.26), unten = zw(0.4, 0.46);
    const kiesel = [];
    for (let i = 0; i < n; i++) {
      const rx = unten + (oben - unten) * (i / (n - 1));
      kiesel.push({ rx, ry: rx * zw(0.68, 0.8) });
    }
    v.steine = [{ rx: zw(0.72, 0.85), ry: zw(0.16, 0.21) }, ...kiesel];
    const r = zw(0.07, 0.09);
    v.ring = { R: oben + r - zw(0.015, 0.03), r };
  } else {
    v.kapseln = 2 + Math.floor(z() * 3);               // 2 bis 4 Kapseln
    v.stufen = 6 + Math.floor(z() * 4);                // 6 bis 9 Stufen
    v.kapselL = zw(0.32, 0.42);
  }
  return v;
}

// Titel/Beschreibung für YouTube (englisch, damit es weltweit gefunden wird)
export function texte(v) {
  if (v.szene === 'kugel-ringe') {
    const ding = `${v.material.en} Ball`;
    return {
      titel: `0% vs 100% Soft ${ding} vs Stone Rings 🫠 #satisfying #shorts`,
      beschreibung: `how many rings can it pass?? 🫠
${ding} at 0%, 25%, 50%, 75% and 100% softness.
turn your sound ON 🔊

#satisfying #softbody #simulation #asmr #oddlysatisfying`,
      tags: ['satisfying', 'soft body simulation', '3d animation', 'asmr', 'oddly satisfying'],
    };
  }
  if (v.szene === 'kugel-loch') {
    const ding = `${v.material.en} Ball`;
    return {
      titel: `0% vs 100% Soft ${ding} vs Tiny Hole 🫠 #satisfying #shorts`,
      beschreibung: `will it fit through the hole?? 🫠
${ding} at 0%, 25%, 50%, 75% and 100% softness.
turn your sound ON 🔊

#satisfying #softbody #simulation #asmr #oddlysatisfying`,
      tags: ['satisfying', 'soft body simulation', '3d animation', 'asmr', 'oddly satisfying'],
    };
  }
  if (v.szene === 'pillen-glas') {
    const ding = `${v.material.en} Pills`;
    return {
      titel: `0% vs 100% Soft ${ding} Jump Into a Glass 🫠 #satisfying #shorts`,
      beschreibung: `which one makes it into the glass?? 🫠
${ding} rolling down a hill at 0%, 25%, 50%, 75% and 100% softness.
turn your sound ON 🔊

#satisfying #softbody #simulation #asmr #oddlysatisfying`,
      tags: ['satisfying', 'soft body simulation', '3d animation', 'asmr', 'oddly satisfying'],
    };
  }
  const ding = v.szene === 'ring-steinturm' ? `${v.material.en} Ring` : `${v.material.en} Capsules`;
  const ort = v.szene === 'ring-steinturm' ? 'on a Stone Tower' : 'on Stone Stairs';
  return {
    titel: `0% vs 100% Soft ${ding} ${ort} 🫠 #satisfying #shorts`,
    beschreibung: `how soft is too soft?? 🫠\n${ding} ${ort} at 0%, 25%, 50%, 75% and 100% softness.\nturn your sound ON 🔊\n\n#satisfying #softbody #simulation #asmr #oddlysatisfying`,
    tags: ['satisfying', 'soft body simulation', '3d animation', 'asmr', 'oddly satisfying'],
  };
}
