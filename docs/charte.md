# Adestia — visual charter

> Product documentation. The tokens live in the file the code reads,
> `packages/web/src/app/tokens.css`; this file holds what the tokens cannot say: the
> direction, the usages, the components and the measured thresholds. It is not `DESIGN.md`,
> which is the design of the whole product.
>
> Written by the framing of `adestia-qualite` (2026-10-15), folded to what is built by the
> tranche `adestia-qualite-charte`: the tokens, the icons, the components, the contrast
> tables and the voice are in the code and this file says what they are. What is still to
> build is marked **TARGET**, followed by the tranche that builds it (`adestia-qualite-pages`
> or `adestia-qualite-plugins`); no mark belongs to the charter any more.

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
  aliases (`--ink`, `--line`, `--f-body`…): **TARGET** (`adestia-qualite-plugins`),
  `parcours.css` and `atelier.css` move to the shell's names.
- **Fonts**: `--font` (system stack), `--font-title` (serif), `--font-mono`, `--font-code`;
  a skin may serve its own (Dobby does). Kept as inherited.
- **Type scale**: seven named steps in `tokens.css`: 11 / 12 / 13 / 15 / 18 / 22 / 28 px
  (`--text-2xs` through `--text-2xl`). The settings sheets use them; the other shell and
  plugin sheets adopt them in their tranches. `--input-text-min` keeps the 16 px iOS zoom
  prevention floor on controls without adding a type-scale step.
- **Spacing**: the six steps of `tokens.css` (4 to 32 px) on a 4 px grid.
- **Radii**: 6 / 10 / 14 px and a 999 px pill (`--radius-sm`, `--radius`, `--radius-lg`,
  `--radius-pill`); legacy micro, control and bubble roles alias this set, while round
  remains 50%. `--radius-md` is intentionally absent; the chat's remaining `var(--radius-md, 8px)` (conversations.css) falls back to 8 px until the chat tranche (`adestia-qualite-chat`) moves it to `--radius-sm`
  `--text-xs` and `--on-accent` are defined.
- **Colour once**: every colour token of the base palette is written once, as
  `light-dark(<light>, <dark>)`, driven by `color-scheme`. `:root` sets `color-scheme: light
  dark`; `:root[data-theme='light']` and `[data-theme='dark']` force one. No pasted dark
  block is left; the dark selector redeclares only the geometry of `--shadow` and
  `--shadow-lg`, whose inks are defined once. Skins keep redefining tokens in their own
  `:root[data-skin=<id>]` blocks, with plain values or `light-dark()`.
- **On fills**: `--on-accent` is the dark ink on a filled accent in both themes, and also
  carries danger, warning and success fills. `--accent-text`, `--danger-text`,
  `--warning-text`, `--success-text` are the text twins of the fills (§ 5).
- **Hot tile chips**: text uses `--tile-color-text`, supplied by the tile hue’s
  `--adestia-hue-<hue>-text` twin where needed, falling back to the hue and then
  `--accent-text`. Their border and translucent background keep the tile hue. The
  composed contrast checks in § 5 cover indigo and ardoise; Skippy light indigo needs
  its text twin to reach AA on the tinted chip background.
- **Depth**: as inherited — three shadow depths on white cards over a tinted canvas in
  light; borders and planes in dark. One strategy per theme, kept.
- **Icons**: one set, **Lucide** (ISC licence), vendored as an inline sprite (no CDN: the
  instance may be offline or behind a strict CSP). `packages/web/src/app/icons.ts` holds the
  path data of the subset used and `main.tsx` mounts it once, hidden, at boot; an icon is
  `<Icon name="plus" />`, i.e. `<svg class="adestia-icon" aria-hidden="true"><use
  href="#adestia-i-plus"/></svg>`, `1em`, stroke `currentColor`, width 2. The names are a
  closed list and the types make any other a compile error: plus, x, chevron-left,
  chevron-right, settings, pencil, rotate-ccw, save, trash-2, search, folder, file-text,
  sparkles, plug, book-open, sliders-horizontal, handshake, monitor, sun, moon, log-out,
  key-round, lock, users, check, circle-alert, triangle-alert, info, wifi-off, refresh-cw,
  copy, external-link, loader-circle. The shell's settings and entry screens carry no emoji
  or Unicode glyph on a control any more; the chat, the editor and the home still draw
  `▤ ＋ ▥ ⚙ ✎ ↺ ✕ ×`: the chat tranche (`adestia-qualite-chat`) moves its controls to
  icons, and **TARGET** `adestia-qualite-pages` those of the home and the editor. The manifest `ic:` glyphs (`glyphs.ts`) and a plugin's declared
  tile icon stay its own choice.
- **Focus**: one global `:focus-visible` rule (§ 4); mouse clicks show nothing.
- **Motion**: 150–250 ms for a change of state: `--motion-quick` (150 ms) and
  `--motion-slow` (250 ms), both 0 under `prefers-reduced-motion` (which sets `--motion:
  0ms`); every transition of the shared components uses them.

## 3. Usages

The shell follows the usages of the best products; a departure is written here with its
reason.

- **Account and theme** in the cog menu (E-15): credential, theme switch System / Light /
  Dark, sign out, version. The theme switch is a three-icon radiogroup (monitor, sun, moon),
  each with its accessible name.
- **Navigation**: the breadcrumb is the location; every back control names its destination
  (**TARGET** `adestia-qualite-pages`: the shell's `‹ Back` above a plugin says it goes home;
  **TARGET** `adestia-qualite-plugins`: a plugin's own back that goes one level up keeps its
  place and its name). No back is removed (`B-9`).
- **Feedback**: save status inline where the edit happens (editor, settings forms), as
  today. **Departure kept**: no toast system — every action of the product happens in a
  form or a page that shows its own state; a toast would duplicate it.
- **Dialogs**: one sheet (centred on desktop, bottom sheet from the phone breakpoint
  `--breakpoint-mobile`, 820 px, down) with one scrim,
  Escape closes, focus is trapped and returns to the opener.
