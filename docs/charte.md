# Adestia — visual charter

> Product documentation. The tokens live in the file the code reads,
> `packages/web/src/app/tokens.css`; this file holds what the tokens cannot say: the
> direction, the usages, the components and the measured thresholds. It is not `DESIGN.md`,
> which is the design of the whole product.
>
> Written by the framing of `adestia-qualite` (2026-10-15). Sections marked **TARGET** are
> built by the tranche `adestia-qualite-charte`, which completes this file; until then they
> say what the tranche must decide, not what exists.

## 1. Direction

- **Subject.** A person's own agent and the pages they share: a desk used every day, at a
  computer in the evening and on a phone on the move. Reading and writing dominate; the
  chat sits beside the page, never over it.
- **References, and what we take.** Linear: density, keyboard first, an icon beside every
  action, quiet chrome. Notion: the page as a document, blocks you can grab and set.
  Raycast: compact icon buttons and a sheet that appears where the hand is.
- **Line of character.** The shell is a quiet cool paper; **the skin is the persona**. Each
  body wears its livery — Skippy's amber HUD with hard corners and emitted light, Alfred's
  butler paper, Nestor's rounded house, Dobby's green wax seal — and the shell never
  competes with it. The base palette is the default body's livery, inherited from the
  predecessor on purpose (decision of 2026-08-24, recorded in the header of `tokens.css`):
  this charter **extends and corrects it, it does not redraw it**.

## 2. Tokens

- **Source**: `packages/web/src/app/tokens.css`, custom properties on `:root`, light first,
  colours written once as `light-dark()`; `color-scheme` follows the system unless
  `[data-theme]` forces light or dark.
- **Two levels**: primitives (the named hues `--adestia-hue-*`, which pages name) and
  semantic tokens by role (`--surface*`, `--border*`, `--text*`, `--accent*`, `--danger`,
  `--warning`, `--success`, radii, spacing, shadows, fonts, sizes). Components use the
  semantic tokens only.
- **Skins** redefine tokens on `:root[data-skin=<id>]`, light and dark, and nothing
  structural (the rule in the header of `tokens.css`). A skin's hero and crest markup is its
  own; its colours still come from tokens.
- **Plugins** read the shell's tokens. A plugin stylesheet defines no second vocabulary of
  aliases (`--ink`, `--line`, `--f-body`…): **TARGET**, `parcours.css` and `atelier.css`
  move to the shell's names.
- **Fonts**: `--font` (system stack), `--font-title` (serif), `--font-mono`, `--font-code`;
  a skin may serve its own (Dobby does). Kept as inherited.
- **Type scale**: seven named steps in `tokens.css`: 11 / 12 / 13 / 15 / 18 / 22 / 28 px
  (`--text-2xs` through `--text-2xl`). The settings sheets use them; the other shell and
  plugin sheets adopt them in their tranches. `--input-text-min` keeps the 16 px iOS zoom
  prevention floor on controls without adding a type-scale step.
- **Spacing**: the six steps of `tokens.css` (4 to 32 px) on a 4 px grid.
- **Radii**: 6 / 10 / 14 px and a 999 px pill (`--radius-sm`, `--radius`, `--radius-lg`,
  `--radius-pill`); legacy micro, control and bubble roles alias this set, while round
  remains 50%. `--radius-md` is intentionally absent; its chat uses move to `--radius-sm`
  in that tranche. `--text-xs` and `--on-accent` are defined.
- **Depth**: as inherited — three shadow depths on white cards over a tinted canvas in
  light; borders and planes in dark. One strategy per theme, kept.
- **Icons — TARGET**: one set, **Lucide**, bundled by the product (no CDN: the instance may
  be offline or behind a strict CSP), next to every navigation item and every action;
  emoji and Unicode glyphs (▤ ＋ ▥ ⚙ ✎ ↺ ✕ ×) leave the controls. A plugin's tile icon
  declared in its manifest stays its own choice.
- **Motion**: 150–250 ms for a change of state, none under `prefers-reduced-motion`.

## 3. Usages

The shell follows the usages of the best products; a departure is written here with its
reason.

- **Account and theme** in the cog menu (E-15): credential, theme switch System / Light /
  Dark, sign out, version. **TARGET**: the theme switch is a three-icon toggle (monitor,
  sun, moon), not three text buttons.
