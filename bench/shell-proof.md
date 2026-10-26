# Shell correction proof — 2026-10-26

Task `adestia-correctifs-shell-preuve`, product revision `36f3870` (epic merged).
This task changes no runtime behaviour and adds no unit tests. Results below
are observations of that revision; documentation-only commits preserve it.
The required merge keeps the chat repairs from `afcc9bd` and all shell repairs.
The shell decision is now AD-24: AD-22/server and AD-23/chat retain their target IDs.

## Bench and replay

Docker is absent. The host bench uses the built server and shell,
`bench/launch.mjs --engine fake`, and the pod's Playwright/Chromium.
The engine is scripted; these captures do not attest a real CLI or deployment.

After `npm run build`, for each skin (`alfred`, `dobby`, `nestor`, `skippy`)
and locale (`en`, `fr`):

```sh
BENCH_LOCALE="$locale" node bench/sweep.mjs --skin "$skin" --locale "$locale" \
  --out "bench/shots-shell-preuve-merged/$locale"
```

`--locale` is necessary: `sweep.mjs` does not itself read `BENCH_LOCALE`.
Separate locale directories prevent one run overwriting the other.
Each complete sweep covers E-1 to E-31, light/dark, 1440×900 and 390×844:
124 PNGs. Capture files and logs are local, git-ignored evidence, not shipped assets.

| Skin | English | French |
|---|---|---|
| Alfred | exit 0, 124/124 | exit 0, 124/124 |
| Dobby | exit 0, 124/124 | exit 0, 124/124 |
| Nestor | exit 0, 124/124 | exit 0, 124/124 |
| Skippy | exit 0, 124/124 | exit 0, 124/124 |

## Images opened

All eight sweeps on the merged product exit 0: 992 captures in total.
For Alfred, Dobby, Nestor and Skippy, in English and French, the screens
below were opened in both themes at 1440 and 390 px: 40 labelled contact
sheets made from the actual PNGs, ten screens per matrix (E-2 included).
Every observation below applies to those eight matrices.

| Screen | What was inspected and seen |
|---|---|
| E-9 | Four settings tiles; MCP chip and subtitle both say 7 servers, 2 needing attention. The fixture lists seven entries, including two differently sourced `fichiers` entries. |
| E-10 | MCP cards and state chips; seven listed entries agree with E-9; two-column phone layout. |
| E-11 | Search, creation buttons, grouped file cards and delivered badges: relu, rien à corriger. The page continues in the canvas scroll area. |
| E-12 | Centred desktop sheet, bottom phone sheet, catalogue list and repository/ref/token fields; no second scrim. The phone form continues below the fold. |
| E-14 | First switches remain beside the start of their labels; default/restart badges and explanations wrap inside the field. |
| E-19 | Refused/degraded bands; manifest heading follows `en`/`fr` (Manifeste de plugin invalide); validator lines remain server data. Phone text wraps within the band. |
| E-20 | Plug icon, inactive-app sentence and Home control: relu, rien à corriger. `Sans vue` is the fixture plugin's title, including under `en`. |
| E-1 | Sign-in gate: centred card, lock, sentence and action in light/dark at both widths; relu, rien à corriger. Loading spinner is separately captured and measured below. |
| E-15 | Credential state, renewal/forget actions, theme icons, OIDC sign-out and colophon: relu, rien à corriger. Phone popover stays inside the viewport. |

Skippy/en/fr: the console band stays on one line at 390 px in both forced
themes, with the engine name shortened; sheets and menu remain contained.
Nestor/en/fr: the invitation arrow is crisp and centred inside its disc in all
four sweep variants; the rounded panels keep their shape in both palettes.
The three passes on 27c62b5 remain recorded in the task discussion; the
current matrix above is a fresh run after merging the epic.

## Supplemental observations

These supplements were captured on `27c62b5`, before the required merge.
The merge changes no gate, skin or configuration layout source. The loading
and scrolled-switch sheets were reopened in this attempt.

The 80 captures of `node bench/scenarios/shell-habillage.mjs preuve --out
bench/shots-shell-preuve/habillage` completed with exit 0. Skippy’s band is
29 px high with scrollWidth = clientWidth = 360 in both locales/themes.
E-14’s first label and switch have identical top coordinates in all variants.
Some 360×740 captures leave the first control below the fold (Dobby/fr): a
second pass scrolls that field into view, measures alignment and containment,
and takes 16 further pictures. All 16 measures pass and those pictures were opened.
The French label may take two lines; the switch stays at its first line.