- **Editing**: in place (page title, blocks), Milkdown's own menus restyled with tokens.
- **Voice and language**: the shell and plugins say *vous* in French; the table of
  `i18n.ts` has no *tu* line left (the signature lines, E-18's words, say *vous*). Each
  skin's words (placeholder, busy label, three greetings, and what its hero says) exist in
  `en` and `fr`, **in its persona's voice**: Skippy teases ("Back already, little
  monkey." / "Encore toi, petit singe." — it keeps its *toi*), Alfred is a butler, Nestor a
  warm caretaker, Dobby a devoted servant. The skin module receives `{ locale: 'en' | 'fr'
  }` and picks (`skin.ts`); a skin that ignores it still loads and keeps its French.

## 4. Components

Classes first, React wrappers second (`packages/web/src/app/ui/`, `styles/components.css`).
Variants by modifier, sizes `--sm` and default. Each has its states (rest, hover, focus,
active, disabled, busy) and its behaviour (keyboard, what a screen reader hears, reduced
motion). The settings and entry screens (E-1, E-9 to E-15, E-19, E-21) use them; the chat
and pages tranches adopt them for their own screens, and a plugin without React uses the
classes and the contract in `skills/plugin-author`.

| Component | Class | Wrapper | Spec |
|---|---|---|---|
| Button | `.adestia-btn`, `--accent`, `--danger`, `--ghost`, `--icon` | `<Button variant icon busy>` | Height 32 px (`--sm` 28), radius `--radius-sm`, padding 0 12 px, label `--text-sm` medium; neutral = `--surface-raised` + `--border-strong`; accent = `--accent` fill + `--on-accent`; danger = `--danger` fill, `--on-accent` label, one rendering everywhere; ghost = transparent, hover `--surface-soft`; icon = square 32 px, `aria-label` required (typed). States: hover darkens 6 %, active 10 %, disabled 45 % opacity and `cursor: not-allowed`, busy = spinner replaces the icon, label kept, `aria-busy`. No label is renamed by the charter (B-1); a destructive button names the verb and the object where today's label does. |
| Sheet / dialog | `.adestia-sheet` (scrim), `.adestia-sheet__panel`, `__head`, `__body`, `__foot` | `<Sheet open title onClose>` | One scrim `--scrim`, one z-index (`--z-sheet` 100); the panel is centred, 520 px wide, from a `max-width: var(--breakpoint-mobile)` query a bottom sheet (full width, top radii, safe-area padding); the panel's height is `min(88vh, 720px)`. `role="dialog"`, `aria-modal`, `aria-labelledby` the title; Escape and a click on the scrim close; focus goes to the first focusable on open, is trapped (Tab wraps), and returns to the opener on close. The shared sheet took over the `.adestia-sheet*` rules that were in `chat.css` (class names kept, so E-18's markup in `Signatures.tsx` renders unchanged; the chat tranche then adopts `<Sheet>`). A plugin without React uses the classes and the three-line contract in `skills/plugin-author` (a `data-adestia-sheet` helper is *not* shipped: AD-8). |
| Popover | `.adestia-popover` | `<Popover anchor open>` | Panel of `--surface-raised`, `--shadow`, `--radius`, 8 px from its anchor, flips above when there is no room below; Escape closes and returns focus; click outside closes. The cog menu (E-15) uses it. Block settings (E-6) and page properties (E-5) keep their `.adestia-blockset` until `adestia-qualite-pages` adopts the popover. |
| Spinner | the `loader-circle` icon | `<Icon name="loader-circle">` | Rotating; static under reduced motion; the loading mark of a row, a card or a gate. |
| Empty state | `.adestia-empty`, `__icon`, `__text`, `__action` | `<EmptyState icon text action>` | Icon 28 px in `--text-muted`, one sentence in `--text-muted`, optional ghost or neutral button. It replaced `.adestia-instructions__empty` and `.adestia-deleg__empty` on the settings screens; `.adestia-instructions__empty` is kept for E-12's "Reading the repository…" line. |
| Field | `.adestia-field`, `__label`, `__help`, `__error`, `.adestia-input`, `-select`, `-textarea`, `.adestia-toggle` | `<Field label help error>` around a control | Control height 32 px (textarea auto), `--surface-raised`, `--border-strong`, radius `--radius-sm`; focus ring as in § 2; error = border `--danger`, message `--danger-text` with an alert icon (colour never alone), linked by `aria-describedby`; a toggle is a real `<input type=checkbox role=switch>`. Browser-native selects stay native elements but drawn (`appearance` reset + chevron icon). |
| Theme switch | `.adestia-segmented` | `<ThemeSwitch>` in the cog menu | Three icon buttons in a `radiogroup`: monitor (System), sun (Light), moon (Dark); each has `aria-label` and `title`; the chosen one is `aria-checked`. |
| Focus ring | one global `:focus-visible` rule in `tokens.css` | — | `outline: 2px solid var(--accent-text); outline-offset: 2px`. `outline: none` stays only where the same rule paints a visible replacement (a 2 px `box-shadow` ring). Mouse clicks show nothing. |

## 5. Thresholds

WCAG 2.2 AA: text 4.5:1 (3:1 at 24 px or 18.66 px bold), non-text 3:1, colour never alone,
focus visible and not hidden, targets 24 × 24 px. Measured with
`packages/web/test/contrast.test.ts` (it regenerates the threshold table's ratios; or the browser's inspector), in both themes.

The base palette table is printed by `packages/web/test/contrast.test.ts`. Regenerate it
with `UPDATE_CONTRAST_TABLE=1 npx vitest run packages/web/test/contrast.test.ts`.
The four skins are measured by the same test, in the themes each one declares: nestor
follows the system, dobby and skippy impose their night and keep a light variant on
explicit request, alfred wears the base sheet. Regenerate both tables with the command above.

In a skin, `--accent-text` is the accent read as text on its surfaces and `--on-accent` is
the ink on its fills, as in the base; the skins corrected lightness only, never hue, and
set `color-scheme: dark` where they impose their night so `light-dark()` follows the skin.
Nestor's light warning and success fills moved darker so white ink carries a label, and
skippy's light danger fill moved lighter so its dark ink does.