- **Navigation**: the breadcrumb is the location; every back control names its destination
  (**TARGET**: the shell's `‹ Back` above a plugin says it goes home; a plugin's own back that
  goes one level up keeps its place and its name). No back is removed (`B-9`).
- **Feedback**: save status inline where the edit happens (editor, settings forms), as
  today. **Departure kept**: no toast system — every action of the product happens in a
  form or a page that shows its own state; a toast would duplicate it.
- **Dialogs**: one sheet (centred on desktop, bottom sheet from the phone breakpoint
  `--breakpoint-mobile`, 820 px, down) with one scrim,
  Escape closes, focus is trapped and returns to the opener.
- **Editing**: in place (page title, blocks), Milkdown's own menus restyled with tokens.

## 4. Components — TARGET

Each component gets its visual spec (tokens per variant and state: rest, hover, focus,
active, disabled, busy) and its behavioural spec (keyboard, action, what a screen reader
hears, reduced motion). The tranche `adestia-qualite-charte` writes them here and builds
them in the shell; the other tranches use them.

- **Button**: variants neutral, accent, danger, ghost, icon-only (with `aria-label`); one
  height per size; a destructive button's label names the verb and the object where today's label does (no label is renamed by the charter: B-1).
- **Sheet / dialog**: as in Usages; replaces `adestia-sheet`, and is the one the plugins use.
- **Popover**: anchored panel (cog menu E-15 in this tranche; block settings E-6 and page properties E-5 adopt it in the pages tranche).
- **Theme switch**: three icon buttons in a radiogroup (§ 7.4).
- **Spinner**: the `loader-circle` icon, rotating, static under reduced motion; the loading mark of a row or a card.
- **Empty state**: icon, one sentence, the action that fills it when there is one.
- **Field**: input, select, textarea, toggle; label, help, error.
- **Focus ring**: one global `:focus-visible` rule; no `outline: none` without a
  replacement.

## 5. Thresholds

