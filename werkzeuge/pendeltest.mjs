// Testet jede Gewichtsstufe ohne Bild: wie viele Klötzchen lösen sich, wie weit kommt das Pendel?
// Aufruf: node werkzeuge/pendeltest.mjs [einst-json] [kg]
const S = await import('../szenen/pendel-wuerfel.js');
S.konfiguriere({}, { fps: 30 });
const ueber = process.argv[2] && process.argv[2] !== '-' ? JSON.parse(process.argv[2]) : {};
const nur = process.argv[3] ? [Number(process.argv[3])] : S.STUFEN;
for (const kg of nur) {
  const t0 = Date.now();
  const r = S.neueRunde(kg, ueber);
  let minX = 9, ev = [];
  for (let f = 0; f < S.TAKT * S.FPS; f++) {
    r.bild();
    const L = r.sim.rammeLage(); minX = Math.min(minX, L.mx - S.PENDEL.l / 2);
    for (const e of r.ereignisse()) if (e.art !== 'klapper' && e.art !== 'bruch') ev.push(`${(f / S.FPS).toFixed(2)}:${e.art}${e.n ? '×' + e.n : ''}${e.tempo ? '@' + e.tempo.toFixed(2) : ''}`);
  }
  const s = r.sim;
  console.log(`${kg} kg: gelöst ${s.frei.length + s.liegend.length}, frei ${s.frei.length}, Spitze bis x=${minX.toFixed(3)} (Würfel -0.56..0), Winkel jetzt ${s.P.phi.toFixed(2)} ${JSON.stringify(s.grund)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log('   ', ev.slice(0, 14).join('  '), ev.length > 14 ? `… (${ev.length})` : '');
}
