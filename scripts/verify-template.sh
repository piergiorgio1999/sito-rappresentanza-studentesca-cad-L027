#!/usr/bin/env bash
set -Eeuo pipefail

echo "Template verification"

required=(
AGENTS.md
README.md
copier.yml
scope-map.json
)

for file in "${required[@]}"
do
    test -f "$file"
done

echo
echo "Basic structure OK"
