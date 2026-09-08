---
name: todo
description: How tasks and lists are written in this instance. Use when asked to add, close, organise or list tasks.
---

# Tasks

See `page-author` for what `title`/`type`/`ico` mean everywhere in this
instance — this skill only covers what a task and a list add on top.

A task is a PAGE. There is no task database — which is why you can create,
edit and close one with your ordinary file tools, and why a person editing the
same file in the page editor needs nothing to synchronise.

```markdown
---
type: tache
title: Poncer la porte du garage
due: 2026-09-01
start: 2026-08-28
assignee: antoine
files: [domaines/admin/assurance/devis.pdf]
pri: 2
dom: atelier
projet: rangement-garage
---

Grain 120 puis 240. Vérifier les gonds avant de reposer.
```

| Field | Meaning |
|---|---|
| `type` | **`tache`** — this is what makes the page a task |
| `done` | **the closing date** (`done: 2026-08-24`). Absent means open. A checkbox in the interface writes or removes exactly this line. A legacy `done: true` still reads as closed |
| `due` | ISO date. Drives Late / Today / Next 7 days, all computed live |
| `start` | ISO date — **not before**. See below; it is not "I have begun" |
| `assignee` | who carries it, ONE handle. Absent means up for grabs |
| `files` | documents this task cites, as logical paths. Never copies |
| `pri` | number, lower is more urgent |
| `dom` | domain — groups the "everything" view (`atelier`, `maison`, `admin`…) |
| `projet` | id of a project page: this task is one of its steps |
| `sub` | ids of child tasks |

## `start:` means PAS AVANT — never "I have begun"

This is the one word in this contract that other tools spell the same way and
mean the opposite by, so it is written down rather than assumed. iCalendar's
`DTSTART` and Microsoft's `startDateTime` mean what this one means: the date
the task becomes doable. **Taskwarrior's `start` means the task is being worked
on right now.** If somebody ever wants to record that, it will be a different
word.

What it DOES is the point of having it. A task whose `start` is in the future
leaves every live view — Late, Today, Next 7 days, Everything open — and waits
in "Later". Planning something for November must not add to the noise of today,
and it comes back on its own the morning it becomes doable. Lateness stays
`due:`'s business: a deferred task is never late.

Use it for anything that cannot begin yet: a form that opens in April, a call
to make once the parts arrive, a seasonal chore.

## `assignee:` — one handle, and absence is a state

One person, never a list. A task with two owners has none, and that is the
failure this field exists to end; if the work is genuinely shared, write two
tasks or give it sub-tasks.

The value is a short lowercase handle (`antoine`, `celine`) and there is **no
roster page to maintain**: the interface discovers the handles the base already
uses, exactly as it does with domains, and derives a stable colour from each.
So use the spelling already in use — a second capitalisation makes a second
person.

**Absent means UP FOR GRABS**, which is a state worth seeing rather than a
blank. It is the state a shared circle produces constantly: a task everybody
can see and nobody has taken. Do not assign one to somebody to tidy the screen.

## `files:` — documents are CITED, never copied

A task's documents are links to files that live wherever they live:

```yaml
files: [domaines/admin/assurance/devis.pdf, domaines/diy/assets/avant.jpg]
```

Logical paths — the ones memory spells, composed across stores — so one file
serves as many tasks as point at it and moving it is one edit, not a hunt for
duplicates. **Do not copy a document into a task's folder**, and do not give a
task a folder of its own: tasks share theirs, so a file dropped beside one
would show up as every neighbour's attachment. That is exactly why this list
exists instead of the positional convention `page-author` describes.

**Closing a task means writing `done: <today's date>`.** Do not delete it and do not
move it: its history is the file, and a list that references it would lose the
row rather than show it closed.

## Lists

Two kinds, and the difference is the whole design.

**Curated** — a page holding references. This is judgement: what you decided
belongs together.

```markdown
---
type: liste
title: Aujourd'hui
ico: 📌
refs: [taches/poncer-porte, taches/appeler-plombier]
---
```

**Dynamic** — not written at all. Late, Today, Next 7 days and Everything-open
are queries over the fields above; they are always current and cannot drift.
Never create a page to hold one of them.

A task appears in as many lists as reference it, and there is still only one
task: closing it closes it everywhere. That is the point of references — never
copy a task into a list.

## A page can carry its own tasks — `:::checklist`

Any page can show the tasks that belong to it, and tick them where they are
read:

```markdown
:::checklist
:::
```

With no attribute it shows the tasks of **this page's folder and everything
under it** — plus any task pointing back at this page with `projet:`, which is
how the ones captured in a hurry are caught: quick capture files into a single
folder, so a task added from the app is never under the worksite's folder.

| Attribute | What it says |
|---|---|
| `page` | start from ANOTHER page's folder — a logical path, relative or absolute |
| `depth` | `self` · `children` · `subtree` (the default) |
| `view` | `open` (the default) · `late` · `today` · `later` · `all` |
| `assignee`, `dom`, `projet` | the same filters the app offers, with the same words |

`w` works here like on any block — `:::checklist{w="1/2"}` puts two lists side
by side — and is not listed above because no block declares it. See
`page-author`.

There is only ever one task, so ticking a box here writes the same file the app
writes: **never copy a task into a page.** The block also captures — a line at
its foot files a new task into that folder — which is why it is a block of its
own rather than a plain list: what separates two renderings is what you can DO
in them.

It is this plugin's block, so a page carrying one opens read-only, with a
diagnostic, on an instance where the todo app is switched off. That is the
right answer: a checkbox that writes into another file has nothing honest to
draw without the plugin that owns the tasks.

## Where new tasks are filed

The interface has a quick-capture form: a title, optionally a due date and a
domain, and the page is written — the shortest task the contract allows, with
no `done` line. Everything else it may carry is added afterwards, in the page
editor or by you.

It files into ONE folder, named after the instance's language: `taches` in
French, `todo` otherwise. Override it for the whole instance with a page:

```markdown
---
type: todo-config
title: Réglages todo
folder: perso/taches
me: antoine
---
```

`me` says which handle is the person using THIS instance, so the interface can
offer a "mine" filter. Two mountings exist and they answer differently: one
instance per person sharing a folder cannot tell who it is, so this key is the
only answer; one instance with real accounts already knows, per visitor, and
needs no key at all. **Where both exist, this key wins.** Where neither does,
the filter is simply not offered — a wrong "mine" hides other people's work
behind your name.

It is read from the DEFAULT store only. A settings page written in a shared
circle would otherwise tell every instance mounting it that it is the same
person.

`folder` decides where NEW tasks are written and nothing else — a task is
found by its `type:` wherever it sits, so an existing base scattered over
several folders keeps working and moving a task breaks nothing. Only one such
page is read; a second one is redundancy waiting to disagree.

One consequence worth knowing before you rename it. The manifest declares
`absorbs: ["todo", "taches"]` — the two default names — so the launcher knows
the Todo tile already stands for that folder and does not offer it a second
time as a section. A manifest is static data and cannot read a config page, so
**a `folder` renamed to anything else reappears on the home screen beside the
tile**: the same thing said twice, one of the two always the wrong click.
Nothing breaks, and it is not worth avoiding a name over — just expect it.