<!-- base-contrast:start -->
| Foreground | Background | Theme | Ratio | Threshold | Result |
|---|---|---|---|---|---|
| `--text` #151a22 | `--surface` #eef1f6 | light | 15.42 | 4.5 | ok |
| `--text` #151a22 | `--surface-raised` #ffffff | light | 17.46 | 4.5 | ok |
| `--text` #151a22 | `--surface-soft` #f4f6fa | light | 16.14 | 4.5 | ok |
| `--text` #151a22 | `--surface-sunken` #e5e9f0 | light | 14.34 | 4.5 | ok |
| `--text-muted` #586274 | `--surface` #eef1f6 | light | 5.43 | 4.5 | ok |
| `--text-muted` #586274 | `--surface-raised` #ffffff | light | 6.15 | 4.5 | ok |
| `--text-muted` #586274 | `--surface-soft` #f4f6fa | light | 5.68 | 4.5 | ok |
| `--text-muted` #586274 | `--surface-sunken` #e5e9f0 | light | 5.05 | 4.5 | ok |
| `--text-faint` #5d697d | `--surface` #eef1f6 | light | 4.90 | 4.5 | ok |
| `--text-faint` #5d697d | `--surface-raised` #ffffff | light | 5.55 | 4.5 | ok |
| `--text-faint` #5d697d | `--surface-soft` #f4f6fa | light | 5.13 | 4.5 | ok |
| `--text-faint` #5d697d | `--surface-sunken` #e5e9f0 | light | 4.56 | 4.5 | ok |
| `--accent-text` #0b7386 | `--surface` #eef1f6 | light | 4.87 | 4.5 | ok |
| `--accent-text` #0b7386 | `--surface-raised` #ffffff | light | 5.51 | 4.5 | ok |
| `--accent-text` #0b7386 | `--surface-soft` #f4f6fa | light | 5.09 | 4.5 | ok |
| `--accent-text` #0b7386 | `--surface-sunken` #e5e9f0 | light | 4.53 | 4.5 | ok |
| `--danger-text` #be392c | `--surface` #eef1f6 | light | 4.87 | 4.5 | ok |
| `--danger-text` #be392c | `--surface-raised` #ffffff | light | 5.51 | 4.5 | ok |
| `--danger-text` #be392c | `--surface-soft` #f4f6fa | light | 5.09 | 4.5 | ok |
| `--danger-text` #be392c | `--surface-sunken` #e5e9f0 | light | 4.53 | 4.5 | ok |
| `--warning-text` #8f5e15 | `--surface` #eef1f6 | light | 4.91 | 4.5 | ok |
| `--warning-text` #8f5e15 | `--surface-raised` #ffffff | light | 5.56 | 4.5 | ok |
| `--warning-text` #8f5e15 | `--surface-soft` #f4f6fa | light | 5.13 | 4.5 | ok |
| `--warning-text` #8f5e15 | `--surface-sunken` #e5e9f0 | light | 4.56 | 4.5 | ok |
| `--success-text` #23774b | `--surface` #eef1f6 | light | 4.87 | 4.5 | ok |
| `--success-text` #23774b | `--surface-raised` #ffffff | light | 5.51 | 4.5 | ok |
| `--success-text` #23774b | `--surface-soft` #f4f6fa | light | 5.09 | 4.5 | ok |
| `--success-text` #23774b | `--surface-sunken` #e5e9f0 | light | 4.52 | 4.5 | ok |
| `--accent` #0e8fa6 | `--surface` #eef1f6 | light | 3.37 | 3 | ok |
| `--accent` #0e8fa6 | `--surface-raised` #ffffff | light | 3.82 | 3 | ok |
| `--accent` #0e8fa6 | `--surface-soft` #f4f6fa | light | 3.53 | 3 | ok |
| `--accent` #0e8fa6 | `--surface-sunken` #e5e9f0 | light | 3.14 | 3 | ok |
| `--on-accent` #010c0f | `--accent` #0e8fa6 | light | 5.18 | 4.5 | ok |
| `--on-accent` #010c0f | `--danger` #d24b3e | light | 4.54 | 4.5 | ok |
| `--on-accent` #010c0f | `--warning` #b4771b | light | 5.27 | 4.5 | ok |
| `--on-accent` #010c0f | `--success` #2e9e63 | light | 5.83 | 4.5 | ok |
| `--text` #e9ecf3 | `--surface` #0b0d12 | dark | 16.43 | 4.5 | ok |
| `--text` #e9ecf3 | `--surface-raised` #141821 | dark | 15.02 | 4.5 | ok |
| `--text` #e9ecf3 | `--surface-soft` #1a1f29 | dark | 13.96 | 4.5 | ok |
| `--text` #e9ecf3 | `--surface-sunken` #07090d | dark | 16.85 | 4.5 | ok |
| `--text-muted` #98a2b3 | `--surface` #0b0d12 | dark | 7.55 | 4.5 | ok |
| `--text-muted` #98a2b3 | `--surface-raised` #141821 | dark | 6.90 | 4.5 | ok |
| `--text-muted` #98a2b3 | `--surface-soft` #1a1f29 | dark | 6.41 | 4.5 | ok |
| `--text-muted` #98a2b3 | `--surface-sunken` #07090d | dark | 7.74 | 4.5 | ok |
| `--text-faint` #7d8797 | `--surface` #0b0d12 | dark | 5.35 | 4.5 | ok |
| `--text-faint` #7d8797 | `--surface-raised` #141821 | dark | 4.89 | 4.5 | ok |
| `--text-faint` #7d8797 | `--surface-soft` #1a1f29 | dark | 4.55 | 4.5 | ok |
| `--text-faint` #7d8797 | `--surface-sunken` #07090d | dark | 5.49 | 4.5 | ok |
| `--accent-text` #4ecad8 | `--surface` #0b0d12 | dark | 9.96 | 4.5 | ok |
| `--accent-text` #4ecad8 | `--surface-raised` #141821 | dark | 9.10 | 4.5 | ok |
| `--accent-text` #4ecad8 | `--surface-soft` #1a1f29 | dark | 8.46 | 4.5 | ok |
| `--accent-text` #4ecad8 | `--surface-sunken` #07090d | dark | 10.21 | 4.5 | ok |
| `--danger-text` #ea6a5c | `--surface` #0b0d12 | dark | 6.21 | 4.5 | ok |
| `--danger-text` #ea6a5c | `--surface-raised` #141821 | dark | 5.68 | 4.5 | ok |
| `--danger-text` #ea6a5c | `--surface-soft` #1a1f29 | dark | 5.28 | 4.5 | ok |
| `--danger-text` #ea6a5c | `--surface-sunken` #07090d | dark | 6.37 | 4.5 | ok |
| `--warning-text` #e0a64f | `--surface` #0b0d12 | dark | 9.01 | 4.5 | ok |
| `--warning-text` #e0a64f | `--surface-raised` #141821 | dark | 8.24 | 4.5 | ok |
| `--warning-text` #e0a64f | `--surface-soft` #1a1f29 | dark | 7.66 | 4.5 | ok |
| `--warning-text` #e0a64f | `--surface-sunken` #07090d | dark | 9.24 | 4.5 | ok |
| `--success-text` #5cbe83 | `--surface` #0b0d12 | dark | 8.47 | 4.5 | ok |
| `--success-text` #5cbe83 | `--surface-raised` #141821 | dark | 7.74 | 4.5 | ok |
| `--success-text` #5cbe83 | `--surface-soft` #1a1f29 | dark | 7.19 | 4.5 | ok |
| `--success-text` #5cbe83 | `--surface-sunken` #07090d | dark | 8.68 | 4.5 | ok |
| `--accent` #4ecad8 | `--surface` #0b0d12 | dark | 9.96 | 3 | ok |
| `--accent` #4ecad8 | `--surface-raised` #141821 | dark | 9.10 | 3 | ok |
| `--accent` #4ecad8 | `--surface-soft` #1a1f29 | dark | 8.46 | 3 | ok |
| `--accent` #4ecad8 | `--surface-sunken` #07090d | dark | 10.21 | 3 | ok |
| `--on-accent` #010c0f | `--accent` #4ecad8 | dark | 10.15 | 4.5 | ok |
| `--on-accent` #010c0f | `--danger` #ea6a5c | dark | 6.33 | 4.5 | ok |
| `--on-accent` #010c0f | `--warning` #e0a64f | dark | 9.18 | 4.5 | ok |
| `--on-accent` #010c0f | `--success` #5cbe83 | dark | 8.62 | 4.5 | ok |
<!-- base-contrast:end -->

### Skins