The inherited scenario sets browser `colorScheme`, without forcing
`adestia.theme`; Dobby and Skippy can keep their default dark scheme. Its
light-labelled pictures alone do not attest their light theme. The sweep
forces the stored theme, as does the scrolled E-14 supplement. Those are the
two-theme proof. Nestor’s invitation and Skippy’s band were also opened
at 1440/360 px in both languages; Nestor’s arrow is crisp in its disc, and
Skippy’s band occupies one line. Its hero remains tall and narrow at 360/390 px; this observation does
not assert a redesign or a repair of that hero (outside the nine entries).

LoadingGate: 32 pictures (four configured skins, two browser locales, both
themes, 1440/390 px) were opened. The `/api/instance` request was held to keep
the actual loading state visible. The gate precedes the skin being loaded and
therefore correctly uses the base palette in all four cases. Its loader is
visible and centred, says Loading… / Chargement…, rotates with
`adestia-icon-spin`, and computes `animation-name: none` with reduced motion.
E-1: relu, rien à corriger.

## Nine original AD-17 shell entries

| Original entry | Disposition and existing guard |
|---|---|
| Nestor's `↑` | Repaired: inline SVG in `currentColor`; `packages/web/test/skin-nestor-invite.test.ts` pins SVG, stroke and no text in both locales. `shell-habillage.mjs` also measures it. |
| MCP tile/badge disagreement | Repaired: chip and subtitle count `/api/mcp/servers`, attention joins health by name. `shell-textes.test.tsx` checks 6 listed / 7 reported, ignoring the unlisted failed server. |
| Skippy's phone banner | Repaired: one line at 360 px; `bench/scenarios/shell-habillage.mjs` checks height ≤40 px and no horizontal overflow. Supplement on `27c62b5`: exit 0 (80 captures). |
| E-14 switch apart from title | Repaired: no wrap between label and switch. The same scenario checks their `top` difference ≤8 px at 360 px. Supplement on `27c62b5`: exit 0 (80 captures). |
| E-19 detail in English under `fr` | Heading repaired, pinned with intact validator lines by `shell-textes.test.tsx`. `field: message` lines are **kept**: English validator sentences; translating them needs a new keyed table (AD-17/AD-24). |
| Token field without `autoComplete` | **Not reproduced**: already `autoComplete="off"` since `64dee0f`; `shell-textes.test.tsx` pins the driver's code input. The catalogue password field also already has the attribute. |
| “Invalid plugin manifest” in English | Repaired with E-19: plugin/skin headings, with/without folder name, go through the two word tables. The same test also pins unchanged English and literal placeholder-like folder names. |
| Duplicate `.adestia-icon--spin` | Repaired: one animation rule and keyframes, pinned across web stylesheets by `shell-textes.test.tsx`; reduced-motion override retained. |
| `CataloguePopin.refresh()` hides a throw | Repaired: catches and displays the message, releases the button; `shell-textes.test.tsx` injects an `onChanged` throw. |

## Scope and handoff

`ARCHITECTURE.md` Known defects already retains only the untranslated validator
lines and the closed/not-reproduced token report from this tranche.
`.agent/status.md` already points to that register and carries no repaired shell
defect; its current-branch paragraph now describes the merged chat tranche.
`phase-dev` reserves this file to integration: it was read, not modified here.
Integration should refresh that paragraph from the completed shell proof.
The earlier optional doc check on `27c62b5` found three inherited release-tag
metadata failures (22/25 passed); their exact reproduction and the need to
refresh publication metadata are in the task discussion, outside this shell
proof. No test was weakened to hide them.

The AD-17 shell row now records the eight repairs, the not-reproduced token
report and the kept validator lines, with this report as their detailed proof.
No ADR is created and no design decision is changed. `relire-doc` is absent from the
mounted skills, and this mission forbids delegation: independent reading is
left to the tester, rather than claimed as performed.

## Checks on the merged product

On `36f3870`: build, typecheck and lint exit 0; `npm test` exits 0:
174 Vitest files, 2697 tests passed, 2 skipped; 625 plugin tests passed.
The inherited E-19 timeout did not recur with no concurrent capture sweep
(2374 ms). No existing test was edited by this task. Changes to tests and
status in the merge are the target branch's changes, kept verbatim.
