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
