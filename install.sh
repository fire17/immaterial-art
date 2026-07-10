#!/usr/bin/env bash
# Link the immaterial-art skill into ~/.claude/skills (canonical source = this repo).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILLS="$HOME/.claude/skills"
mkdir -p "$SKILLS"

ln -sfn "$HERE/skill" "$SKILLS/immaterial-art"
ln -sfn "$HERE/skill" "$SKILLS/iart"
echo "linked: $SKILLS/immaterial-art -> $HERE/skill (+ iart alias)"

cd "$HERE/skill/scripts"
npm install --no-fund --no-audit
echo "deps installed. try:"
echo "  node $SKILLS/immaterial-art/scripts/immaterial.mjs batch --count 2 --duration 5 --stills --out /tmp/imm-test --open-as-ready"