<!-- skin-contrast:start -->
| Skin | Foreground | Background | Theme | Ratio | Threshold | Result |
|---|---|---|---|---|---|---|
| alfred | `--text` #151a22 | `--surface` #eef1f6 | light | 15.42 | 4.5 | ok |
| alfred | `--text` #151a22 | `--surface-raised` #ffffff | light | 17.46 | 4.5 | ok |
| alfred | `--text` #151a22 | `--surface-soft` #f4f6fa | light | 16.14 | 4.5 | ok |
| alfred | `--text` #151a22 | `--surface-sunken` #e5e9f0 | light | 14.34 | 4.5 | ok |
| alfred | `--text-muted` #586274 | `--surface` #eef1f6 | light | 5.43 | 4.5 | ok |
| alfred | `--text-muted` #586274 | `--surface-raised` #ffffff | light | 6.15 | 4.5 | ok |
| alfred | `--text-muted` #586274 | `--surface-soft` #f4f6fa | light | 5.68 | 4.5 | ok |
| alfred | `--text-muted` #586274 | `--surface-sunken` #e5e9f0 | light | 5.05 | 4.5 | ok |
| alfred | `--text-faint` #5d697d | `--surface` #eef1f6 | light | 4.90 | 4.5 | ok |
| alfred | `--text-faint` #5d697d | `--surface-raised` #ffffff | light | 5.55 | 4.5 | ok |
| alfred | `--text-faint` #5d697d | `--surface-soft` #f4f6fa | light | 5.13 | 4.5 | ok |
| alfred | `--text-faint` #5d697d | `--surface-sunken` #e5e9f0 | light | 4.56 | 4.5 | ok |
| alfred | `--accent-text` #0b7386 | `--surface` #eef1f6 | light | 4.87 | 4.5 | ok |
| alfred | `--accent-text` #0b7386 | `--surface-raised` #ffffff | light | 5.51 | 4.5 | ok |
| alfred | `--accent-text` #0b7386 | `--surface-soft` #f4f6fa | light | 5.09 | 4.5 | ok |
| alfred | `--accent-text` #0b7386 | `--surface-sunken` #e5e9f0 | light | 4.53 | 4.5 | ok |
| alfred | `--danger-text` #be392c | `--surface` #eef1f6 | light | 4.87 | 4.5 | ok |
| alfred | `--danger-text` #be392c | `--surface-raised` #ffffff | light | 5.51 | 4.5 | ok |
| alfred | `--danger-text` #be392c | `--surface-soft` #f4f6fa | light | 5.09 | 4.5 | ok |
| alfred | `--danger-text` #be392c | `--surface-sunken` #e5e9f0 | light | 4.53 | 4.5 | ok |
| alfred | `--warning-text` #8f5e15 | `--surface` #eef1f6 | light | 4.91 | 4.5 | ok |
| alfred | `--warning-text` #8f5e15 | `--surface-raised` #ffffff | light | 5.56 | 4.5 | ok |
| alfred | `--warning-text` #8f5e15 | `--surface-soft` #f4f6fa | light | 5.13 | 4.5 | ok |
| alfred | `--warning-text` #8f5e15 | `--surface-sunken` #e5e9f0 | light | 4.56 | 4.5 | ok |
| alfred | `--success-text` #23774b | `--surface` #eef1f6 | light | 4.87 | 4.5 | ok |
| alfred | `--success-text` #23774b | `--surface-raised` #ffffff | light | 5.51 | 4.5 | ok |
| alfred | `--success-text` #23774b | `--surface-soft` #f4f6fa | light | 5.09 | 4.5 | ok |
| alfred | `--success-text` #23774b | `--surface-sunken` #e5e9f0 | light | 4.52 | 4.5 | ok |
| alfred | `--accent` #0e8fa6 | `--surface` #eef1f6 | light | 3.37 | 3 | ok |
| alfred | `--accent` #0e8fa6 | `--surface-raised` #ffffff | light | 3.82 | 3 | ok |
| alfred | `--accent` #0e8fa6 | `--surface-soft` #f4f6fa | light | 3.53 | 3 | ok |
| alfred | `--accent` #0e8fa6 | `--surface-sunken` #e5e9f0 | light | 3.14 | 3 | ok |
| alfred | `--on-accent` #010c0f | `--accent` #0e8fa6 | light | 5.18 | 4.5 | ok |
| alfred | `--on-accent` #010c0f | `--danger` #d24b3e | light | 4.54 | 4.5 | ok |
| alfred | `--on-accent` #010c0f | `--warning` #b4771b | light | 5.27 | 4.5 | ok |
| alfred | `--on-accent` #010c0f | `--success` #2e9e63 | light | 5.83 | 4.5 | ok |
| alfred | `--text` #e9ecf3 | `--surface` #0b0d12 | dark | 16.43 | 4.5 | ok |
| alfred | `--text` #e9ecf3 | `--surface-raised` #141821 | dark | 15.02 | 4.5 | ok |
| alfred | `--text` #e9ecf3 | `--surface-soft` #1a1f29 | dark | 13.96 | 4.5 | ok |
| alfred | `--text` #e9ecf3 | `--surface-sunken` #07090d | dark | 16.85 | 4.5 | ok |
| alfred | `--text-muted` #98a2b3 | `--surface` #0b0d12 | dark | 7.55 | 4.5 | ok |
| alfred | `--text-muted` #98a2b3 | `--surface-raised` #141821 | dark | 6.90 | 4.5 | ok |
| alfred | `--text-muted` #98a2b3 | `--surface-soft` #1a1f29 | dark | 6.41 | 4.5 | ok |
| alfred | `--text-muted` #98a2b3 | `--surface-sunken` #07090d | dark | 7.74 | 4.5 | ok |
| alfred | `--text-faint` #7d8797 | `--surface` #0b0d12 | dark | 5.35 | 4.5 | ok |
| alfred | `--text-faint` #7d8797 | `--surface-raised` #141821 | dark | 4.89 | 4.5 | ok |
| alfred | `--text-faint` #7d8797 | `--surface-soft` #1a1f29 | dark | 4.55 | 4.5 | ok |
| alfred | `--text-faint` #7d8797 | `--surface-sunken` #07090d | dark | 5.49 | 4.5 | ok |
| alfred | `--accent-text` #4ecad8 | `--surface` #0b0d12 | dark | 9.96 | 4.5 | ok |
| alfred | `--accent-text` #4ecad8 | `--surface-raised` #141821 | dark | 9.10 | 4.5 | ok |
| alfred | `--accent-text` #4ecad8 | `--surface-soft` #1a1f29 | dark | 8.46 | 4.5 | ok |
| alfred | `--accent-text` #4ecad8 | `--surface-sunken` #07090d | dark | 10.21 | 4.5 | ok |
| alfred | `--danger-text` #ea6a5c | `--surface` #0b0d12 | dark | 6.21 | 4.5 | ok |
| alfred | `--danger-text` #ea6a5c | `--surface-raised` #141821 | dark | 5.68 | 4.5 | ok |
| alfred | `--danger-text` #ea6a5c | `--surface-soft` #1a1f29 | dark | 5.28 | 4.5 | ok |
| alfred | `--danger-text` #ea6a5c | `--surface-sunken` #07090d | dark | 6.37 | 4.5 | ok |
| alfred | `--warning-text` #e0a64f | `--surface` #0b0d12 | dark | 9.01 | 4.5 | ok |
| alfred | `--warning-text` #e0a64f | `--surface-raised` #141821 | dark | 8.24 | 4.5 | ok |
| alfred | `--warning-text` #e0a64f | `--surface-soft` #1a1f29 | dark | 7.66 | 4.5 | ok |
| alfred | `--warning-text` #e0a64f | `--surface-sunken` #07090d | dark | 9.24 | 4.5 | ok |
| alfred | `--success-text` #5cbe83 | `--surface` #0b0d12 | dark | 8.47 | 4.5 | ok |
| alfred | `--success-text` #5cbe83 | `--surface-raised` #141821 | dark | 7.74 | 4.5 | ok |
| alfred | `--success-text` #5cbe83 | `--surface-soft` #1a1f29 | dark | 7.19 | 4.5 | ok |
| alfred | `--success-text` #5cbe83 | `--surface-sunken` #07090d | dark | 8.68 | 4.5 | ok |
| alfred | `--accent` #4ecad8 | `--surface` #0b0d12 | dark | 9.96 | 3 | ok |
| alfred | `--accent` #4ecad8 | `--surface-raised` #141821 | dark | 9.10 | 3 | ok |
| alfred | `--accent` #4ecad8 | `--surface-soft` #1a1f29 | dark | 8.46 | 3 | ok |
| alfred | `--accent` #4ecad8 | `--surface-sunken` #07090d | dark | 10.21 | 3 | ok |
| alfred | `--on-accent` #010c0f | `--accent` #4ecad8 | dark | 10.15 | 4.5 | ok |
| alfred | `--on-accent` #010c0f | `--danger` #ea6a5c | dark | 6.33 | 4.5 | ok |
| alfred | `--on-accent` #010c0f | `--warning` #e0a64f | dark | 9.18 | 4.5 | ok |
| alfred | `--on-accent` #010c0f | `--success` #5cbe83 | dark | 8.62 | 4.5 | ok |
| nestor | `--text` #332e3c | `--surface` #f5f1ea | light | 11.68 | 4.5 | ok |
| nestor | `--text` #332e3c | `--surface-raised` #ffffff | light | 13.15 | 4.5 | ok |
| nestor | `--text` #332e3c | `--surface-soft` #ede8de | light | 10.77 | 4.5 | ok |
| nestor | `--text` #332e3c | `--surface-sunken` #e6e0d4 | light | 10.01 | 4.5 | ok |
| nestor | `--text-muted` #666076 | `--surface` #f5f1ea | light | 5.33 | 4.5 | ok |
| nestor | `--text-muted` #666076 | `--surface-raised` #ffffff | light | 6.00 | 4.5 | ok |
| nestor | `--text-muted` #666076 | `--surface-soft` #ede8de | light | 4.91 | 4.5 | ok |
| nestor | `--text-muted` #666076 | `--surface-sunken` #e6e0d4 | light | 4.57 | 4.5 | ok |
| nestor | `--text-faint` #695f7a | `--surface` #f5f1ea | light | 5.30 | 4.5 | ok |
| nestor | `--text-faint` #695f7a | `--surface-raised` #ffffff | light | 5.97 | 4.5 | ok |
| nestor | `--text-faint` #695f7a | `--surface-soft` #ede8de | light | 4.89 | 4.5 | ok |
| nestor | `--text-faint` #695f7a | `--surface-sunken` #e6e0d4 | light | 4.54 | 4.5 | ok |
| nestor | `--accent-text` #6b4bc8 | `--surface` #f5f1ea | light | 5.38 | 4.5 | ok |
| nestor | `--accent-text` #6b4bc8 | `--surface-raised` #ffffff | light | 6.06 | 4.5 | ok |
| nestor | `--accent-text` #6b4bc8 | `--surface-soft` #ede8de | light | 4.96 | 4.5 | ok |
| nestor | `--accent-text` #6b4bc8 | `--surface-sunken` #e6e0d4 | light | 4.61 | 4.5 | ok |
| nestor | `--danger-text` #b13a28 | `--surface` #f5f1ea | light | 5.32 | 4.5 | ok |
| nestor | `--danger-text` #b13a28 | `--surface-raised` #ffffff | light | 5.99 | 4.5 | ok |
| nestor | `--danger-text` #b13a28 | `--surface-soft` #ede8de | light | 4.91 | 4.5 | ok |
| nestor | `--danger-text` #b13a28 | `--surface-sunken` #e6e0d4 | light | 4.56 | 4.5 | ok |
| nestor | `--warning-text` #875914 | `--surface` #f5f1ea | light | 5.38 | 4.5 | ok |
| nestor | `--warning-text` #875914 | `--surface-raised` #ffffff | light | 6.05 | 4.5 | ok |
| nestor | `--warning-text` #875914 | `--surface-soft` #ede8de | light | 4.96 | 4.5 | ok |
| nestor | `--warning-text` #875914 | `--surface-sunken` #e6e0d4 | light | 4.61 | 4.5 | ok |
| nestor | `--success-text` #217046 | `--surface` #f5f1ea | light | 5.37 | 4.5 | ok |
| nestor | `--success-text` #217046 | `--surface-raised` #ffffff | light | 6.05 | 4.5 | ok |
| nestor | `--success-text` #217046 | `--surface-soft` #ede8de | light | 4.96 | 4.5 | ok |
| nestor | `--success-text` #217046 | `--surface-sunken` #e6e0d4 | light | 4.60 | 4.5 | ok |
| nestor | `--accent` #6b4bc8 | `--surface` #f5f1ea | light | 5.38 | 3 | ok |
| nestor | `--accent` #6b4bc8 | `--surface-raised` #ffffff | light | 6.06 | 3 | ok |
| nestor | `--accent` #6b4bc8 | `--surface-soft` #ede8de | light | 4.96 | 3 | ok |
| nestor | `--accent` #6b4bc8 | `--surface-sunken` #e6e0d4 | light | 4.61 | 3 | ok |
| nestor | `--on-accent` #ffffff | `--accent` #6b4bc8 | light | 6.06 | 4.5 | ok |
| nestor | `--on-accent` #ffffff | `--danger` #c4402c | light | 5.10 | 4.5 | ok |
| nestor | `--on-accent` #ffffff | `--warning` #a26b18 | light | 4.51 | 4.5 | ok |
| nestor | `--on-accent` #ffffff | `--success` #278654 | light | 4.54 | 4.5 | ok |
| nestor | `--text` #ece7f6 | `--surface` #131022 | dark | 15.40 | 4.5 | ok |
| nestor | `--text` #ece7f6 | `--surface-raised` #1d1836 | dark | 14.02 | 4.5 | ok |
| nestor | `--text` #ece7f6 | `--surface-soft` #171331 | dark | 14.76 | 4.5 | ok |
| nestor | `--text` #ece7f6 | `--surface-sunken` #0c0a18 | dark | 16.16 | 4.5 | ok |
| nestor | `--text-muted` #9c94b4 | `--surface` #131022 | dark | 6.50 | 4.5 | ok |
| nestor | `--text-muted` #9c94b4 | `--surface-raised` #1d1836 | dark | 5.91 | 4.5 | ok |
| nestor | `--text-muted` #9c94b4 | `--surface-soft` #171331 | dark | 6.23 | 4.5 | ok |
| nestor | `--text-muted` #9c94b4 | `--surface-sunken` #0c0a18 | dark | 6.82 | 4.5 | ok |
| nestor | `--text-faint` #8680a0 | `--surface` #131022 | dark | 4.99 | 4.5 | ok |
| nestor | `--text-faint` #8680a0 | `--surface-raised` #1d1836 | dark | 4.54 | 4.5 | ok |
| nestor | `--text-faint` #8680a0 | `--surface-soft` #171331 | dark | 4.78 | 4.5 | ok |
| nestor | `--text-faint` #8680a0 | `--surface-sunken` #0c0a18 | dark | 5.23 | 4.5 | ok |
| nestor | `--accent-text` #8e70e9 | `--surface` #131022 | dark | 5.02 | 4.5 | ok |
| nestor | `--accent-text` #8e70e9 | `--surface-raised` #1d1836 | dark | 4.57 | 4.5 | ok |
| nestor | `--accent-text` #8e70e9 | `--surface-soft` #171331 | dark | 4.81 | 4.5 | ok |
| nestor | `--accent-text` #8e70e9 | `--surface-sunken` #0c0a18 | dark | 5.26 | 4.5 | ok |
| nestor | `--danger-text` #ea6a7e | `--surface` #131022 | dark | 6.10 | 4.5 | ok |
| nestor | `--danger-text` #ea6a7e | `--surface-raised` #1d1836 | dark | 5.55 | 4.5 | ok |
| nestor | `--danger-text` #ea6a7e | `--surface-soft` #171331 | dark | 5.84 | 4.5 | ok |
| nestor | `--danger-text` #ea6a7e | `--surface-sunken` #0c0a18 | dark | 6.40 | 4.5 | ok |
| nestor | `--warning-text` #e8b45c | `--surface` #131022 | dark | 9.88 | 4.5 | ok |
| nestor | `--warning-text` #e8b45c | `--surface-raised` #1d1836 | dark | 8.99 | 4.5 | ok |
| nestor | `--warning-text` #e8b45c | `--surface-soft` #171331 | dark | 9.47 | 4.5 | ok |
| nestor | `--warning-text` #e8b45c | `--surface-sunken` #0c0a18 | dark | 10.37 | 4.5 | ok |
| nestor | `--success-text` #4fc08a | `--surface` #131022 | dark | 8.21 | 4.5 | ok |
| nestor | `--success-text` #4fc08a | `--surface-raised` #1d1836 | dark | 7.47 | 4.5 | ok |
| nestor | `--success-text` #4fc08a | `--surface-soft` #171331 | dark | 7.87 | 4.5 | ok |
| nestor | `--success-text` #4fc08a | `--surface-sunken` #0c0a18 | dark | 8.62 | 4.5 | ok |
| nestor | `--accent` #8b6ce8 | `--surface` #131022 | dark | 4.81 | 3 | ok |
| nestor | `--accent` #8b6ce8 | `--surface-raised` #1d1836 | dark | 4.37 | 3 | ok |
| nestor | `--accent` #8b6ce8 | `--surface-soft` #171331 | dark | 4.61 | 3 | ok |
| nestor | `--accent` #8b6ce8 | `--surface-sunken` #0c0a18 | dark | 5.04 | 3 | ok |
| nestor | `--on-accent` #0f0a1e | `--accent` #8b6ce8 | dark | 5.00 | 4.5 | ok |
| nestor | `--on-accent` #0f0a1e | `--danger` #ea6a7e | dark | 6.34 | 4.5 | ok |
| nestor | `--on-accent` #0f0a1e | `--warning` #e8b45c | dark | 10.27 | 4.5 | ok |
| nestor | `--on-accent` #0f0a1e | `--success` #4fc08a | dark | 8.54 | 4.5 | ok |
| dobby | `--text` #2a2119 | `--surface` #ede3cf | light | 12.40 | 4.5 | ok |
| dobby | `--text` #2a2119 | `--surface-raised` #f7f0e1 | light | 13.91 | 4.5 | ok |
| dobby | `--text` #2a2119 | `--surface-soft` #e6dac2 | light | 11.41 | 4.5 | ok |
| dobby | `--text` #2a2119 | `--surface-sunken` #dfd1b6 | light | 10.48 | 4.5 | ok |
| dobby | `--text-muted` #5f5040 | `--surface` #ede3cf | light | 6.09 | 4.5 | ok |
| dobby | `--text-muted` #5f5040 | `--surface-raised` #f7f0e1 | light | 6.83 | 4.5 | ok |
| dobby | `--text-muted` #5f5040 | `--surface-soft` #e6dac2 | light | 5.60 | 4.5 | ok |
| dobby | `--text-muted` #5f5040 | `--surface-sunken` #dfd1b6 | light | 5.15 | 4.5 | ok |
| dobby | `--text-faint` #655949 | `--surface` #ede3cf | light | 5.36 | 4.5 | ok |
| dobby | `--text-faint` #655949 | `--surface-raised` #f7f0e1 | light | 6.01 | 4.5 | ok |
| dobby | `--text-faint` #655949 | `--surface-soft` #e6dac2 | light | 4.93 | 4.5 | ok |
| dobby | `--text-faint` #655949 | `--surface-sunken` #dfd1b6 | light | 4.53 | 4.5 | ok |
| dobby | `--accent-text` #75551b | `--surface` #ede3cf | light | 5.37 | 4.5 | ok |
| dobby | `--accent-text` #75551b | `--surface-raised` #f7f0e1 | light | 6.02 | 4.5 | ok |
| dobby | `--accent-text` #75551b | `--surface-soft` #e6dac2 | light | 4.94 | 4.5 | ok |
| dobby | `--accent-text` #75551b | `--surface-sunken` #dfd1b6 | light | 4.54 | 4.5 | ok |
| dobby | `--danger-text` #a13629 | `--surface` #ede3cf | light | 5.36 | 4.5 | ok |
| dobby | `--danger-text` #a13629 | `--surface-raised` #f7f0e1 | light | 6.02 | 4.5 | ok |
| dobby | `--danger-text` #a13629 | `--surface-soft` #e6dac2 | light | 4.93 | 4.5 | ok |
| dobby | `--danger-text` #a13629 | `--surface-sunken` #dfd1b6 | light | 4.53 | 4.5 | ok |
| dobby | `--warning-text` #795216 | `--surface` #ede3cf | light | 5.44 | 4.5 | ok |
| dobby | `--warning-text` #795216 | `--surface-raised` #f7f0e1 | light | 6.10 | 4.5 | ok |
| dobby | `--warning-text` #795216 | `--surface-soft` #e6dac2 | light | 5.00 | 4.5 | ok |
| dobby | `--warning-text` #795216 | `--surface-sunken` #dfd1b6 | light | 4.60 | 4.5 | ok |
| dobby | `--success-text` #406338 | `--surface` #ede3cf | light | 5.39 | 4.5 | ok |
| dobby | `--success-text` #406338 | `--surface-raised` #f7f0e1 | light | 6.05 | 4.5 | ok |
| dobby | `--success-text` #406338 | `--surface-soft` #e6dac2 | light | 4.96 | 4.5 | ok |
| dobby | `--success-text` #406338 | `--surface-sunken` #dfd1b6 | light | 4.55 | 4.5 | ok |
| dobby | `--accent` #8a6420 | `--surface` #ede3cf | light | 4.20 | 3 | ok |
| dobby | `--accent` #8a6420 | `--surface-raised` #f7f0e1 | light | 4.72 | 3 | ok |
| dobby | `--accent` #8a6420 | `--surface-soft` #e6dac2 | light | 3.87 | 3 | ok |
| dobby | `--accent` #8a6420 | `--surface-sunken` #dfd1b6 | light | 3.55 | 3 | ok |
| dobby | `--on-accent` #fbf5e8 | `--accent` #8a6420 | light | 4.93 | 4.5 | ok |
| dobby | `--on-accent` #fbf5e8 | `--danger` #a5372a | light | 6.08 | 4.5 | ok |
| dobby | `--on-accent` #fbf5e8 | `--warning` #93641b | light | 4.74 | 4.5 | ok |
| dobby | `--on-accent` #fbf5e8 | `--success` #4f7a45 | light | 4.60 | 4.5 | ok |
| dobby | `--dby-cuir-text` #f7ecd8 | `--dby-cuir` #7a2e27 | light | 7.98 | 4.5 | ok |
| dobby | `--text` #ecdfc6 | `--surface` #17130f | dark | 14.02 | 4.5 | ok |
| dobby | `--text` #ecdfc6 | `--surface-raised` #221b15 | dark | 12.90 | 4.5 | ok |
| dobby | `--text` #ecdfc6 | `--surface-soft` #1c1712 | dark | 13.50 | 4.5 | ok |
| dobby | `--text` #ecdfc6 | `--surface-sunken` #0f0c09 | dark | 14.80 | 4.5 | ok |
| dobby | `--text-muted` #b6a385 | `--surface` #17130f | dark | 7.54 | 4.5 | ok |
| dobby | `--text-muted` #b6a385 | `--surface-raised` #221b15 | dark | 6.93 | 4.5 | ok |
| dobby | `--text-muted` #b6a385 | `--surface-soft` #1c1712 | dark | 7.26 | 4.5 | ok |
| dobby | `--text-muted` #b6a385 | `--surface-sunken` #0f0c09 | dark | 7.96 | 4.5 | ok |
| dobby | `--text-faint` #958167 | `--surface` #17130f | dark | 4.94 | 4.5 | ok |
| dobby | `--text-faint` #958167 | `--surface-raised` #221b15 | dark | 4.54 | 4.5 | ok |
| dobby | `--text-faint` #958167 | `--surface-soft` #1c1712 | dark | 4.75 | 4.5 | ok |
| dobby | `--text-faint` #958167 | `--surface-sunken` #0f0c09 | dark | 5.21 | 4.5 | ok |
| dobby | `--accent-text` #c8a25a | `--surface` #17130f | dark | 7.72 | 4.5 | ok |
| dobby | `--accent-text` #c8a25a | `--surface-raised` #221b15 | dark | 7.10 | 4.5 | ok |
| dobby | `--accent-text` #c8a25a | `--surface-soft` #1c1712 | dark | 7.43 | 4.5 | ok |
| dobby | `--accent-text` #c8a25a | `--surface-sunken` #0f0c09 | dark | 8.15 | 4.5 | ok |
| dobby | `--danger-text` #d0654f | `--surface` #17130f | dark | 4.98 | 4.5 | ok |
| dobby | `--danger-text` #d0654f | `--surface-raised` #221b15 | dark | 4.58 | 4.5 | ok |
| dobby | `--danger-text` #d0654f | `--surface-soft` #1c1712 | dark | 4.79 | 4.5 | ok |
| dobby | `--danger-text` #d0654f | `--surface-sunken` #0f0c09 | dark | 5.25 | 4.5 | ok |
| dobby | `--warning-text` #d9a548 | `--surface` #17130f | dark | 8.29 | 4.5 | ok |
| dobby | `--warning-text` #d9a548 | `--surface-raised` #221b15 | dark | 7.63 | 4.5 | ok |
| dobby | `--warning-text` #d9a548 | `--surface-soft` #1c1712 | dark | 7.98 | 4.5 | ok |
| dobby | `--warning-text` #d9a548 | `--surface-sunken` #0f0c09 | dark | 8.75 | 4.5 | ok |
| dobby | `--success-text` #8fb07a | `--surface` #17130f | dark | 7.62 | 4.5 | ok |
| dobby | `--success-text` #8fb07a | `--surface-raised` #221b15 | dark | 7.01 | 4.5 | ok |
| dobby | `--success-text` #8fb07a | `--surface-soft` #1c1712 | dark | 7.33 | 4.5 | ok |
| dobby | `--success-text` #8fb07a | `--surface-sunken` #0f0c09 | dark | 8.04 | 4.5 | ok |
| dobby | `--accent` #c8a25a | `--surface` #17130f | dark | 7.72 | 3 | ok |
| dobby | `--accent` #c8a25a | `--surface-raised` #221b15 | dark | 7.10 | 3 | ok |
| dobby | `--accent` #c8a25a | `--surface-soft` #1c1712 | dark | 7.43 | 3 | ok |
| dobby | `--accent` #c8a25a | `--surface-sunken` #0f0c09 | dark | 8.15 | 3 | ok |
| dobby | `--on-accent` #1a130b | `--accent` #c8a25a | dark | 7.68 | 4.5 | ok |
| dobby | `--on-accent` #1a130b | `--danger` #d0654f | dark | 4.95 | 4.5 | ok |
| dobby | `--on-accent` #1a130b | `--warning` #d9a548 | dark | 8.25 | 4.5 | ok |
| dobby | `--on-accent` #1a130b | `--success` #8fb07a | dark | 7.58 | 4.5 | ok |
| dobby | `--dby-cuir-text` #f3e6d0 | `--dby-cuir` #7a2e27 | dark | 7.58 | 4.5 | ok |
| skippy | `--text` #141920 | `--surface` #e9ecf0 | light | 14.90 | 4.5 | ok |
| skippy | `--text` #141920 | `--surface-raised` #ffffff | light | 17.65 | 4.5 | ok |
| skippy | `--text` #141920 | `--surface-soft` #f3f5f8 | light | 16.16 | 4.5 | ok |
| skippy | `--text` #141920 | `--surface-sunken` #dfe3e9 | light | 13.70 | 4.5 | ok |
| skippy | `--text-muted` #5a6370 | `--surface` #e9ecf0 | light | 5.13 | 4.5 | ok |
| skippy | `--text-muted` #5a6370 | `--surface-raised` #ffffff | light | 6.08 | 4.5 | ok |
| skippy | `--text-muted` #5a6370 | `--surface-soft` #f3f5f8 | light | 5.57 | 4.5 | ok |
| skippy | `--text-muted` #5a6370 | `--surface-sunken` #dfe3e9 | light | 4.72 | 4.5 | ok |
| skippy | `--text-faint` #5e6571 | `--surface` #e9ecf0 | light | 4.96 | 4.5 | ok |
| skippy | `--text-faint` #5e6571 | `--surface-raised` #ffffff | light | 5.87 | 4.5 | ok |
| skippy | `--text-faint` #5e6571 | `--surface-soft` #f3f5f8 | light | 5.38 | 4.5 | ok |
| skippy | `--text-faint` #5e6571 | `--surface-sunken` #dfe3e9 | light | 4.56 | 4.5 | ok |
| skippy | `--accent-text` #8a5a14 | `--surface` #e9ecf0 | light | 4.99 | 4.5 | ok |
| skippy | `--accent-text` #8a5a14 | `--surface-raised` #ffffff | light | 5.91 | 4.5 | ok |
| skippy | `--accent-text` #8a5a14 | `--surface-soft` #f3f5f8 | light | 5.41 | 4.5 | ok |
| skippy | `--accent-text` #8a5a14 | `--surface-sunken` #dfe3e9 | light | 4.59 | 4.5 | ok |
| skippy | `--danger-text` #b53b29 | `--surface` #e9ecf0 | light | 4.89 | 4.5 | ok |
| skippy | `--danger-text` #b53b29 | `--surface-raised` #ffffff | light | 5.80 | 4.5 | ok |
| skippy | `--danger-text` #b53b29 | `--surface-soft` #f3f5f8 | light | 5.31 | 4.5 | ok |
| skippy | `--danger-text` #b53b29 | `--surface-sunken` #dfe3e9 | light | 4.50 | 4.5 | ok |
| skippy | `--warning-text` #8a5a14 | `--surface` #e9ecf0 | light | 4.99 | 4.5 | ok |
| skippy | `--warning-text` #8a5a14 | `--surface-raised` #ffffff | light | 5.91 | 4.5 | ok |
| skippy | `--warning-text` #8a5a14 | `--surface-soft` #f3f5f8 | light | 5.41 | 4.5 | ok |
| skippy | `--warning-text` #8a5a14 | `--surface-sunken` #dfe3e9 | light | 4.59 | 4.5 | ok |
| skippy | `--success-text` #217348 | `--surface` #e9ecf0 | light | 4.91 | 4.5 | ok |
| skippy | `--success-text` #217348 | `--surface-raised` #ffffff | light | 5.82 | 4.5 | ok |
| skippy | `--success-text` #217348 | `--surface-soft` #f3f5f8 | light | 5.33 | 4.5 | ok |
| skippy | `--success-text` #217348 | `--surface-sunken` #dfe3e9 | light | 4.52 | 4.5 | ok |
| skippy | `--accent` #b0731a | `--surface` #e9ecf0 | light | 3.34 | 3 | ok |
| skippy | `--accent` #b0731a | `--surface-raised` #ffffff | light | 3.95 | 3 | ok |
| skippy | `--accent` #b0731a | `--surface-soft` #f3f5f8 | light | 3.62 | 3 | ok |
| skippy | `--accent` #b0731a | `--surface-sunken` #dfe3e9 | light | 3.07 | 3 | ok |
| skippy | `--on-accent` #080a0d | `--accent` #b0731a | light | 5.01 | 4.5 | ok |
| skippy | `--on-accent` #080a0d | `--danger` #d24c37 | light | 4.56 | 4.5 | ok |
| skippy | `--on-accent` #080a0d | `--warning` #b0731a | light | 5.01 | 4.5 | ok |
| skippy | `--on-accent` #080a0d | `--success` #2e9e63 | light | 5.84 | 4.5 | ok |
| skippy | `--text` #d7dee6 | `--surface` #080a0d | dark | 14.61 | 4.5 | ok |
| skippy | `--text` #d7dee6 | `--surface-raised` #101419 | dark | 13.63 | 4.5 | ok |
| skippy | `--text` #d7dee6 | `--surface-soft` #171c23 | dark | 12.62 | 4.5 | ok |
| skippy | `--text` #d7dee6 | `--surface-sunken` #05070a | dark | 14.87 | 4.5 | ok |
| skippy | `--text-muted` #8e98a5 | `--surface` #080a0d | dark | 6.78 | 4.5 | ok |
| skippy | `--text-muted` #8e98a5 | `--surface-raised` #101419 | dark | 6.32 | 4.5 | ok |
| skippy | `--text-muted` #8e98a5 | `--surface-soft` #171c23 | dark | 5.86 | 4.5 | ok |
| skippy | `--text-muted` #8e98a5 | `--surface-sunken` #05070a | dark | 6.90 | 4.5 | ok |
| skippy | `--text-faint` #7a8592 | `--surface` #080a0d | dark | 5.28 | 4.5 | ok |
| skippy | `--text-faint` #7a8592 | `--surface-raised` #101419 | dark | 4.93 | 4.5 | ok |
| skippy | `--text-faint` #7a8592 | `--surface-soft` #171c23 | dark | 4.56 | 4.5 | ok |
| skippy | `--text-faint` #7a8592 | `--surface-sunken` #05070a | dark | 5.38 | 4.5 | ok |
| skippy | `--accent-text` #f2a93b | `--surface` #080a0d | dark | 9.92 | 4.5 | ok |
| skippy | `--accent-text` #f2a93b | `--surface-raised` #101419 | dark | 9.25 | 4.5 | ok |
| skippy | `--accent-text` #f2a93b | `--surface-soft` #171c23 | dark | 8.57 | 4.5 | ok |
| skippy | `--accent-text` #f2a93b | `--surface-sunken` #05070a | dark | 10.10 | 4.5 | ok |
| skippy | `--danger-text` #e8543f | `--surface` #080a0d | dark | 5.45 | 4.5 | ok |
| skippy | `--danger-text` #e8543f | `--surface-raised` #101419 | dark | 5.08 | 4.5 | ok |
| skippy | `--danger-text` #e8543f | `--surface-soft` #171c23 | dark | 4.70 | 4.5 | ok |
| skippy | `--danger-text` #e8543f | `--surface-sunken` #05070a | dark | 5.54 | 4.5 | ok |
| skippy | `--warning-text` #f2a93b | `--surface` #080a0d | dark | 9.92 | 4.5 | ok |
| skippy | `--warning-text` #f2a93b | `--surface-raised` #101419 | dark | 9.25 | 4.5 | ok |
| skippy | `--warning-text` #f2a93b | `--surface-soft` #171c23 | dark | 8.57 | 4.5 | ok |
| skippy | `--warning-text` #f2a93b | `--surface-sunken` #05070a | dark | 10.10 | 4.5 | ok |
| skippy | `--success-text` #3fbf86 | `--surface` #080a0d | dark | 8.50 | 4.5 | ok |
| skippy | `--success-text` #3fbf86 | `--surface-raised` #101419 | dark | 7.93 | 4.5 | ok |
| skippy | `--success-text` #3fbf86 | `--surface-soft` #171c23 | dark | 7.34 | 4.5 | ok |
| skippy | `--success-text` #3fbf86 | `--surface-sunken` #05070a | dark | 8.65 | 4.5 | ok |
| skippy | `--accent` #f2a93b | `--surface` #080a0d | dark | 9.92 | 3 | ok |
| skippy | `--accent` #f2a93b | `--surface-raised` #101419 | dark | 9.25 | 3 | ok |
| skippy | `--accent` #f2a93b | `--surface-soft` #171c23 | dark | 8.57 | 3 | ok |
| skippy | `--accent` #f2a93b | `--surface-sunken` #05070a | dark | 10.10 | 3 | ok |
| skippy | `--on-accent` #080a0d | `--accent` #f2a93b | dark | 9.92 | 4.5 | ok |
| skippy | `--on-accent` #080a0d | `--danger` #e8543f | dark | 5.45 | 4.5 | ok |
| skippy | `--on-accent` #080a0d | `--warning` #f2a93b | dark | 9.92 | 4.5 | ok |
| skippy | `--on-accent` #080a0d | `--success` #3fbf86 | dark | 8.50 | 4.5 | ok |
<!-- skin-contrast:end -->

