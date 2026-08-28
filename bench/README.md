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
- **A permanent stream loops.** `/api/turn/attach` is answered once and then
  `204`, because the shell re-attaches after every turn it finishes.
