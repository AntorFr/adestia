#!/bin/sh
# A catalogue the app container can clone without any network: a small git
# repository with one skill, one agent and a root instruction, mounted at
# /catalogue-src. The scenario declares `file:///catalogue-src`.
set -eu

stage=$1
repo="$stage/catalogue-src"
mkdir -p "$repo/skills/tri-des-chutes"
cd "$repo"
git init -q -b main
cat >skills/tri-des-chutes/SKILL.md <<'MD'
---
name: tri-des-chutes
description: Sort offcuts by species and thickness before they reach the bin
---
Sort by species first, thickness second.
MD
cat >relecteur.agent.md <<'MD'
---
name: relecteur
description: Proofreads a page and says what is unclear
---
Read the page as a stranger would.
MD
printf '# Rules\nBe brief.\n' >CLAUDE.md
git add -- .
GIT_AUTHOR_NAME=bench GIT_AUTHOR_EMAIL=b@example.org GIT_COMMITTER_NAME=bench GIT_COMMITTER_EMAIL=b@example.org \
  git commit -q --no-gpg-sign -m init
chmod -R a+rX "$repo"
echo "$repo:/catalogue-src:ro"
