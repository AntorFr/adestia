# Shell correction proof — 2026-10-26

Task `adestia-correctifs-shell-preuve`, product revision `27c62b5`.
This task changes no runtime behaviour and adds no unit tests. Results below
are observations of that revision; documentation-only commits preserve it.

## Bench and replay

Docker is absent. The host bench uses the built server and shell,
`bench/launch.mjs --engine fake`, and the pod's Playwright/Chromium.
The engine is scripted; these captures do not attest a real CLI or deployment.

After `npm run build`, for each skin (`alfred`, `dobby`, `nestor`, `skippy`)
and locale (`en`, `fr`):

```sh
BENCH_LOCALE="$locale" node bench/sweep.mjs --skin "$skin" --locale "$locale" \
  --out "bench/shots-shell-preuve/$locale"
```

`--locale` is necessary: `sweep.mjs` does not itself read `BENCH_LOCALE`.
Separate locale directories prevent one run overwriting the other.
Each complete sweep covers E-1 to E-31, light/dark, 1440×900 and 390×844:
124 PNGs. Capture files and logs are local, git-ignored evidence, not shipped assets.

| Skin | English | French |
|---|---|---|
| Alfred | exit 0, 124/124 | exit 0, 124/124 |
| Dobby | pending | pending |
| Nestor | pending | pending |
| Skippy | pending | pending |

## Images opened

First complete visual passes: Alfred, English and French, both themes, 1440 and 390 px.
The images were opened in labelled contact sheets made from the actual PNGs.

| Screen | What was inspected and seen |
|---|---|
| E-9 | Four settings tiles; MCP chip and subtitle both say 7 servers, 2 needing attention. The fixture lists seven entries, including two differently sourced `fichiers` entries. |
| E-10 | MCP cards and state chips; seven listed entries agree with E-9; two-column phone layout. |
| E-11 | Search, creation buttons, grouped file cards and delivered badges: relu, rien à corriger. The page continues in the canvas scroll area. |
| E-12 | Centred desktop sheet, bottom phone sheet, catalogue list and repository/ref/token fields; no second scrim. The phone form continues below the fold. |
| E-14 | First switches remain beside the start of their labels; default/restart badges and explanations wrap inside the field. |
| E-19 | Refused/degraded bands; manifest heading is English under `en`, validator lines remain server data. Phone text wraps within the band. |
| E-20 | Plug icon, inactive-app sentence and Home control: relu, rien à corriger. `Sans vue` is the fixture plugin's title, including under `en`. |
| E-1 | Sign-in gate: centred card, lock, sentence and action in light/dark at both widths; relu, rien à corriger. Loading spinner is separately captured and measured below. |
| E-15 | Credential state, renewal/forget actions, theme icons, OIDC sign-out and colophon: relu, rien à corriger. Phone popover stays inside the viewport. |

Additional matrices still to inspect: Dobby, Nestor and
Skippy, including Nestor's invitation arrow and Skippy's console band.

## Supplemental observations

The 80 captures of `node bench/scenarios/shell-habillage.mjs preuve --out
bench/shots-shell-preuve/habillage` completed with exit 0. Skippy’s band is
29 px high with scrollWidth = clientWidth = 360 in both locales/themes.
E-14’s first label and switch have identical top coordinates in all variants.
Some 360×740 captures leave the first control below the fold (Dobby/fr): a
second pass scrolls that field into view, measures alignment and containment,
and takes 16 further pictures. All 16 measures pass.

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
| Skippy's phone banner | Repaired: one line at 360 px; `bench/scenarios/shell-habillage.mjs` checks height ≤40 px and no horizontal overflow. Fresh run exit 0 (80 captures). |
| E-14 switch apart from title | Repaired: no wrap between label and switch. The same scenario checks their `top` difference ≤8 px at 360 px. Fresh run exit 0 (80 captures). |
| E-19 detail in English under `fr` | Heading repaired, pinned with intact validator lines by `shell-textes.test.tsx`. `field: message` lines are **kept**: English validator sentences; translating them needs a new keyed table (AD-17/AD-22). |
| Token field without `autoComplete` | **Not reproduced**: already `autoComplete="off"` since `64dee0f`; `shell-textes.test.tsx` pins the driver's code input. The catalogue password field also already has the attribute. |
| “Invalid plugin manifest” in English | Repaired with E-19: plugin/skin headings, with/without folder name, go through the two word tables. The same test also pins unchanged English and literal placeholder-like folder names. |
| Duplicate `.adestia-icon--spin` | Repaired: one animation rule and keyframes, pinned across web stylesheets by `shell-textes.test.tsx`; reduced-motion override retained. |
| `CataloguePopin.refresh()` hides a throw | Repaired: catches and displays the message, releases the button; `shell-textes.test.tsx` injects an `onChanged` throw. |

## Scope and handoff

`ARCHITECTURE.md` Known defects already retains only the untranslated validator
lines and the closed/not-reproduced token report from this tranche.
`.agent/status.md` already points to that register and carries no repaired shell
defect; its current-branch paragraph still describes the server tranche.
`phase-dev` reserves this file to integration: it was read, not modified here.
Integration should refresh that paragraph from the completed shell proof.

No ADR is created and no design decision is changed. The AD-17 shell row will
be closed after the remaining visual passes. `relire-doc` is absent from the
mounted skills, and this mission forbids delegation: independent reading is
left to the tester, rather than claimed as performed.