Corrections keep each hue and move lightness only. Bright fills keep their colour;
`--accent-text`, `--danger-text`, `--warning-text` and `--success-text` are their text twins
on surfaces. `--on-accent` is dark ink on bright fills, in both themes: white fails on the
inherited accents. Its lightness also lets the unchanged danger, warning and success
fills carry a label at AA. `--text-faint` is corrected in both themes; placeholders have
the same 4.5:1 floor as other text.

### Composed backgrounds on E-10 and E-19

Measured in Chromium on the `base` seed of `bench/launch.mjs --engine fake`,
under each skin, explicit light and dark, at 1440 × 900 and 390 × 844. Both sizes
give the same ratios below. The backgrounds are the rendered sRGB colours after
alpha composition, rounded to RGB integers for display; ratios use the unrounded values.

E-19 uses the existing `--danger-text` / `--warning-text` inks over a **4%** fill tint
(the 12% tint failed AA). E-10 hot chips use `--tile-color-text`: `Tile.tsx` reads
`--adestia-hue-<hue>-text`, falling back to the original hue, or `--accent-text`
when no hue is defined. Skippy light supplies `--adestia-hue-indigo-text` from
`--accent-text`; its amber marks and fills keep their colour. The two hot states,
failed and needs-auth, have identical colours and are represented by one row.
The E-10 rows below use indigo. Dobby dark also supplies an ardoise text twin
`#8c8983` (HSL lightness lifted from `#7d7a74`), leaving its tile marks and fills
unchanged. The hot chip's rendered background is the opaque `--surface-raised`:
the later `.adestia-chip` rule in `reader.css` overrides the 10% tint in `tiles.css`.

