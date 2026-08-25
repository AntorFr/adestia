---
name: journal
description: How this instance's journals are stored — a folder is a journal, one markdown file per entry. Use when asked to write, read, correct or create a journal entry, a logbook, a carnet, a diary or a running log. Read `page-author` first; this builds on it.
---

# Journals

A journal is a **folder**. An entry is **one page inside it**. There is no file
that holds a history, and that is the whole design decision — everything below
follows from it.

```
journal/atelier/
  INDEX.md              type: journal   ← the cover
  2026-08-25-1430.md    type: entree
  2026-08-25-0910.md    type: entree
  2026-08-24.md         type: entree
```

## Why one file per entry, and never one file per journal

Worth knowing before you are tempted to "tidy" a journal into a single
document, because each of these breaks if you do:

- **You write entries with your own file tools.** A new file cannot damage the
  history. Rewriting a file that holds two hundred entries can, and will, the
  first time a write is interrupted.
- **Two hands write here.** The page API saves whole files under an optimistic
  revision. One file per journal means your appended entry collides with
  whatever the person is editing at that moment — every time. Per entry, a
  conflict touches only the entry actually disputed.
- **The app edits one entry at a time.** An entry IS a page, so it gets the
  page editor, its own revision and its own diagnostics. A history in one file
  would have neither.
- **`GET /api/pages/index` publishes frontmatter per page.** An entry's `date`
  is queryable by every other app. Entries buried in one file are invisible.

## The cover

The folder's index page, carrying `type: journal`:

```markdown
---
title: Carnet d'atelier
type: journal
ico: 🪚
---

Ce qui se passe à l'établi, au fil des séances.
```

`INDEX.md` inside the folder, a page named after its folder
(`atelier/atelier.md`), or the page beside it (`journal/atelier.md`) — all
three spellings resolve to the same journal, because the workspace already
uses all three for "this page is that folder's overview". `title` and `ico`
dress the card; a `description` line is shown under the journal's heading.

The cover follows the usual `status` rules from `page-author`: a journal whose
status means it is over folds into the app's archive rather than disappearing.

## An entry

```markdown
---
type: entree
date: 2026-08-25T14:30
title: Réglage du guide de refente
---

Le guide dérivait de 0.3 mm sur la longueur. Retouché avec la cale de 123.
```

| Field | Rule |
|---|---|
| `type` | `entree`, exactly. This is what makes the page an entry. |
| `date` | `2026-08-25` or `2026-08-25T14:30`. Sorted on, newest first. |
| `title` | **Optional, and usually absent.** An entry is a moment, not a document; write one only when the entry really has a subject. |

**Name the file after its moment**: `2026-08-25-1430.md`, or `2026-08-24.md`
for a whole-day entry. A folder listing is then already a chronology — in git,
in an editor, in your own file tools — and the app can order a page whose
`date:` somebody forgot. Two entries in the same minute take a `-2` suffix.

The body is an ordinary page body: markdown plus the closed block vocabulary
from `page-author`. Photos go in the folder (or its `assets/`) and are
referenced relatively, exactly like any other page's attachments.

## Adding an entry when asked

Someone saying *"note dans le carnet d'atelier que le guide dérivait"* is
asking for a new file, not an edit:

1. find the journal's folder (its cover carries `type: journal`);
2. write `<folder>/<YYYY-MM-DD-HHMM>.md` with the frontmatter above;
3. keep the body to what was actually said — a journal entry that has been
   expanded into a report is no longer a record of anything.

**Never rewrite an old entry to add a new one.** If an existing entry is
wrong, correct that entry; if something happened later, that is a new entry.
The history is the point.

## Deleting

A browser cannot delete a page, so removing an entry is your job, and it
should be rare: an entry somebody regrets is still what happened. Correct it
in place, or add the entry that says so.

## `entree` is a shared word

`type` is a flat namespace. The app reads `entree` pages **only inside a
journal folder**, so a page typed `entree` somewhere else is left alone — but
if you are writing another app that wants that word, declare it in your
manifest and expect the boot-time collision line.
