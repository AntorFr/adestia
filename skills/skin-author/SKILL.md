---
name: skin-author
description: Write a Adestia skin — the tokens and narrow hooks that dress one instance. Use when asked to change how Adestia looks, brand it, or create a theme.
---

# Writing a Adestia skin

A skin **dresses** an instance. Exactly one is active, chosen by a value in
`adestia.config.yaml` — unlike plugins, which are lists and combine.

That difference is why a skin is not a kind of plugin: every plugin axis is a
list, a skin's axis is a single value, and an exception like that empties a
rule of its meaning.

## The shape

```
skins/<id>/
  adestia-skin.json       REQUIRED
  skin.css              token overrides, and NOTHING else
  skin.js               narrow hooks (brand, crest, busy indicator, hero)
  web.manifest          what the instance INSTALLS as (name, colours)
  assets/icon.svg       favicon, and the icon a manifest offers at any size
  assets/icon-180.png   home-screen icon on iOS — opaque, square
  assets/icon-192.png   installed icon
  assets/icon-512.png   installed icon, and the maskable one
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
  "manifest": "./web.manifest"
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
hero — may carry real CSS; the shell knows nothing of them.)

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
:root[data-skin='amber'] .adestia-chat { grid-template-columns: 1fr 2fr; }
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

**The tile, without a rule against it.** A tile carries a colour MARK — a
3px bar across its top in the base sheet. `--tile-mark-inset` moves it (a
livery running it down the left edge sets `0 auto 0 0`), `--tile-mark-width`
/ `--tile-mark-height` size it (`auto` on one axis lets the inset stretch it),
`--tile-mark-tint` dims it as a % of the tile's colour — and the pointer
always brings it back to full, so a mark quiet at rest still answers a hover.
`--tile-label-font`/`--tile-label-track` set the name: a body whose identity
is a fixed pitch points the first at `var(--font-title)`.

**Named hues.** `--adestia-hue-rouge` … `--adestia-hue-ardoise` — what pages and
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
    title: 'Atelier — Adestia',
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

### The living slots

Three fields take a FUNCTION instead of a string — the sanctioned exceptions
for markup no token can describe:

```js
export default function skin() {
  return {
    // The HEAD of the landing canvas — the greeting, the mascot, the way in.
    // What sits under it (the brief, the app and section mosaics, their
    // counts, arranging them) stays the shell's whatever the livery is, and
    // what you want THOSE to look like is a token. `context.instance` carries
    // the driver and the active plugins, so a count needs no fetch.
    hero(host, context) {
      host.innerHTML = '<h1>…</h1>'
      host.querySelector('button')?.addEventListener('click', () => context.focusComposer())
      return () => {/* teardown, if anything must stop */}
    },
    // Replaces the three working dots in the live bubble. Mounted only while
    // a turn runs — "hurried" is this slot's only state.
    busy(host) { host.append(myMascot()) },
    // A status band above the canvas top bar. `context.instance` here too.
    console(host, context) { host.innerHTML = '…' },
  }
}
```

Each receives a host element the shell owns and a context (`ask`, `compose`,
`focusComposer`, plus `instance` for `hero` and `console`), and may return a
teardown.

**`hero` replaced a `home` slot that handed over the whole canvas**, and the
reason is worth knowing before you reach for something similar: the two
liveries that used it rebuilt a tile mosaic out of `/api/instance` — which
carries plugins and nothing else — so a skinned instance silently lost its
sections, its brief, the counts a plugin puts on its own tile (a skin cannot
reach those at all) and the arrange mode. Every improvement to the landing
was automatically absent from a livery. A livery is a look, not a navigation.
A slot that throws costs its own box, never the shell. Style your slot's
markup freely in `skin.css` under your OWN class names — the token rule
protects shell classes, not yours. Do not render a status the instance cannot
actually measure: a band asserting "all calm" without data is décor that
lies.

HOW you animate is entirely yours: CSS keyframes, canvas with
requestAnimationFrame, masked SVG, a fetch loop. Two rules make that freedom
safe — return a teardown for anything that must STOP (the shell empties the
host regardless, but it cannot cancel your animation frame for you), and
respect `prefers-reduced-motion` (a mascot that must not move is still a
mascot).

Two honest limits of today's contract, so you plan around them instead of
discovering them: `console` is mounted ONCE with the boot-time instance
summary — it may poll, but it is not notified when a turn starts or ends;
and `busy` exists only WHILE a turn runs, so there is no "idle but alive"
state in the thread. A skin needing either (a live HUD, a mascot that dozes
between answers) needs the context extended — ask, rather than working
around it.

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

## What the instance installs as

Adestia is an installable PWA, and the manifest it serves is the PRODUCT's with
your `web.manifest` merged over it. This is the one place a livery is worth
more than a look: two instances on two hosts otherwise land on a home screen
as two icons both called "Adestia".

```json
{
  "name": "Amber",
  "short_name": "Amber",
  "description": "The workshop's console.",
  "theme_color": "#0b0d12",
  "background_color": "#0b0d12"
}
```

An operator may overrule your name with `name:` in `adestia.config.yaml`, and
that is the intended order: you know what BODY the instance wears, they know
that this one is the workshop's and the other the kitchen's.

Those five fields, plus `lang`, `dir` and `categories`, are all a skin may set
— a NAME and a COLOUR. `start_url`, `scope`, `id` and `display` stay the
product's: a livery that could move the entry point would change what the app
IS, which is the same line `skin.css` may not cross. Anything else is dropped
and named in the startup log.

**`theme_color` is what the phone paints around your page** — its status bar,
and the splash it shows before the shell boots. Set it to the same
`--surface` your `skin.css` declares, or the app opens on a seam.

**Icons are a CONVENTION, not a declaration** — `icons` in your fragment is
refused. The manifest is served from the root while your files live under
`/skin/`, so a relative path there would resolve against the wrong folder,
silently, and be visibly wrong only once somebody has installed it. Ship the
names above instead; each one falls back to the product's own on its own.

Two things the rasters must be, both learned the hard way:

- **PNG, opaque, square.** iOS reads `apple-touch-icon` (the 180) and ignores
  the manifest's icons entirely: a vector is never offered to the home screen,
  and a transparent corner comes back BLACK. Paint your plate's colour edge to
  edge — the platform rounds the corners itself.
- **Drawn inside the central 80%.** The 512 is offered as `maskable`, which
  means a launcher may crop it to a circle. Art that touches the edge — the
  ears, the arms of a reticle — loses its tips there.

They are rendered from your `icon.svg` rather than drawn twice. Any rasteriser
does; with a browser already on the machine:

```sh
# an HTML page whose background is your plate colour, screenshotted at size
chrome --headless --screenshot=icon-512.png --window-size=512,512 page.html
```

## Before you finish

1. `adestia-skin.json` parses, and its id equals the folder name.
2. `skin.css` contains token declarations and nothing else — no selectors
   naming shell classes.
3. Every token you override exists in the shell's `tokens.css`; one that does
   not is dead weight that looks like it works.
4. `extensions.skin` in `adestia.config.yaml` names your folder. Adestia warns at
   startup when it names a skin that is not installed, but it will run under
   the default and say so only in the log.
5. If you ship a `web.manifest`, the startup log names no ignored field, and
   `theme_color` matches the `--surface` your `skin.css` declares.
