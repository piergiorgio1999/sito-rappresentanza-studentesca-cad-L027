#!/usr/bin/env bash
set -Eeuo pipefail

root="${1:-.}"
[[ -d "$root" ]] || { echo "Swift detection: directory not found: $root" >&2; exit 2; }

swiftpm=false
xcode=false
swift_source=false

[[ -f "$root/Package.swift" ]] && swiftpm=true
find "$root" -type d \( -name '*.xcodeproj' -o -name '*.xcworkspace' \) -print -quit | grep -q . && xcode=true
find "$root" -type f -name '*.swift' -not -name 'Package.swift' -print -quit | grep -q . && swift_source=true

jq -cn --argjson swiftpm "$swiftpm" --argjson xcode "$xcode" --argjson swift_source "$swift_source" \
    '{swiftpm: $swiftpm, xcode: $xcode, swift_source: $swift_source}'
