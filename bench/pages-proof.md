# Pages repair proof — 2026-10-28

Task `adestia-correctifs-pages-preuve`. Docker is absent: the host bench, built shell,
`bench/launch.mjs --engine fake` (scripted engine) and the pod's Chromium. Captures stay
local (`bench/shots-pages-proof/<skin>/<locale>/`, git-ignored); the scenario regenerates them.

```sh
npm run build
node bench/scenarios/chat-matrix.mjs bench/scenarios/pages-proof.mjs --out bench/shots-pages-proof
```

Result: 4 skins (alfred, nestor, dobby, skippy) × `en`/`fr`, each 24 captures (light/dark, 1440/360)
plus the E-5/E-6 geometry. `pages-reglages.mjs` (E-6, written by the settings task) is replayed
unchanged first: 28/28 in all eight runs. Every assertion of `pages-proof.mjs` passed in all eight.

## What the captures show, against `docs/ecrans.md`

- `E-4-root-*` — ecrans.md:50 (root page: Home then title, no folder crumb). Seen: « Accueil / Root proof » / « Home / Root proof », no folder crumb, last crumb not a link; at 360 px the crumbs fit one line.
- `E-8-root` (asserted, link then clicked) — ecrans.md:171/781: the missing root page offers Home (« Accueil »/« Home »), which goes to `#/`.
- `E-4-readonly-*` — ecrans.md:753/771: read-only banner and raw source; under `fr` the diagnostic reads « Bloc inconnu « :::unknown-proof ». Le vocabulaire est fermé… » (seen in dobby dark), no English left; author text intact. Block name stays as authored.
- `E-4-crlf-*`, `E-3-crlf-*` — ecrans.md:773: CRLF page shows status=active, role=proof, cat=bench in the editor popover and the section facet, equal to the API/index fields.
- `E-23-crlf-*` — ecrans.md:773/186: CRLF scheduled note shows its title, `07:30, 12:30`, `expired 2026-10-01`, disabled, no problem. This was red before: `plugins/planif/api.mjs` had its own LF-only fence reader; fixed in this task.
- `E-5-*-open|scroll|resize`, `geometry.json` (E-6 popover) — the settings panel stays under the canvas header and problem bands, follows scroll, remains inside the viewport (`overlaps: []`, `ok: true`); seen in nestor/en light at 1440.

## Real agent turn

`bench/scenarios/pages-agent.mjs`, real Claude (token available): Read then Edit on `notes.md`,
content preserved, `PAGE-AGENT-PROOF` read back through API and browser (conversation
`cbbcb914-725c-416b-818e-bef5fed4bbd9`).

## Not covered

The open page does not refresh after an agent write (P-5 step 7): kept in ARCHITECTURE.md › Known defects.
