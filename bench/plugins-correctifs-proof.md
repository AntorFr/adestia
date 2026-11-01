# Plugin repairs — AD-24 proof

Without Docker, host Chromium (Playwright from `npm root -g`), scripted engine.
Four skins (alfred, nestor, dobby, skippy) × `en`/`fr` × light/dark × desk (1440×900)
and phone (390×844): 8 instances, 32 variants, all passing.

```sh
npm run build
node bench/scenarios/chat-matrix.mjs bench/scenarios/plugins-correctifs.mjs --out bench/shots-plugins-correctifs
```

Captures land in `bench/shots-plugins-correctifs/<skin>/<locale>/` (ignored by git);
`words/` and `marks/` hold the earlier proofs, run unchanged by the same scenario.
`correctifs-report.json` records measurements per variant.

## What was looked at

- **E-25 reset sheet** (alfred/fr, light desk): the atelier's own sheet, *Annuler* focused,
  « Abandonner votre mise en plan… »; the board stays behind the scrim.
- **E-26 refusal sheet** (dobby/en, dark phone): « Gesture refused » in the shared sheet,
  anchored at the bottom, the card list readable above it.
- **Walking map E-28** (skippy/en, dark phone): the map fills the screen above the GPS band;
  the route, waypoints and tiles are whole, the « Position denied » line and *Follow* /
  *Leave walking mode* sit below it. Desk: the map grows from 892×418 to the full pane.
- **E-31** (nestor/fr, light desk): the owner's Amber bar (« Owner assessment ») and the
  inferred delay (dashed outline) are told apart; milestone markers take the accent.
- **`:::content` date** (skippy/fr, light desk): `4 mars 2026`; the author value `bientôt` stays as written.
- **E-30**: the reader opens from the phone's fold (button gone) and, once closed, the
  composer textarea has the focus — asserted in every phone variant. Desk: the opener has it.
- **« 1 pièce », marks, voyages counters**: in `words/` and `marks/`.
- **E-23 nominal path**: planif's ask → real `POST /api/turn` → scripted reply kept after
  reload. **Stub, not a real Claude turn**: no `CLAUDE_CODE_OAUTH_TOKEN` in this pod.

## Found while proving

- Closing the voyages refusal opened from a card's tray button lost the focus (`sayGesture`
  looked for `data-vi` on the button itself). Repaired in `7da4cc1`; the scenario asserts it.

## Seen, not repaired

- On the E-31 timeline in `fr` at desk width, the « auj. » (today) label sits tight against the
  « nov. » month tick. Cosmetic, not part of AD-24, left.
