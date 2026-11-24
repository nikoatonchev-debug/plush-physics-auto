// Testet die Flugbahn jeder Pille ohne Bild: wo springt sie, wo landet sie, liegt sie am Ende im Glas?
// Aufruf: node werkzeuge/pillentest.mjs [anschub-json]
const S = await import('../szenen/pillen-glas.js');
S.konfiguriere({}, { fps: 30 });
const anschub = process.argv[2] ? JSON.parse(process.argv[2]) : undefined;
const lauf = S.neuerLauf({ anschub });
const bilder = Math.round(S.GESAMT_SEK * S.FPS);
const info = S.STUFEN.map(() => ({ lippe: null, landeX: null, maxY: -1, letztY: null }));
const t0 = Date.now();
let ereignisZahl = 0;
for (let f = 0; f < bilder; f++) {
  lauf.schritte(lauf.sub);
  ereignisZahl += lauf.ereignisse().filter(e => e.art === 'stoss').length;
  lauf.pillen.forEach((pl, n) => {
    if (!pl.aktiv) return;
    const m = lauf.mitte(n), i = info[n];
    if (i.lippe === null && m[0] > S.HUEGEL.lippe) i.lippe = f / S.FPS;
    if (i.lippe !== null && i.landeX === null && i.letztY !== null && i.letztY > S.GLAS.h + 0.06 && m[1] <= S.GLAS.h + 0.06) i.landeX = m[0];
    i.letztY = m[1];
    if (m.some(Number.isNaN)) i.nan = true;
  });
}
lauf.pillen.forEach((pl, n) => {
  const m = lauf.mitte(n), i = info[n];
  const drin = Math.hypot(m[0] - S.GLAS.x, m[2]) < S.GLAS.ri && m[1] < S.GLAS.h + 0.05;
  console.log(`${pl.stufe}%: Lippe ${i.lippe?.toFixed(2)} s, Landung x=${i.landeX?.toFixed(3)} (Glas ${S.GLAS.x}), Ende (${m.map(v => v.toFixed(3)).join(', ')}) ${drin ? 'IM GLAS' : 'DANEBEN'}${i.nan ? ' NaN!' : ''}`);
});
console.log(`Stöße: ${ereignisZahl}, Zeit ${((Date.now() - t0) / 1000).toFixed(1)} s für ${bilder} Bilder`);
