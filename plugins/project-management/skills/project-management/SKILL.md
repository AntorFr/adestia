---
name: project-management
description: How to write a project planning on a page — the :::timeline block, its phase and milestone lines. Use when asked to phase, plan or schedule a chantier.
---

# Project management

See `page-author` for everything blocks share — `id`, `w`, `from=`, how a
page is laid out. This skill only covers what this plugin adds: `:::timeline`.

If a page ever needs to address this plugin's rendering explicitly, the value
`from=` takes is `project-management`.

## `:::timeline` — phases and milestones on a time axis

The body is a list, one line per entry, and the line IS the data:

```markdown
:::timeline{scale=months}
- Cadrage: 2026-01-15 → 2026-03-01
- Réalisation: 2026-03-01 → 2026-09-30
- Recette: 2026-06-01
:::
```

**A line with two dates is a phase; a line with one date is a milestone.**
There is no separate milestones block and no third notation: a milestone is a
phase without a beginning. Dates are ISO (`2026-03-01`), the arrow may be `→`
or `->`, and the first `:` separates the label from the dates — the same cut
`:::figures` makes.

The block derives the rest by itself — do not write it:

- the axis spans whole units of `scale` (`weeks` · `months` · `quarters`,
  default `months`) around your dates;
- the today line and the current phase come from the calendar, free — never
  add a "progress" or "percent" note to a line, there is nowhere for it to go;
- a line the block cannot read (a missing date, a reversed range) is listed
  under the chart exactly as written, never guessed at. If you see your line
  there, fix the date, not the label.

⚠️ **Never leave the block empty.** `:::timeline` holds content, and the
validator refuses a page carrying an empty one — write at least one line
when you insert it. A block whose lines carry no readable date is fine: it
shows the grammar and the lines, and the page stays editable.

A timeline usually wants the full reading line: leave `w` alone.

## What does NOT exist yet

The consolidated planning — one bar per sub-page, read from `start:`/`due:`
in their headers — is designed but not built, and `:::timeline` takes no
`depth` attribute yet. Do not write one: the validator flags it as unknown
and the block ignores it. Until then, a planning is written where it is
read, in the block.
