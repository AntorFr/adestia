# Working on Adestia

Conventions for anyone — person or agent — writing code in this repository.
`DESIGN.md` records why the product is shaped the way it is; this file records
how work gets done to it.

## A fresh worktree needs its install checked, not assumed

The grammar comes from a git dependency — a fork of
`micromark-extension-directive`, pinned by commit — and a first `npm install`
in a new worktree has twice announced "added 525 packages" while leaving that
one out.

The symptom does not look like a missing package. A content test fails on
`\:::`, colons escaped, because the grammar that parses `:::` is absent and a
grammar that does not know a construct neutralises it. It reads exactly like a
serialiser bug, and it is not one. So before believing a red in
`packages/content`:

```sh
ls node_modules/micromark-extension-directive || npm install
```

## If it draws something, look at it

A change to the interface is not finished because the tests pass. Tests render
components; they do not say where a thing SITS, whether it survives the dark,
or whether a new strip eats the panel below it. This repository has shipped a
tab strip that turned the thread into three empty columns and a title that
truncated to "Plan d…", both green, both obvious in one screenshot.

**So when Docker is available and the change touches the shell, run the bench
before merging:**

```sh
bench/run.sh bench/scenarios/<your-change>.mjs
```

It builds the image by explicit path, boots it with a throwaway data
directory, drives headless Chromium against it in a container, and removes
everything it made. Write a scenario per change — a dozen lines: seed the
thread, script the events the server would have sent, take a picture at each
state worth a look. `bench/scenarios/turn-parts.mjs` is the worked example,
and `bench/README.md` holds the traps (an attached turn never lets the network
go idle; the container has no bold font; the engine is the one thing faked).

Nothing installs on the machine: the browser lives in its own image. When
Docker is NOT available, say so in the report rather than passing green off as
seen — "the suite is green" and "I looked at it" are different claims.

## Committing

- **Stage by explicit path, and commit by explicit path.** `git add -- <paths>`
  then `git commit -m … -- <paths>`. Never `git add -A`, never a bare
  `git commit`. Worktrees make a shared index much less likely; explicit paths
  are what make it not matter.
- **Run `git status` before the first write** of a session, and re-read
  `git show --stat` after committing. Never commit what you did not write.
- Commit messages are in English, in the imperative, and say **why** — the
  what is already in the diff.
