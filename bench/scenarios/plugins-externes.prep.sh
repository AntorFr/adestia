#!/bin/sh
# A plugin that is NOT in the image, fetched from a repository at boot.
#
# Two sources, because the two states worth photographing are opposite ones:
#
#   - a real git repository whose ROOT is the plugin — the usual shape, one
#     plugin, one repo — cloned over `file://`, which is a transport like any
#     other to git and needs no network here. Its folder is named after the
#     REPOSITORY (`adestia-plugin-clock`) while the plugin's id is `clock`,
#     which is exactly the case the folder-name rule had to bend for: the tile
#     appearing on the home is the proof the manifest named itself, the server
#     served the module out of the clone, and the browser imported it.
#   - an address that leads nowhere, so the refusal band is photographed too.
#     A first fetch has nothing to fall back on, and that is the one case where
#     a source is refused outright rather than running stale.
#
# Prints its volumes on stdout, one `src:dst[:ro]` per line. See `run.sh`.
set -eu

stage=$1
export GIT_AUTHOR_NAME=Bench GIT_AUTHOR_EMAIL=bench@example.org
export GIT_COMMITTER_NAME=Bench GIT_COMMITTER_EMAIL=bench@example.org

repo="$stage/adestia-plugin-clock"
mkdir -p "$repo/web"

cat >"$repo/adestia-plugin.json" <<'JSON'
{
  "schemaVersion": 1,
  "id": "clock",
  "kind": "app",
  "description": "L'heure, depuis un dépôt qui n'est pas celui du produit.",
  "contract": 1,
  "view": "./web/app.js",
  "tile": { "label": "Horloge", "icon": "🕰", "hue": "bleu" }
}
JSON

# Plain ESM, React from the page's import map, nothing built. The point is not
# what it draws — it is that what it draws came out of a clone.
cat >"$repo/web/app.js" <<'JS'
import { createElement as h } from 'react'

export default function view() {
  return {
    component: () =>
      h(
        'section',
        { style: { padding: '2rem' } },
        h('h1', null, 'Horloge'),
        h(
          'p',
          null,
          "Ce plugin ne vient pas de l'image : il a été récupéré depuis son propre dépôt au démarrage.",
        ),
      ),
  }
}
JS

git -C "$repo" init -q -b main
git -C "$repo" add -- adestia-plugin.json web
git -C "$repo" commit -q -m 'The clock plugin'
git -C "$repo" tag v1

cat >"$stage/adestia.config.yaml" <<'YAML'
name: Bench
locale: fr
auth:
  mode: none
driver:
  id: claude-code
extensions:
  sources:
    # The plugin's own repository, pinned. `file://` because a bench that
    # reaches a forge is a bench that fails when somebody else's morning goes
    # badly.
    - repo: file:///repos/adestia-plugin-clock
      ref: v1
    # Nothing at this address: the refusal has to be photographed too.
    - repo: file:///repos/adestia-plugin-absent
      ref: v1
  apps: [clock]
  skin: default
YAML

chmod -R a+rX "$stage"

echo "$stage/adestia.config.yaml:/app/adestia.config.yaml:ro"
echo "$repo:/repos/adestia-plugin-clock:ro"
