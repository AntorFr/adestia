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
  "styles": "./skin.css",
  "module": "./skin.js",
  "icon": "./assets/icon.svg",
  "manifest": "./assets/manifest.json"
}
```

`<id>` is the folder name; a manifest claiming another is refused.

## The rule that makes skins safe

**A skin declares TOKENS. It never writes a structural rule.**

```css
/* skin.css — this, and only this shape */
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

## Both themes, or one on purpose

The shell renders in the viewer's theme. Define your palette on `:root`,
redefine only what changes under `@media (prefers-color-scheme: dark)`, and
again under an explicit `[data-theme='dark']` so a manual toggle wins. A skin
that deliberately commits to one look may skip this — but must then set every
colour explicitly rather than inheriting half a palette.

## The hooks

```js
// skin.js — every field optional; absent means the shell's own behaviour
export default function skin(api) {
  return {
    brand: 'Atelier',
    title: 'Atelier — Golem',
    placeholder: 'Ask the workshop…',
    busyLabel: 'Thinking',
    busyNode: () => document.createElement('span'),
  }
}
```

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
