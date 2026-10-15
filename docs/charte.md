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
  `--text-lg` 18px) and about sixty literal sizes over twelve values. The tranche writes the
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
- **Navigation**: the breadcrumb is the location; one way back per screen (**TARGET**: the
  shell's back on plugin apps, and the plugins' own back links removed where they double
  it).
- **Feedback**: save status inline where the edit happens (editor, settings forms), as
  today. **Departure kept**: no toast system — every action of the product happens in a
  form or a page that shows its own state; a toast would duplicate it.
- **Dialogs**: one sheet (centred on desktop, bottom sheet under 720 px) with one scrim,
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