| Pair | Skin / theme | Text RGB | Composed background RGB | Ratio | Threshold | Result |
|---|---|---|---|---|---|---|
| E-10 hot chip | skippy / light | 138, 90, 20 | 255,255,255 | 5.91 | 4.5 | ok |
| E-19 refused heading | skippy / light | 181, 59, 41 | 232,230,233 | 4.66 | 4.5 | ok |
| E-19 degraded heading | skippy / light | 138, 90, 20 | 231,232,232 | 4.80 | 4.5 | ok |
| E-10 hot chip | skippy / dark | 242, 169, 59 | 16,20,25 | 9.25 | 4.5 | ok |
| E-19 refused heading | skippy / dark | 232, 84, 63 | 17,13,14 | 5.32 | 4.5 | ok |
| E-19 degraded heading | skippy / dark | 242, 169, 59 | 17,17,14 | 9.49 | 4.5 | ok |
| E-10 hot chip | alfred / light | 76, 111, 224 | 255,255,255 | 4.51 | 4.5 | ok |
| E-19 refused heading | alfred / light | 190, 57, 44 | 237,235,238 | 4.63 | 4.5 | ok |
| E-19 degraded heading | alfred / light | 143, 94, 21 | 236,237,237 | 4.72 | 4.5 | ok |
| E-10 hot chip | alfred / dark | 123, 150, 242 | 20,24,33 | 6.33 | 4.5 | ok |
| E-19 refused heading | alfred / dark | 234, 106, 92 | 20,16,21 | 6.01 | 4.5 | ok |
| E-19 degraded heading | alfred / dark | 224, 166, 79 | 20,20,20 | 8.57 | 4.5 | ok |
| E-10 hot chip | nestor / light | 76, 111, 224 | 255,255,255 | 4.51 | 4.5 | ok |
| E-19 refused heading | nestor / light | 177, 58, 40 | 243,235,227 | 5.07 | 4.5 | ok |
| E-19 degraded heading | nestor / light | 135, 89, 20 | 241,236,226 | 5.13 | 4.5 | ok |
| E-10 hot chip | nestor / dark | 123, 150, 242 | 29,24,54 | 6.06 | 4.5 | ok |
| E-19 refused heading | nestor / dark | 234, 106, 126 | 27,19,38 | 5.86 | 4.5 | ok |
| E-19 degraded heading | nestor / dark | 232, 180, 92 | 27,22,37 | 9.33 | 4.5 | ok |
| E-10 hot chip | dobby / light | 76, 74, 134 | 247,240,225 | 7.03 | 4.5 | ok |
| E-19 refused heading | dobby / light | 161, 54, 41 | 234,220,201 | 5.07 | 4.5 | ok |
| E-19 degraded heading | dobby / light | 121, 82, 22 | 234,222,200 | 5.21 | 4.5 | ok |
| E-10 hot chip | dobby / dark | 138, 136, 184 | 34,27,21 | 5.09 | 4.5 | ok |
| E-10 hot chip, ardoise | dobby / dark | 140, 137, 131 | 34,27,21 | 4.87 | 4.5 | ok |
| E-19 refused heading | dobby / dark | 208, 101, 79 | 30,22,17 | 4.79 | 4.5 | ok |
| E-19 degraded heading | dobby / dark | 217, 165, 72 | 31,24,17 | 7.86 | 4.5 | ok |

