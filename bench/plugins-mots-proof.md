# Plugin words — AD-24 b

The atelier uses the instance locale's plural rule: French reads `0 pièce`,
`1 pièce`, `2 pièces`; English reads `0 pieces`, `1 piece`, `2 pieces`.
The hub, plates and groove groups share that choice. Voyages counters carry
complete singular/plural French phrases in their table; `%one` and `%n`
distinguish keys whose English adjective is identical in both numbers.

Reproduce on the host, with the scripted engine, after `npm ci` and `npm run build`:

```sh
node bench/scenarios/chat-matrix.mjs bench/scenarios/plugins-mots.mjs --out bench/shots-mots
```

The scenario uses the real plugins seed and intercepts only the workbook GET to
exercise plates with zero, one and two pieces. It also reads the natural trips
counters, planif's `until` and clock-off sentences, and the route's 95 m warning.
Each skin/language gets a `report.json` and five captures per theme/width under
`bench/shots-mots/<skin>/<locale>/` (ignored by git).

Before the correction (`f810679`), the natural seed's second plate said
`PLAQUE P2MEL8 · 1 pièces`. Rendering count variants also showed `0 pièces`.
Planif's `until %when`, `clock off — nothing will run`, the route warning and
voyages' gesture titles already had complete table entries; they needed no
rewording. The additional composition found was voyages' translated adjective
followed by an `s`; its rendered words stay the same after the repair.

A manual AST survey of all 37 `plugins/*/web/*.js` files inspected templates
and `+` expressions containing `t()`, with markup removed before reading the
literal text. After the repair its remaining candidates are the internal
`%LEDE%` replacement marker, the `tronconnage` discriminator used to count
pieces (three nested expressions on one line), and two `mm` unit labels.
These are not untranslated interface sentences. This survey is evidence for
the reviewer, not the independent closed-inventory test requested by the task.
The reviewer must write that test and the piece-count regressions under the
phase-dev/review division of work.

The English server diagnostics of E-23 and E-27, and workbook/card data, stay
as received (AD-17). They remain in Known defects with their reasons.
`TU_A_CORRIGER` is already empty; no exception was added. `.agent/status.md`
already contained no `1 pièces` entry and was left untouched under phase-dev.

The existing `atelier/test/langue.test.js` snapshot still expects `0 pièces`
in `hub-fr.txt`. Its only diff is the requested `0 pièce`; a modification
request is recorded in the task discussion for the reviewer, who owns tests.

Validation on 2026-10-28, sources `18025fe`: all eight skin/language pairs
passed their four theme/width variants (32 variants, 160 captures). The final
matrix process stopped with exit 143 after seven pairs; Skippy/fr was rerun
alone and exited 0. All eight reports contain the three count assertions and
the complete planif/parcours sentences. No Docker was available; these are host
Chromium captures against the fake-engine launcher.

Captures inspected include Alfred/fr light desk and phone, Alfred/en dark
phone, Nestor/en light desk and Nestor/fr dark phone, Dobby/fr light desk and
Dobby/en dark phone, Skippy/fr dark phone and Skippy/en light desk. `1 pièce`
and `1 piece` fit their header in every inspected skin, without a new wrap or
clip. Alfred/fr dark-desk planif shows both complete French phrases, with the
server diagnostics still in English. Skippy/fr light-phone parcours shows
`⚠ à 95 m de la trace`; its English counterpart shows `⚠ 95 m from the route`.
No style or token changed.

`npm run test:plugins`: 648 passed, the one outdated snapshot failed (649 total).
`node --test plugins/test/words.test.js`: 31 passed. Lint, typecheck and build
succeeded. The broader `npm test` process was interrupted with exit 143 after
98 Vitest files passed; this is not evidence of a complete workspace pass.
