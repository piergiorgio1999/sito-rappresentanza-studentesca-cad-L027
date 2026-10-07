#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
detector="$ROOT/checks/swift/detect.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

assert_detection() {
    local directory="$1"
    local expected="$2"
    local actual
    actual="$("$detector" "$directory")"
    [[ "$actual" == "$expected" ]] || {
        echo "unexpected detection: $actual" >&2
        exit 1
    }
}

mkdir -p "$tmp/bare-swift/Sources"
touch "$tmp/bare-swift/Sources/App.swift"
assert_detection "$tmp/bare-swift" '{"swiftpm":false,"xcode":false,"swift_source":true}'

mkdir -p "$tmp/swiftpm"
touch "$tmp/swiftpm/Package.swift"
assert_detection "$tmp/swiftpm" '{"swiftpm":true,"xcode":false,"swift_source":false}'

mkdir -p "$tmp/project/App.xcodeproj"
assert_detection "$tmp/project" '{"swiftpm":false,"xcode":true,"swift_source":false}'

mkdir -p "$tmp/workspace/App.xcworkspace"
assert_detection "$tmp/workspace" '{"swiftpm":false,"xcode":true,"swift_source":false}'

echo "Swift applicability matrix: PASS"
