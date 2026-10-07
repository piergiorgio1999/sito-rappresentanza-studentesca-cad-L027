#!/usr/bin/env bash
set -Eeuo pipefail

required=(
git
gh
jq
copier
shellcheck
actionlint
)

for tool in "${required[@]}"
do
    command -v "$tool" >/dev/null
done

echo "Prerequisites OK"
