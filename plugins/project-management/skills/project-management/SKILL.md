---
name: project-management
description: How to write a project planning on a page — the :::timeline block, written phases or the consolidated planning of the pages below. Use when asked to phase, plan or schedule a chantier.
---

# Project management

See `page-author` for everything blocks share — `id`, `w`, `from=`, how a
page is laid out. This skill only covers what this plugin adds: `:::timeline`.

If a page ever needs to address this plugin's rendering explicitly, the value
`from=` takes is `project-management`.

## Where a worksite lives, and what opens it

Two declarations, and they do different jobs.

**The ROOT says it belongs here**, in the frontmatter of its own index page:

```yaml
app: project-management
```

Top level only — the first folder under the memory root — and **hereditary**:
everything beneath belongs to this plugin without redeclaring. That is what
makes this plugin's blocks resolve on those pages without writing `from=` on
each one. Written deeper, or naming a plugin the instance does not run, it is
reported on screen and never obeyed.

**A worksite's own page is typed:**

```yaml
type: project-management
```

The plugin claims exactly ONE type, and its id rather than a word like
`projet` — a generic word declared in a manifest is a word taken away from
everybody on the instance.

Its only job today is to decide what a folder opens on, by a COUNT of the
pages filed directly in it:

| pages of this type, directly in the folder | what opens |
|---|---|
| none | the ordinary shelf, in cards |
| exactly one | **that page** — the folder IS that worksite |
| more than one | the shelf: a folder OF worksites is not a worksite |

Nothing else follows from the type: the page is drawn by the ordinary reader
with the ordinary blocks. There is no plugin layout, and a worksite page is a
page like any other.

## `:::timeline` — phases and milestones on a time axis

One rendering, TWO provenances. `depth` chooses which:

| `depth` | Where the bars come from |
|---|---|
| `self` (default) | the lines written in the block |
| `children` · `subtree` | the `start:`/`due:` of the pages below — nothing to retype |

### Written — `depth=self`

The body is a list, one line per entry, and the line IS the data:

```markdown
:::timeline
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

⚠️ **A written timeline with no lines draws nothing** — it shows the grammar
instead. Either write the lines, or use the consolidated form below; an empty
`depth=self` block is a placeholder somebody forgot.

### Consolidated — `depth=children` or `depth=subtree`

```markdown
:::timeline{depth=subtree}
:::
```

No body: the bars are the pages below, and each one OPENS the page it stands
for. Write dates in the pages themselves, in their frontmatter:

```yaml
start: 2026-07-01   # not before — never "I have begun"
due: 2026-08-15
```

Both are `todo`'s own words, at their own meaning. The rules are the ones
above, unchanged: `due:` alone is a milestone, `start:` with it a phase, and
a page carrying neither simply does not appear.

- **`children` counts a sub-folder once**, by its index page — a worksite is
  its folder, not the pages filed inside it. `subtree` reaches all the way
  down. Same walk as `:::list{source=children}`, so a planning and a list of
  sub-worksites never disagree about what "below" means.
- **A page the workflow calls finished is drawn done**, hatched, whatever its
  dates say. Never add a percentage or a "progress" field to keep in step —
  `status:` is what colours the planning, and there is only one table.
- A page whose dates cannot be read (a `start:` after its `due:`, a `due:`
  that is not an ISO date) is named under the chart, never guessed at.

`source` exists for the day a planning reads something other than the pages
below; today `children` is its only value, and its default — so do not write
it. **Never write a default**: `:::timeline` alone is the written form, and
`scale` only earns its place when the months are wrong for the span. An
attribute written at its default reads as a decision to the next person, who
then wonders what it was for.

A timeline usually wants the full reading line: leave `w` alone.

## What does NOT exist yet

`pm-config` — the file that will declare which page types are worksites — is
not built. Until it is, the consolidated planning shows **every** page below
that carries dates. If something you did not mean shows up, narrow `depth`
rather than removing the dates.
