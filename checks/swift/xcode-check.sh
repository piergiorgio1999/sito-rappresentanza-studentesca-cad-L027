#!/usr/bin/env bash
set -Eeuo pipefail

scheme="${XCODE_SCHEME:-}"
project="${XCODE_PROJECT:-}"
workspace="${XCODE_WORKSPACE:-}"
destination="${XCODE_DESTINATION:-platform=macOS}"

if [[ -z "$scheme" ]]; then
    echo "Xcode check: XCODE_SCHEME is required when an Xcode container is detected" >&2
    exit 1
fi

if [[ -n "$project" && -n "$workspace" ]]; then
    echo "Xcode check: configure only one of XCODE_PROJECT or XCODE_WORKSPACE" >&2
    exit 1
fi

if [[ -n "$workspace" ]]; then
    [[ -d "$workspace" ]] || { echo "Xcode check: workspace not found: $workspace" >&2; exit 1; }
elif [[ -n "$project" ]]; then
    [[ -d "$project" ]] || { echo "Xcode check: project not found: $project" >&2; exit 1; }
elif [[ ! -f Package.swift ]]; then
    echo "Xcode check: XCODE_PROJECT or XCODE_WORKSPACE is required without Package.swift" >&2
    exit 1
fi

echo "Xcode check: RUN — scheme=$scheme destination=$destination"
if [[ -n "$workspace" ]]; then
    xcodebuild -workspace "$workspace" -scheme "$scheme" -destination "$destination" test
elif [[ -n "$project" ]]; then
    xcodebuild -project "$project" -scheme "$scheme" -destination "$destination" test
else
    xcodebuild -scheme "$scheme" -destination "$destination" test
fi
