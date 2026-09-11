# The graphical bench

What a browser tells you and a unit test cannot: where a thing SITS, whether
it survives the dark, whether a new strip eats the panel below it. Two defects
of the tab strip were found here and by no other means — `CLAUDE.md` asks for
a run whenever a change touches what the shell draws, and Docker is available.

```sh
bench/run.sh                                   # the worked example
bench/run.sh bench/scenarios/my-change.mjs     # yours
```

It builds the image from an explicit path, boots it with a throwaway data
directory, drives headless Chromium in a container against it, and removes
everything it made. Screenshots land in `bench/shots/` (git-ignored).

## What is real and what is not

Everything is the real product — the image, the server, the shell, its
reducer, its components — except the **engine**. The image ships no agent CLI
on purpose (an operator adds one), so a turn cannot really run. A proxy in
front of the app answers the turn endpoints with an SSE stream the scenario
paces by hand: exactly the events the server would have relayed. A scenario
must therefore never be trusted about what the DRIVER does; it is trustworthy
about everything the browser does with what a driver sends.

**Unless you ask for the real engine.** `BENCH_REAL_ENGINE=1` stops the proxy
from answering `/api/turn/attach` and lets it through, so the turn runs on
whatever engine the server actually has; `emit` and `endTurn` then refuse
rather than quietly doing nothing, and `bench.real` tells a scenario which
world it is in. What that needs — a real CLI, a real credential — is what the
image deliberately lacks, so the server is booted on the HOST instead and only
the browser stays in its container:

```sh
bench/live-codex.sh [scenario] [out]   # the codex driver, watched in a browser
bench/live-codex-api.sh                # the same instance, driven through the API
```

Both build a throwaway instance in a temp directory and copy the credential
into it, 0600, reading the spike's own home and never writing back to it. The
first removes everything on the way out; the second deliberately KEEPS its
directory so the log survives the run, which also leaves that copy of the
credential on disk — `WORK=… bench/live-codex-api.sh` if you want to know
where. Use the first to look at a turn, the second when the question is "what
did the driver do?" rather than "what does it look like?". A change to a driver
is not looked at until somebody has watched a real turn arrive.

State the store owns — a finished turn, a thread as it comes back after a
reload — is seeded by writing the conversation JSONL into the mounted data
directory, which is the same thing the server would have written.

## The traps, each paid for once

- **`waitUntil: 'networkidle'` never resolves.** An attached turn holds its SSE
  connection open for the whole turn. Wait for a selector instead.
- **`docker build .` from the primary checkout builds `main`.** Worktrees are
  where changes live; build by explicit path (`run.sh` does).
- **No bold, no italic, in the screenshots?** The container has no font with
  those faces. Check `getComputedStyle` before believing your eyes: a
  `<strong>` at `font-weight: 700` is correct and will look right on a Mac.
- **`/api/models` and `/api/home/brief` answer 404.** Both are correct here:
  no CLI means no model catalogue, and no mounted plugins means no brief. The
  proxy prints every upstream 4xx/5xx by name so a REAL missing asset cannot
  hide behind the browser's "Failed to load resource".
- **`fullPage: true` photographs the fold and nothing below it.** The shell's
  canvas scrolls inside ITSELF, so the document is never taller than the
  viewport and playwright has nothing extra to capture. Open a tall viewport
  (`bench.open({ height: 2400 })`) when the point of the shot is what sits
  below the fold.
- **A permanent stream loops.** `/api/turn/attach` is answered once and then
  `204`, because the shell re-attaches after every turn it finishes.
