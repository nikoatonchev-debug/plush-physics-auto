# Plush Physics – Video des Tages

Erstellt jeden Tag automatisch ein neues „0% vs 100% SOFT“-Video (Weichkörper-Physik, three.js) und legt es unter **Releases** ab.

- Szene des Tages würfeln: `lib/variante.js`
- Physik: `lib/tetphysik.js` (Neo-Hooke-Material, XPBD)
- Aufnahme: `werkzeuge/taeglich.mjs` → `werkzeuge/aufnahme.mjs`
- Ablauf auf GitHub: `.github/workflows/taeglich.yml` (täglich 04:00 UTC, auch per Knopf startbar)
