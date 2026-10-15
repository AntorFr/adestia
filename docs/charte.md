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
  dark under `prefers-color-scheme` and under `[data-theme='dark']`. **TARGET**: the dark
  palette is written once (today it is pasted twice) — the two selectors share one block.
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
- **Type scale — TARGET**: today three steps (`--text-sm` 13px, `--text-base` 15px,
  `--text-lg` 18px) and about sixty literal sizes over 17 distinct values (`Q-16`). The tranche writes the
  scale every stylesheet uses (proposal: 11 / 12 / 13 / 15 / 18 / 22 / 28, named), and no
  literal size remains outside `tokens.css` and skins.
- **Spacing**: the six steps of `tokens.css` (4 to 32 px) on a 4 px grid.
- **Radii — TARGET**: one set, used; the pill is `--radius-pill` everywhere (today `999px`
  and `20px` coexist); no token used and never defined (`--text-xs`, `--radius-md`,
  `--on-accent` today).
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
  height per size; a destructive button names the verb and the object.
- **Sheet / dialog**: as in Usages; replaces `adestia-sheet`, and is the one the plugins use.
- **Popover**: anchored panel (block settings E-6, page properties E-5, cog menu E-15).
- **Empty state**: icon, one sentence, the action that fills it when there is one.
- **Field**: input, select, textarea, toggle; label, help, error.
- **Focus ring**: one global `:focus-visible` rule; no `outline: none` without a
  replacement.

## 5. Thresholds

WCAG 2.2 AA: text 4.5:1 (3:1 at 24 px or 18.66 px bold), non-text 3:1, colour never alone,
focus visible and not hidden, targets 24 × 24 px. Measured with
`charte-graphique/scripts/contraste.py` (or the browser's inspector), in both themes.

Measured at framing on the base palette (light unless stated):

| Foreground | Background | Theme | Ratio | Threshold | Result |
|---|---|---|---|---|---|
| `--text-muted` #586274 | `--surface` #eef1f6 | light | 5.43 | 4.5 | ok |
| `--text-faint` #98a2b2 | `--surface` #eef1f6 | light | 2.28 | 4.5 | fail |
| `--text-faint` #98a2b2 | `--surface-raised` #ffffff | light | 2.58 | 4.5 | fail |
| `--text-faint` #59616f | `--surface-raised` dark | dark | ≈2.6–2.85 | 4.5 | fail |
| `--accent` #0e8fa6 as text | #ffffff | light | 3.82 | 4.5 | fail |
| `--warning` #b4771b | #ffffff | light | 3.75 | 4.5 | fail |
| `--success` #2e9e63 | #ffffff | light | 3.39 | 4.5 | fail |
| `--danger` #d24b3e | #ffffff | light | 4.36 | 4.5 | fail |

**TARGET**: every pair of the base palette and of each skin's palette, both themes, listed
here; the failing ones corrected. The correction keeps each hue and moves its lightness only
as far as the threshold needs: either the token itself, or a distinct `*-text` token where a
colour must stay bright as a fill but needs a darker twin as text (as `--accent-text`
already does for text on the accent).

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
- **Type scale**: `--text-2xs` 11px, `--text-xs` 12px, `--text-sm` 13px, `--text-base` 15px,
  `--text-lg` 18px, `--text-xl` 22px, `--text-2xl` 28px. A literal size in the 17 distinct
  values of today maps to the nearest step; the visible change is at most 1 px.
- **Radii**: `--radius-sm` 6px, `--radius` 10px (as inherited), `--radius-lg` 14px,
  `--radius-pill` 999px. `--radius-md` is not defined (its three uses take `--radius-sm`).
- **Previously undefined tokens** are defined or replaced: `--text-xs` (above), `--on-accent`
  (text on a filled accent, white in both themes), `--lc` (not used by any markup: the rule
  goes with the plugin tranche).
- **Focus ring**: one rule, `:focus-visible { outline: 2px solid var(--accent-text);
  outline-offset: 2px }`, on `:root`-level selectors; `outline: none` stays only where the same
  rule paints a visible replacement (a 2 px `box-shadow` ring). Mouse clicks show nothing.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` sets `--motion: 0ms`; every
  transition of the tranche's components uses `var(--motion-quick)` (150 ms) or
  `var(--motion-slow)` (250 ms), both 0 under reduced motion.

### 7.2 Contrast, measured by a test

A test in `packages/web/test` (`contrast.test.ts`) reads `tokens.css` and the four
`skins/*/skin.css`, resolves each theme (evaluating `light-dark()` and `var()`), and
computes the WCAG ratio of every **declared pair**: `--text`, `--text-muted`, `--text-faint`,
`--accent-text`, `--danger`, `--warning`, `--success`, `--accent` (as text and as a non-text
3:1 edge) over `--surface`, `--surface-raised`, `--surface-soft`, `--surface-sunken`, and
`--accent-text` over `--accent`, plus each skin's own text tokens over its surfaces. It fails
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
| Button | `.adestia-btn`, `--accent`, `--danger`, `--ghost`, `--icon` | `<Button variant icon busy>` | Height 32 px (`--sm` 28), radius `--radius-sm`, padding 0 12 px, label `--text-sm` medium; neutral = `--surface-raised` + `--border-strong`; accent = `--accent` fill + `--on-accent`; danger = `--danger` fill, white label (or outline at rest, fill on hover when the design says so); ghost = transparent, hover `--surface-soft`; icon = square 32 px, `aria-label` required (typed). States: hover darkens 6 %, active 10 %, disabled 45 % opacity and `cursor: not-allowed`, busy = spinner replaces the icon, label kept, `aria-busy`. A destructive button's label names the verb **and** the object ("Remove server"). |
| Sheet | `.adestia-sheet` (scrim), `.adestia-sheet__panel`, `__head`, `__body`, `__foot` | `<Sheet open title onClose>` | One scrim `--scrim`, one z-index (`--z-sheet` 100); the panel is centred, 520 px wide, from a `max-width: var(--breakpoint-mobile)` query a bottom sheet (full width, top radii, safe-area padding). `role="dialog"`, `aria-modal`, `aria-labelledby` the title; Escape and a click on the scrim close; focus goes to the first focusable on open, is trapped (Tab wraps), and returns to the opener on close. A plugin without React uses the classes and the three-line contract in `skills/plugin-author` (a `data-adestia-sheet` helper is *not* shipped: AD-8). |
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
