# Working on Adestia

Conventions for anyone — person or agent — writing code in this repository.
`DESIGN.md` records why the product is shaped the way it is; this file records
how work gets done to it.

## Code and commands

npm workspaces: `packages/content` owns the markdown grammar; `packages/drivers`
owns the engine contract and adapters; `packages/schemas` owns extension and wire
contracts; `packages/server` owns boot, HTTP and turns; `packages/web` owns the
React shell, editor and runtime plugin loader. `ARCHITECTURE.md` is the module
map; `docs/parcours.md` and `docs/ecrans.md` describe the built journeys and screens.
Current defects and unfinished work live in `.agent/status.md`; release history
lives in `CHANGELOG.md`, design reasons in `DESIGN.md`.

After `npm ci`, from the repository root:

```sh
npm test             # vitest run, then node --test for plugins; allow 7+ minutes
npm run typecheck    # workspace tsc builds, then web --noEmit
npm run lint         # eslint packages plugins; also in CI
npm run build        # server/dependencies, then the web shell and its vendor/SW files
```

The catalogue browser suite builds a missing shell when Playwright is available.
Without Playwright it explicitly skips; a green run then does not prove those
screens. It only builds a *missing* shell: after changing
`packages/web`, run `npm run build` first, or a stale shell fails those tests. For Vite hot reload, use `npm run dev --workspace @antorfr/adestia-web`
with the server running on port 8730. For a seeded instance, use the launcher below.

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
ls node_modules/micromark-extension-directive || npm ci
```

`npm ci`, never `npm install`: an install resolves the git dependency afresh
and has replaced the fork with the registry's package without a word — the
same symptom, a `\:::` in a content test, from the opposite cause.

The same shared `node_modules` hides a second trap: its `@antorfr/*` links
point at the PRIMARY checkout, so a resolver that follows them reads another
branch's packages. None of the three resolvers here does any more — the
typecheck (`tsconfig.base.json`), the tests (`vitest.config.ts`) and the web
build (`packages/web/vite.config.ts`) each map every workspace package to the
sources beside it. Anything else that resolves `@antorfr/*` from a worktree
(a script run by hand, a new tool) reads `main` unless it is told the same.

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
go idle; the container has no bold font; the engine is faked unless
`BENCH_REAL_ENGINE=1`, and `bench/live-codex.sh` boots a real one).

Nothing installs on the machine: the browser lives in its own image. When
Docker is NOT available, say so in the report rather than passing green off as
seen — "the suite is green" and "I looked at it" are different claims.

**Without Docker** (a pod, a plain host), the same instance runs on the host after
`npm run build`:

```sh
node bench/launch.mjs --engine fake                          # scripted engine, deterministic
CLAUDE_CODE_OAUTH_TOKEN=… node bench/launch.mjs --engine claude   # the plain binary, a real turn
```

Each prints `listening on <url>` and runs until SIGTERM, which removes its
throwaway data. `--engine claude` refuses to start without the token. Flags
(`--skin`, `--locale`, `--seed`, `--port`, `--data`) and the format of a seed are
in `bench/README.md`. This is how you LOOK at a change without Docker; say which
you used.

To see EVERY screen — light and dark, desk and phone — in one go:

```sh
node bench/sweep.mjs [--skin <id>] [--only E-4,E-9]   # 124 PNGs (31 screens x 2 themes x desk/phone) in bench/shots-sweep/<skin>/
```

It needs the build and Playwright from the environment (`npm root -g`), nothing
else; it exits non-zero naming each screen whose proof selector is missing or that
shows a loading or error screen. Pictures are for LOOKING at: open the few that
your change touches.

## A handshake waits for a SIGNAL, never for a number of turns

Two tests waited for a turn to be running by spinning the event loop — one a
bare `setImmediate`, one a two-hundred-iteration loop — and both were green on
every machine that was not busy. A GitHub runner is always busy: one of them
took `main` red, on an assertion (`expect(channel.busy(…)).toBe(true)`) that
names the queue and says nothing about the wait that had actually run out.

The signal exists in every case here, because the fake driver belongs to the
test. The desk registers a chain synchronously inside `admit`, BEFORE it pulls
the driver, so a driver that resolves a promise on its first `runTurn` says
"the chain is at the counter" and cannot say it too early:

```ts
let pulled!: () => void
const running = new Promise<void>((resolve) => { pulled = resolve })
const driver = { async *runTurn() { pulled(); await held; /* … */ } }

const first = channel.run(caller, threadId, 'lent')
await running // never `await new Promise(setImmediate)`
expect(channel.busy(caller, threadId)).toBe(true)
```

Counting turns is a race dressed as a delay, and it fails where it is hardest
to read: on someone else's machine, in a run nobody can reproduce.

## Committing

- **Stage by explicit path, and commit by explicit path.** `git add -- <paths>`
  then `git commit -m … -- <paths>`. Never `git add -A`, never a bare
  `git commit`. Worktrees make a shared index much less likely; explicit paths
  are what make it not matter.
- **Run `git status` before the first write** of a session, and re-read
  `git show --stat` after committing. Never commit what you did not write.
- Commit messages are in English, in the imperative, and say **why** — the
  what is already in the diff.
