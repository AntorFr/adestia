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
done: false
due: 2026-09-01
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
| `pri` | number, lower is more urgent |
| `dom` | domain — groups the "everything" view (`atelier`, `maison`, `admin`…) |
| `projet` | id of a project page: this task is one of its steps |
| `sub` | ids of child tasks |

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
