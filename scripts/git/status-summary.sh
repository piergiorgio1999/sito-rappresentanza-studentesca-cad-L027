#!/usr/bin/env bash
set -Eeuo pipefail

echo
git status --short

echo
git branch --show-current

echo
git log --oneline -5