WCAG 2.2 AA: text 4.5:1 (3:1 at 24 px or 18.66 px bold), non-text 3:1, colour never alone,
focus visible and not hidden, targets 24 × 24 px. Measured with
`charte-graphique/scripts/contraste.py` (or the browser's inspector), in both themes.

The base palette table is printed by `packages/web/test/contrast.test.ts`. Regenerate it
with `UPDATE_CONTRAST_TABLE=1 npx vitest run packages/web/test/contrast.test.ts`.
The four skins are measured by the skin contrast tranche.

<!-- base-contrast:start -->
| Foreground | Background | Theme | Ratio | Threshold | Result |
|---|---|---|---|---|---|
| `--text` #151a22 | `--surface` #eef1f6 | light | 15.42 | 4.5 | ok |
| `--text` #e9ecf3 | `--surface` #0b0d12 | dark | 16.43 | 4.5 | ok |
| `--text` #151a22 | `--surface-raised` #ffffff | light | 17.46 | 4.5 | ok |
| `--text` #e9ecf3 | `--surface-raised` #141821 | dark | 15.02 | 4.5 | ok |
| `--text` #151a22 | `--surface-soft` #f4f6fa | light | 16.14 | 4.5 | ok |
| `--text` #e9ecf3 | `--surface-soft` #1a1f29 | dark | 13.96 | 4.5 | ok |
| `--text` #151a22 | `--surface-sunken` #e5e9f0 | light | 14.34 | 4.5 | ok |
| `--text` #e9ecf3 | `--surface-sunken` #07090d | dark | 16.85 | 4.5 | ok |
| `--text-muted` #586274 | `--surface` #eef1f6 | light | 5.43 | 4.5 | ok |
| `--text-muted` #98a2b3 | `--surface` #0b0d12 | dark | 7.55 | 4.5 | ok |
| `--text-muted` #586274 | `--surface-raised` #ffffff | light | 6.15 | 4.5 | ok |
| `--text-muted` #98a2b3 | `--surface-raised` #141821 | dark | 6.90 | 4.5 | ok |
| `--text-muted` #586274 | `--surface-soft` #f4f6fa | light | 5.68 | 4.5 | ok |
| `--text-muted` #98a2b3 | `--surface-soft` #1a1f29 | dark | 6.41 | 4.5 | ok |
| `--text-muted` #586274 | `--surface-sunken` #e5e9f0 | light | 5.05 | 4.5 | ok |
| `--text-muted` #98a2b3 | `--surface-sunken` #07090d | dark | 7.74 | 4.5 | ok |
| `--text-faint` #5d697d | `--surface` #eef1f6 | light | 4.90 | 4.5 | ok |
| `--text-faint` #7d8797 | `--surface` #0b0d12 | dark | 5.35 | 4.5 | ok |
| `--text-faint` #5d697d | `--surface-raised` #ffffff | light | 5.55 | 4.5 | ok |
| `--text-faint` #7d8797 | `--surface-raised` #141821 | dark | 4.89 | 4.5 | ok |
| `--text-faint` #5d697d | `--surface-soft` #f4f6fa | light | 5.13 | 4.5 | ok |
| `--text-faint` #7d8797 | `--surface-soft` #1a1f29 | dark | 4.55 | 4.5 | ok |
| `--text-faint` #5d697d | `--surface-sunken` #e5e9f0 | light | 4.56 | 4.5 | ok |
| `--text-faint` #7d8797 | `--surface-sunken` #07090d | dark | 5.49 | 4.5 | ok |
| `--accent-text` #0b7386 | `--surface` #eef1f6 | light | 4.87 | 4.5 | ok |
| `--accent-text` #4ecad8 | `--surface` #0b0d12 | dark | 9.96 | 4.5 | ok |
| `--accent-text` #0b7386 | `--surface-raised` #ffffff | light | 5.51 | 4.5 | ok |
| `--accent-text` #4ecad8 | `--surface-raised` #141821 | dark | 9.10 | 4.5 | ok |
| `--accent-text` #0b7386 | `--surface-soft` #f4f6fa | light | 5.09 | 4.5 | ok |
| `--accent-text` #4ecad8 | `--surface-soft` #1a1f29 | dark | 8.46 | 4.5 | ok |
| `--accent-text` #0b7386 | `--surface-sunken` #e5e9f0 | light | 4.53 | 4.5 | ok |
| `--accent-text` #4ecad8 | `--surface-sunken` #07090d | dark | 10.21 | 4.5 | ok |
| `--danger-text` #be392c | `--surface` #eef1f6 | light | 4.87 | 4.5 | ok |
| `--danger-text` #ea6a5c | `--surface` #0b0d12 | dark | 6.21 | 4.5 | ok |
| `--danger-text` #be392c | `--surface-raised` #ffffff | light | 5.51 | 4.5 | ok |
| `--danger-text` #ea6a5c | `--surface-raised` #141821 | dark | 5.68 | 4.5 | ok |
| `--danger-text` #be392c | `--surface-soft` #f4f6fa | light | 5.09 | 4.5 | ok |
| `--danger-text` #ea6a5c | `--surface-soft` #1a1f29 | dark | 5.28 | 4.5 | ok |
| `--danger-text` #be392c | `--surface-sunken` #e5e9f0 | light | 4.53 | 4.5 | ok |
| `--danger-text` #ea6a5c | `--surface-sunken` #07090d | dark | 6.37 | 4.5 | ok |
| `--warning-text` #8f5e15 | `--surface` #eef1f6 | light | 4.91 | 4.5 | ok |
| `--warning-text` #e0a64f | `--surface` #0b0d12 | dark | 9.01 | 4.5 | ok |
| `--warning-text` #8f5e15 | `--surface-raised` #ffffff | light | 5.56 | 4.5 | ok |
| `--warning-text` #e0a64f | `--surface-raised` #141821 | dark | 8.24 | 4.5 | ok |
| `--warning-text` #8f5e15 | `--surface-soft` #f4f6fa | light | 5.13 | 4.5 | ok |
| `--warning-text` #e0a64f | `--surface-soft` #1a1f29 | dark | 7.66 | 4.5 | ok |
| `--warning-text` #8f5e15 | `--surface-sunken` #e5e9f0 | light | 4.56 | 4.5 | ok |
| `--warning-text` #e0a64f | `--surface-sunken` #07090d | dark | 9.24 | 4.5 | ok |
| `--success-text` #23774b | `--surface` #eef1f6 | light | 4.87 | 4.5 | ok |
| `--success-text` #5cbe83 | `--surface` #0b0d12 | dark | 8.47 | 4.5 | ok |
| `--success-text` #23774b | `--surface-raised` #ffffff | light | 5.51 | 4.5 | ok |
| `--success-text` #5cbe83 | `--surface-raised` #141821 | dark | 7.74 | 4.5 | ok |
| `--success-text` #23774b | `--surface-soft` #f4f6fa | light | 5.09 | 4.5 | ok |
| `--success-text` #5cbe83 | `--surface-soft` #1a1f29 | dark | 7.19 | 4.5 | ok |
| `--success-text` #23774b | `--surface-sunken` #e5e9f0 | light | 4.52 | 4.5 | ok |
| `--success-text` #5cbe83 | `--surface-sunken` #07090d | dark | 8.68 | 4.5 | ok |
| `--accent` #0e8fa6 | `--surface` #eef1f6 | light | 3.37 | 3 | ok |
| `--accent` #4ecad8 | `--surface` #0b0d12 | dark | 9.96 | 3 | ok |
| `--accent` #0e8fa6 | `--surface-raised` #ffffff | light | 3.82 | 3 | ok |
| `--accent` #4ecad8 | `--surface-raised` #141821 | dark | 9.10 | 3 | ok |
| `--accent` #0e8fa6 | `--surface-soft` #f4f6fa | light | 3.53 | 3 | ok |
| `--accent` #4ecad8 | `--surface-soft` #1a1f29 | dark | 8.46 | 3 | ok |
| `--accent` #0e8fa6 | `--surface-sunken` #e5e9f0 | light | 3.14 | 3 | ok |
| `--accent` #4ecad8 | `--surface-sunken` #07090d | dark | 10.21 | 3 | ok |
| `--on-accent` #010c0f | `--accent` #0e8fa6 | light | 5.18 | 4.5 | ok |
| `--on-accent` #010c0f | `--accent` #4ecad8 | dark | 10.15 | 4.5 | ok |
| `--on-accent` #010c0f | `--danger` #d24b3e | light | 4.54 | 4.5 | ok |
| `--on-accent` #010c0f | `--danger` #ea6a5c | dark | 6.33 | 4.5 | ok |
| `--on-accent` #010c0f | `--warning` #b4771b | light | 5.27 | 4.5 | ok |
| `--on-accent` #010c0f | `--warning` #e0a64f | dark | 9.18 | 4.5 | ok |
| `--on-accent` #010c0f | `--success` #2e9e63 | light | 5.83 | 4.5 | ok |
| `--on-accent` #010c0f | `--success` #5cbe83 | dark | 8.62 | 4.5 | ok |
<!-- base-contrast:end -->

Corrections keep each hue and move lightness only. Bright fills keep their colour;
`--accent-text`, `--danger-text`, `--warning-text` and `--success-text` are their text twins
on surfaces. `--on-accent` is dark ink on bright fills, in both themes: white fails on the
inherited accents. Its lightness also lets the unchanged danger, warning and success
fills carry a label at AA. `--text-faint` is corrected in both themes; placeholders have
the same 4.5:1 floor as other text.

## 6. Accepted departures

None yet. A pair left under its threshold is written here with its reason and who accepted
it.

## 7. Build specification — tranche `adestia-qualite-charte`

What the tranche builds, in enough detail that nothing is left to choose. Decisions are
numbered `AD-9` to `AD-11` in `ARCHITECTURE.md`; this section is the visual and behavioural
side. When the tranche is done, the **TARGET** marks above are removed and this section is
folded into them.

### 7.1 Tokens

- **Dark palette once** (AD-10): every colour token of the base palette is written once, as
  `light-dark(<light>, <dark>)`, driven by `color-scheme`. `:root` sets `color-scheme: light
  dark`; `:root[data-theme='light']` and `[data-theme='dark']` force one. The two pasted dark
  blocks go; no hue or value changes except the contrast corrections of § 7.2. Skins keep
  redefining tokens in their own `:root[data-skin=<id>]` blocks, with plain values or
  `light-dark()`.
  The dark selectors may still redeclare only the inherited geometry of `--shadow` and
  `--shadow-lg`, with their inks defined once in `light-dark()` and no literal colours.
- **Type scale**: `--text-2xs` 11px, `--text-xs` 12px, `--text-sm` 13px, `--text-base` 15px,
  `--text-lg` 18px, `--text-xl` 22px, `--text-2xl` 28px. A literal size in the 17 distinct
  values of today maps to the nearest step; the visible change is at most 1 px.
- **Radii**: `--radius-sm` 6px, `--radius` 10px (as inherited), `--radius-lg` 14px,
  `--radius-pill` 999px. `--radius-md` is not defined (its three uses take `--radius-sm`).
- **Previously undefined tokens** are defined or replaced: `--text-xs` (above), `--on-accent`
  (dark ink on a filled accent in both themes, also suitable for danger, warning and
  success fills), `--lc` (not used by any markup: the rule goes with the plugin tranche).
- **Focus ring**: one rule, `:focus-visible { outline: 2px solid var(--accent-text);
  outline-offset: 2px }`, on `:root`-level selectors; `outline: none` stays only where the same
  rule paints a visible replacement (a 2 px `box-shadow` ring). Mouse clicks show nothing.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` sets `--motion: 0ms`; every
  transition of the tranche's components uses `var(--motion-quick)` (150 ms) or
  `var(--motion-slow)` (250 ms), both 0 under reduced motion.

### 7.2 Contrast, measured by a test

A test in `packages/web/test` (`contrast.test.ts`) reads `tokens.css` (the skin contrast
tranche extends it to the four `skins/*/skin.css`), resolves each theme (evaluating
`light-dark()` and `var()`), and
computes the WCAG ratio of every **declared pair**: `--text`, `--text-muted`, `--text-faint`,
`--accent-text`, `--danger-text`, `--warning-text`, `--success-text` (as text),
`--accent` (as a non-text 3:1 edge) over `--surface`, `--surface-raised`, `--surface-soft`, `--surface-sunken`, and
`--on-accent` over `--accent`, `--danger`, `--warning`, `--success`, plus each skin's own
text tokens over its surfaces. It fails
for a pair under its threshold that is not listed in § 6, and it prints the table that § 5
holds (the file is regenerated from the test's output, not typed). The list of pairs is data
in the test, so a pair added to the palette is a line to add.

Corrections keep the hue (HSL h) and move lightness only (AD-4). Method per token: if the
token is a **fill** somewhere (accent, danger, success, warning as a dot, a bar or a button),
keep it and add a `*-text` twin for text uses (`--danger-text`, `--success-text`,
`--warning-text`; `--accent-text` exists); if it is only ever text (`--text-faint`), move
it. Call sites that use `--accent`, `--danger`, `--success`, `--warning` as a text colour
switch to the twin. `--text-faint` is for decoration and placeholders **at 4.5:1**, there is
no tier below.

A skin pair that reaches AA only by redrawing the persona is written in § 6 with the reason
and "accepted by the mandate holder, to be shown to Monsieur" — never silently left.

### 7.3 Icons — Lucide

Lucide (ISC licence) vendored as an inline sprite (AD-9): `packages/web/src/app/icons.ts`
holds the path data of the subset used, `main.tsx` mounts it once as a hidden `<svg>` at
boot. Name `adestia-i-<lucide-name>`; used as `<svg class="adestia-icon" aria-hidden="true"><use
href="#adestia-i-plus"/></svg>`; size `1em`, stroke `currentColor`, stroke width 2 (1.75
on the compact size). The React wrapper `<Icon name="plus" />`. The subset is the closed list
the tranche's screens need, and the types make a name outside it a compile error: plus,
x, chevron-left, chevron-right, settings, pencil, rotate-ccw, save, trash-2, search, folder,
file-text, sparkles, plug, book-open, sliders-horizontal, handshake, monitor, sun, moon,
log-out, key-round, lock, users, check, circle-alert, triangle-alert, info, wifi-off, refresh-cw, copy,
external-link, loader-circle (spinner, static under reduced motion). The pre-epic glyphs
(`▤ ＋ ▥ ⚙ ✎ ↺ ✕ ×`, tile emoji `🔌 📓 🎛 🤝`) leave the screens of this tranche. The manifest
`ic:` glyphs (`glyphs.ts`) and a plugin's declared tile icon are untouched.

### 7.4 Components

Classes first (AD-4), React wrappers second. Variants by modifier, sizes `--sm`, default.

| Component | Class | Wrapper | Spec |
|---|---|---|---|
| Button | `.adestia-btn`, `--accent`, `--danger`, `--ghost`, `--icon` | `<Button variant icon busy>` | Height 32 px (`--sm` 28), radius `--radius-sm`, padding 0 12 px, label `--text-sm` medium; neutral = `--surface-raised` + `--border-strong`; accent = `--accent` fill + `--on-accent`; danger = `--danger` fill, `--on-accent` label, one rendering everywhere; ghost = transparent, hover `--surface-soft`; icon = square 32 px, `aria-label` required (typed). States: hover darkens 6 %, active 10 %, disabled 45 % opacity and `cursor: not-allowed`, busy = spinner replaces the icon, label kept, `aria-busy`. |
| Sheet | `.adestia-sheet` (scrim), `.adestia-sheet__panel`, `__head`, `__body`, `__foot` | `<Sheet open title onClose>` | One scrim `--scrim`, one z-index (`--z-sheet` 100); the panel is centred, 520 px wide, from a `max-width: var(--breakpoint-mobile)` query a bottom sheet (full width, top radii, safe-area padding). `role="dialog"`, `aria-modal`, `aria-labelledby` the title; Escape and a click on the scrim close; focus goes to the first focusable on open, is trapped (Tab wraps), and returns to the opener on close. The shared sheet **takes over** the `.adestia-sheet*` rules now in `chat.css` (moved, not copied; the class names are kept so E-18's markup in `Signatures.tsx` renders unchanged — the chat tranche then adopts `<Sheet>`). A plugin without React uses the classes and the three-line contract in `skills/plugin-author` (a `data-adestia-sheet` helper is *not* shipped: AD-8). |
| Popover | `.adestia-popover` | `<Popover anchor open>` | Panel of `--surface-raised`, `--shadow`, `--radius`, 8 px from its anchor, flips above when there is no room below; Escape closes and returns focus; click outside closes. The cog menu (E-15) uses it. E-5 and E-6 keep their `.adestia-blockset` until the pages tranche. |
| Empty state | `.adestia-empty` (existing), `__icon`, `__text`, `__action` | `<EmptyState icon text action>` | Icon 28 px in `--text-muted`, one sentence in `--text-muted`, optional ghost or neutral button. Replaces `.adestia-instructions__empty` and `.adestia-deleg__empty` in this tranche's screens. |
| Field | `.adestia-field`, `__label`, `__help`, `__error`, `.adestia-input`, `-select`, `-textarea`, `.adestia-toggle` | `<Field label help error>` around a control | Control height 32 px (textarea auto), `--surface-raised`, `--border-strong`, radius `--radius-sm`; focus ring as § 7.1; error = border `--danger`, message `--danger-text` with an alert icon (colour never alone); a toggle is a real `<input type=checkbox role=switch>`. Browser-native selects stay native elements but drawn (`appearance` reset + chevron icon). |
| Theme switch | `.adestia-segmented` | in the cog menu | Three icon buttons in a `radiogroup`: monitor (System), sun (Light), moon (Dark); each has `aria-label` and `title`; the chosen one is `aria-checked`. |

### 7.5 Voice and language

The shell and plugins say *vous* in French; the table of `i18n.ts` loses its two *tu* lines
(the signature lines, E-18's words). Each skin's words (placeholder, busy label, three
greetings, and what its hero says) exist in `en` and `fr`, **in its persona's voice**:
Skippy teases ("Back already, little monkey." / "Encore toi, petit singe."), Alfred is a
butler ("Good morning, Sir." / "What may I do for you?"), Nestor is a warm caretaker,
Dobby is a devoted servant ("Dobby is at your service."). The skin module receives
`{ locale: 'en' | 'fr' }` (AD-5) and picks; a skin that ignores it still works (its
French stays).

## 8. Reading order for a builder

`ARCHITECTURE.md` AD-4, AD-5, AD-9 to AD-11 → § 7 here → `docs/ecrans.md` "Target of the
charter tranche" for the screens → `skills/plugin-author` for the contract text to update.
