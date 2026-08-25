---
name: schedule-author
description: How to write a scheduled turn — a note in this instance's `planif/` folder whose body runs on its own, on a timer, with nobody reading. Use when asked to schedule, automate, repeat or stop a recurring agent turn.
---

# Scheduling a turn

A scheduled turn is a markdown note in the workspace's `planif/` folder (the
name is configurable per instance; ask if unsure). It is found by **location**,
not by a `type:` field — see `page-author` for why that is one of three
legitimate ways an app addresses its own pages.

```markdown
---
title: Relire les brouillons
every: 1d
enabled: true
---

Relis les pages sous `brouillons/` modifiées dans les dernières 24h et signale
celles qui contiennent une question en suspens.
```

**The body IS the prompt, verbatim.** Not a description of what should
happen — the literal text the agent receives when the note is due. Write it
the way you would write a message, because that is exactly what it becomes,
arriving with nobody there to answer follow-up questions or confirm anything.
Write it assuming that.

## The fields

| Field | Meaning |
|---|---|
| `title` | shown in the planif view; falls back to the file name |
| `every` | `30m`, `2h`, `1d` — amount plus one unit letter, nothing fancier. **Not cron.** A cadence nobody can read at a glance is a scheduled turn nobody can predict, and this instance never runs one finer than 15 minutes: that floor is enforced, not rounded — `every: 5m` is refused rather than silently coarsened to 15 |
| `enabled` | any value but the literal string `false` counts as enabled. Omit it to mean "on" |
| `until` | a day, `2026-08-29` — makes the note a **mission** (see below). Live through that whole day; past it, one final turn runs and the note is stamped `expired` |
| `done` | a day, `2026-08-25` — the mission is accomplished, the note never runs again. Absence means open. Ticked by YOU, from a scheduled turn, and it is the ONE edit the gate lets that turn make |
| `expired` | a day — the deadline fired. Written by the product only; never write it yourself |

A note with no `every`, an `every` the parser cannot read, or an empty body
does not fail loudly — it is reported as unable to run (missing `every`, or
"the note is empty — its body is the prompt") and simply never fires. Fix the
field and it resumes on its own.

## What "due" actually means

- **A brand-new note does not fire the moment it is saved.** Only a note that
  has already run once starts counting down from `every` — otherwise every
  `every: 1d` note would go off the instant someone finished writing it.
- **A missed occurrence is lost, never replayed**, past a short grace window.
  An instance that was down overnight wakes up and waits for the next
  scheduled time; it does not fire everything it missed. "Every day" describes
  a rhythm, not a queue.
- **Only one scheduled turn runs at a time** — they share the same
  subscription as every chat turn in this instance.

## Missions — a recurrence that must end

Add `until:` and the note becomes a **mission**: a watch that concludes.
"Poll my inbox until the hotel confirms, or escalate by Friday" is one:

```markdown
---
title: Resa hôtel — attendre la confirmation
every: 2h
until: 2026-08-29
---

Regarde ma boîte mail (expéditeur *lesflots.fr*).

- Confirmation arrivée → passe l'événement du 29-31/08 à « confirmé » dans
  l'agenda, puis termine la mission.
- Rien après 2 jours et aucune relance déjà envoyée (vois ton journal) →
  envoie UNE relance polie.
- À l'échéance, si toujours rien → crée une tâche todo « Relancer l'hôtel
  par téléphone ».
```

The invariant sold to whoever writes one: **a mission always terminates** —
either `done`, or `expired` with the escalation its body asked for. There is
no immortal watch.

How a running mission works, from inside one of its turns:

- **Your memory between runs is a log file**, named in the turn's frame
  (`memory/missions/<id>.md`). Read it first; append a dated entry saying
  what you did or found. Without it, every run believes it is the first —
  and "send ONE reminder" becomes a reminder every run.
- **To finish the mission**, edit the note's frontmatter and add
  `done: YYYY-MM-DD` (today). That exact change is the only edit to a planif
  file an unattended turn is allowed to make — the write gate replays your
  edit and refuses anything else, body above all. Do not try to edit the
  body, other fields, or other notes from a scheduled turn: it will be
  refused, and the mission simply continues.
- **The deadline is the product's job, not yours.** Past `until`, the note is
  stamped `expired` and one final turn runs with a distinct frame; that turn
  applies whatever the body says about the deadline case — typically creating
  a follow-up action — and closes the log.

When asked to set up a watch like this in chat, write the note yourself
(computing `until` as an absolute day), and put the retry/escalation policy
IN the body — the body is the only place the running mission can read it
from.

## Why the UI never edits these directly

`planif`'s view is read-only on purpose: its buttons ask the agent to change a
note rather than writing the frontmatter themselves. A scheduled note's body
is executed as a prompt, which makes it a security boundary, not ordinary
content — see DESIGN.md's instructions/workspace model for the risk zoning
this implies. Creating, editing or disabling a scheduled turn is something
**you** do, on request, exactly like editing any other file.

## Permissions, unattended

Nobody is present to approve anything a scheduled turn's tools ask for. Every
permission it raises is decided by this instance's unattended policy — which
defaults to deny — never by a prompt waiting for a click that will not come.
Write scheduled prompts assuming the strictest plausible policy, not the one
configured today.