### How the contrast test works

`packages/web/test/contrast.test.ts` reads `tokens.css` and the four `skins/*/skin.css`,
resolves each theme (evaluating `light-dark()` and `var()`), and computes the WCAG ratio of
every **declared pair**: `--text`, `--text-muted`, `--text-faint`, `--accent-text`,
`--danger-text`, `--warning-text`, `--success-text` (as text) and `--accent` (as a non-text
3:1 edge) over `--surface`, `--surface-raised`, `--surface-soft`, `--surface-sunken`; and
`--on-accent` over `--accent`, `--danger`, `--warning`, `--success`; plus a skin's own pairs
(Dobby's `--dby-cuir-text` on `--dby-cuir`). It fails for a pair under its threshold that is
not listed in § 6, and it prints the two tables above (the file is regenerated from the
test's output, not typed). The list of pairs is data in the test, so a pair added to the
palette is a line to add.

The same test also composes E-19's refused/degraded tints over the page's
`--surface` and checks the headings in every declared theme. Hot chips are checked
for indigo and ardoise through the `hue-text` → `hue` → `accent-text` fallback
chain on their rendered `--surface-raised` fill. These checks read the delivered
CSS, so reverting the 4% tint to 12% or dropping a required text twin fails.

Corrections keep the hue (HSL h) and move lightness only. Method per token: a token that is
a **fill** somewhere (accent, danger, success, warning as a dot, a bar or a button) is kept
and gains a `*-text` twin for its text uses; a token that is only ever text
(`--text-faint`) is moved. Call sites that use `--accent`, `--danger`, `--success`,
`--warning` as a text colour switch to the twin: the four sheets of the settings screens and
`shell.css` have done so; the chat, pages and plugin sheets do in their tranches.
`--text-faint` is for decoration and placeholders **at 4.5:1**; there is no tier below.

## 6. Accepted departures

None: the declared token pairs and the rendered E-10 hot chips and E-19 headings
listed in § 5 reach AA. This includes the composed backgrounds: token-on-surface
measurements alone do not establish contrast on a translucent tint. The hot chip uses
a text twin and E-19 uses a 4% tint; neither redraws a persona. Any pair left below
AA must be recorded here with its reason and the mandate holder’s acceptance.
