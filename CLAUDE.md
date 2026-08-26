# Working on Golem

Conventions for anyone — person or agent — writing code in this repository.
`DESIGN.md` records why the product is shaped the way it is; this file records
how work gets done to it.

## Every change starts in its own worktree

Development happens in an **isolated git worktree**, never straight in the
primary checkout sitting on `main`.

This repository has the scar that explains the rule. Two agent sessions worked
here at the same time, and one of them committed the other's staged files:
a git *index* belongs to the checkout, not to the session, so `git add -- <paths>`
followed by a `git commit` with no paths swept up work nobody had reviewed and
turned `main` red. A worktree gives each line of work its own index, its own
HEAD and its own files, which makes that class of accident impossible rather
than merely unlikely.

```sh
git worktree add .claude/worktrees/<subject> -b <subject>
```

`.claude/worktrees/` is where the harness puts them and is ignored by git.
Anywhere outside the primary checkout works just as well — the isolation is
the point, not the path.

The primary checkout stays on `main` and stays clean. Treat it as the place
you merge into and release from, not the place you type in.

## A branch is scaffolding, not an address

When the work is done it comes home. Do not leave a finished change living on
a side branch, and do not release from one.

In this order:

1. **Green first.** `npm test`, `npm run typecheck`, `npm run build` — in the
   worktree, before anything moves. A red test that correctly pins the old
   contract is a decision to make, not a line to skip; this repo has pushed
   red twice by treating it as noise.
2. **Merge into `main`.** From the primary checkout.
3. **Delete the branch and remove the worktree.** `git worktree remove` then
   `git branch -d`. A branch that survives its merge is a second answer to
   "where does this code live", and the wrong one wins eventually.
4. **Then version, tag, release.** Only once the commit is an ancestor of
   `main`. A tag cut on a side branch names a commit `main` does not contain:
   the image builds, it deploys, and no one can find the source it came from.

The order is the whole instruction. Tagging before the merge is the mistake
this section exists to prevent — it is invisible until the day somebody tries
to reproduce a running image.

## Committing

- **Stage by explicit path, and commit by explicit path.** `git add -- <paths>`
  then `git commit -m … -- <paths>`. Never `git add -A`, never a bare
  `git commit`. Worktrees make a shared index much less likely; explicit paths
  are what make it not matter.
- **Run `git status` before the first write** of a session, and re-read
  `git show --stat` after committing. Never commit what you did not write.
- Commit messages are in English, in the imperative, and say **why** — the
  what is already in the diff.
