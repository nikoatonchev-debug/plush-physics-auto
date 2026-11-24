// Testet jede Gewichtsstufe ohne Bild. Aufruf: node werkzeuge/pendeltest.mjs [einst-json] [kg]
const S = await import('../szenen/pendel-wuerfel.js');
S.konfiguriere({}, { fps: 30 });
const ueber = process.argv[2] && process.argv[2] !== '-' ? JSON.parse(process.argv[2]) : {};
const nur = process.argv[3] ? [Number(process.argv[3])] : S.STUFEN;
for (const kg of nur) {
  const t0 = Date.now();
  const r = S.neueRunde(kg, ueber);
  let minX = 9, ev = [], spur = [];
  for (let f = 0; f < S.TAKT * S.FPS; f++) {
    r.bild();
    const L = r.sim.rammeLage(); minX = Math.min(minX, L.mx - L.ax * S.PENDEL.l / 2);
    for (const e of r.ereignisse()) if (e.art === 'ramme') ev.push(`${(f / S.FPS).toFixed(2)}:schlag@${e.tempo.toFixed(2)}`);
    if (f % 10 === 9) spur.push(`${r.sim.P.om.toFixed(2)}`);
  }
  const s = r.sim; let kap = 0, nan = 0;
  for (let i = 0; i < s.n; i++) { if (s.zust[i]) kap++; if (Number.isNaN(s.x[3 * i])) nan++; }
  const gebrochen = kap, W = s.W;
  let maxY = 0; for (let i = 0; i < s.n; i++) maxY = Math.max(maxY, s.x[3 * i + 1]);
  let weit = 0; for (let i = 0; i < s.n; i++) weit = Math.max(weit, Math.hypot(s.x[3 * i] + 0.28, s.x[3 * i + 2]));
  const mittelTempo = 0;
  console.log(`${kg} kg: lose ${kap}/${s.n}, Würfel bei ${W.X.map(v => v.toFixed(3)).join(',')}, Spitze bis x=${minX.toFixed(3)}, höchstes y=${maxY.toFixed(2)} am weitesten ${weit.toFixed(2)} m ${nan ? 'NaN ' + nan : ''}(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log('    ', ev.join(' '), '| Pendel-Drehtempo:', spur.join(' '));
}
