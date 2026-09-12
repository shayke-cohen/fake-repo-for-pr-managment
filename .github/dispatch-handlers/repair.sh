#!/usr/bin/env bash
# Deterministic `repair` handler for the fixture repo.
#
# A real repo points this at an agent. Here it is deliberately a fixed rule, so
# the loop can be proven without an API key or a model in the way: the failure
# is known (config.valid is false), so the repair is known.
set -euo pipefail

before=$(node -e "process.stdout.write(String(require('./src/config.json').valid))")
echo "config.valid before: $before"
if [ "$before" = "true" ]; then
  echo "already valid — nothing to repair"
  exit 0
fi

node -e "
const fs=require('fs'); const p='src/config.json';
const j=JSON.parse(fs.readFileSync(p)); j.valid=true;
fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
"
git add src/config.json
git commit -q -m "fix: set config.valid back to true

Repaired by #dispatch. The validate lane fails when this is false.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push origin HEAD 2>&1 | tail -2
echo "config.valid after: $(node -e "process.stdout.write(String(require('./src/config.json').valid))")"
echo "pushed $(git rev-parse --short HEAD)"
