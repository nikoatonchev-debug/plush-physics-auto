// Testet jede Stufe ohne Bild: bleibt die Kugel oben, steckt sie, oder ist sie durch?
// Aufruf: node werkzeuge/kugeltest.mjs [weich-json] [stufe]
const S = await import('../szenen/kugel-loch.js');
S.konfiguriere({}, { fps: 30 });
const weich = process.argv[2] && process.argv[2] !== '-' ? JSON.parse(process.argv[2]) : undefined;
const nur = process.argv[3] ? [Number(process.argv[3])] : S.STUFEN;
for (const st of nur) {
  const t0 = Date.now();
  const r = S.neueRunde(st, { sub: process.env.SUB ? Number(process.env.SUB) : undefined, weich: weich ? { ...S.WEICH, ...weich } : undefined, form: process.env.FORM ? { [st]: Number(process.env.FORM) } : undefined, v0: process.env.V0 ? Number(process.env.V0) : undefined });
  const bilder = Math.round(S.TAKT * S.FPS); const ev = [];
  const spur = [];
  for (let f = 0; f < bilder; f++) {
    r.schritte(r.sub);
    for (const e of r.ereignisse()) if (e.art !== 'quetsch') ev.push(`${(f / S.FPS).toFixed(2)}:${e.art}${e.ort ? '/' + e.ort : ''}:${(e.staerke ?? 0).toFixed(2)}`);
    if (f % 15 === 0) spur.push(r.mitte()[1].toFixed(3));
  }
  const m = r.mitte();
  let kaputt = 0; if (r.kp.vol0) for (let t = 0; t < r.kp.nt; t++) if (r.kp.volumen(t, r.kp.x) / r.kp.vol0[t] < 0.25) kaputt++;
  console.log(`${st}%: Mitte y ${spur.join(' ')} | Ende ${m.map(v => v.toFixed(3)).join(',')} ${r.durch ? 'DURCH' : 'OBEN'} umgestülpt ${kaputt}/${r.kp.nt ?? 0} ${m.some(Number.isNaN) ? 'NaN!' : ''} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log('   ', ev.join('  '));
}
