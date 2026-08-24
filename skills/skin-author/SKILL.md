---
name: skin-author
description: Write a Golem skin — the tokens and narrow hooks that dress one instance. Use when asked to change how Golem looks, brand it, or create a theme.
---

# Writing a Golem skin

A skin **dresses** an instance. Exactly one is active, chosen by a value in
`golem.config.yaml` — unlike plugins, which are lists and combine.

That difference is why a skin is not a kind of plugin: every plugin axis is a
list, a skin's axis is a single value, and an exception like that empties a
rule of its meaning.

## The shape

```
skins/<id>/
  golem-skin.json       REQUIRED
  skin.css              token overrides, and NOTHING else
  skin.js               narrow hooks (brand, crest, busy indicator, home)
  assets/icon.svg       favicon and home-screen icon
  assets/manifest.json  web-app manifest overrides
```

```json
{
  "schemaVersion": 1,
  "id": "amber",
  "description": "Amber on charcoal, monospace headings, hard corners.",
  "scheme": "dark",
  "styles": "./skin.css",
  "module": "./skin.js",
  "icon": "./assets/icon.svg",
  "manifest": "./assets/manifest.json"
}
```

### `scheme` is the field that saves you

`"light"`, `"dark"`, or `"auto"` (the default, which follows the viewer).

**Declare it whenever your palette commits to one.** Overriding `--surface` to
a dark value while the base palette is light gives you dark surfaces under
dark text — unreadable, and mystifying because each token looked right on its
own. A skin declaring `dark` gets the shell's COMPLETE dark palette first, so
overriding three tokens still leaves a coherent one.

`<id>` is the folder name; a manifest claiming another is refused.

## The rule that makes skins safe

**A skin declares TOKENS for the shell. It never writes a structural rule
against shell classes.** (Classes only YOUR OWN markup produces — a mascot, a
custom home — may carry real CSS; the shell knows nothing of them.)

```css
/* skin.css — this, and only this shape, for the shell's look */
:root[data-skin='amber'] {
  --accent: #f0a34a;
  --surface: #17161a;
  --radius: 3px;
  --font: 'IBM Plex Sans', system-ui, sans-serif;
}
```

Never this:

```css
/* WRONG: a layout rule scoped to a skin */
:root[data-skin='amber'] .golem-chat { grid-template-columns: 1fr 2fr; }
```

The reason is not tidiness. Several personalities share one shell; the moment a
skin can move a box, they stop being the same product and every future change
to the layout has to be re-tested once per skin. Tokens keep the shell single.

Every token the shell reads is defined on bare `:root` first, so an instance
with no skin, or a skin that overrides three values, is still complete.

## The vocabulary — what a livery can actually say

The base sheet is itself a livery (a butler's: cool paper, white cards, serif
address, teal). A skin is a DEPARTURE from it, and the token set is designed
so three radically different characters need nothing beyond tokens. The
groups, and the gesture each one carries:

**Voices.** `--font` is for reading, `--font-title` for address (the greeting,
the brand), `--font-mono` for apparatus (labels, chips, counts),
`--font-input` for the composer. Named by ROLE so a terminal-like skin can set
`--font-title: var(--font-mono)` and a soft one can go rounded — no rule ever
says "monospace".

**Radii, the whole scale.** `--radius-micro/-sm/-ctl/…/-pill/-round` — and
`--radius-round` matters: a hard-edged skin sets it to `2px` and the send
button stops being a circle. One token, one identity decision.

**Shadows, three depths.** `--shadow-sm/--shadow/--shadow-lg`. A skin that
separates by borders instead of depth sets `--shadow-sm: none` and keeps only
a deep one for floating things — emitted light instead of simulated depth.

**Icon plates — the seven knobs.** Every tile icon, and the crest, sits on a
plate drawn from `--plate-top`, `--plate-mix` (gradient stops as a % of the
tile's colour over `--plate-base`), `--plate-fg`/`--plate-fg-tint` (glyph
colour), `--plate-border-width`/`--plate-border-tint`. The base is a saturated
gradient under a white glyph; `top = mix = 16%` over the surface with a tinted
1px border gives a flat translucent slab whose glyph TAKES the colour. Same
rule, opposite look.

**Named hues.** `--golem-hue-rouge` … `--golem-hue-ardoise` — what pages and
tiles mean when they say `couleur: turquoise` or `hue: "emeraude"`. A
single-accent skin may point all twelve at its accent: tiles then distinguish
themselves by label alone, which can be exactly the statement intended.

**Signature.** `--ghosttag: "NAME"` paints an outline monogram behind the
greeting. `--caret-display: inline-block` turns on a beating block caret in
the ask bar. `--label-size`/`--label-track` tighten or loosen every apparatus
label; `--title-track` does the same for titles. All inert in the base.

## Both themes, or one on purpose

With `scheme: "auto"` your overrides must work on BOTH base palettes: define
what changes under `@media (prefers-color-scheme: dark)` as well, or accept
that your accent has to read on light and dark alike.

With `scheme: "light"` or `"dark"` you are handed one complete base and only
override what differs from it. That is the easier road, and the one to take
unless the skin genuinely has two looks.

## The hooks

```js
// skin.js — every field optional; absent means the shell's own behaviour.
// STRINGS ONLY: anything else is rejected and reported, by design.
export default function skin(api) {
  return {
    brand: 'Atelier',
    title: 'Atelier — Golem',
    placeholder: 'Ask the workshop…',
    busyLabel: 'Thinking',
    idleLabel: 'At rest',
    // The shell owns the clock, you own the words — it picks day or evening.
    greetingDay: 'Good morning.',
    greetingEvening: 'Good evening.',
    greetingAside: 'What needs doing?',
    // The rail's mark, inline SVG in currentColor, worn on an accent plate.
    crest: '<svg viewBox="0 0 100 100" fill="currentColor">…</svg>',
  }
}
```

Not yet in the contract, planned as explicit slots (do not fake them through
CSS): a `home()` replacement, a living `busyNode()`, and a `console()` status
band. A skin needing one of those today needs the contract extended first —
say so rather than working around it.

**There is no `routes` hook, deliberately.** A route is an app: it belongs to a
plugin, gated by config, so it exists whichever skin is on. A skin that could
add one would make a screen appear and disappear with the livery — and an app
enabled on a neutrally dressed instance would silently do nothing.

## Assets are served, not bundled

`skin.css` and `skin.js` are loaded with the shell. `assets/` is served,
because the browser asks for the favicon and the web-app manifest **before a
single line of the bundle runs** — anything needed pre-boot cannot come from a
client-side registry.

Ship only what you change: the shell falls back to its own asset for anything
a skin omits.

## Before you finish

1. `golem-skin.json` parses, and its id equals the folder name.
2. `skin.css` contains token declarations and nothing else — no selectors
   naming shell classes.
3. Every token you override exists in the shell's `tokens.css`; one that does
   not is dead weight that looks like it works.
4. `extensions.skin` in `golem.config.yaml` names your folder. Golem warns at
   startup when it names a skin that is not installed, but it will run under
   the default and say so only in the log.
