#!/bin/sh
# Same corpus as the density scenario — a section is only worth photographing
# when it is full. Reused rather than copied: two seeds that drift are two
# different screens wearing the same name.
set -eu
exec sh "$(dirname "$0")/home-density.prep.sh" "$1"
