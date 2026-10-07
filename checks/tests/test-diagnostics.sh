#!/usr/bin/env bash
set -Eeuo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf '#!/usr/bin/env bash\n' > "$tmp/bad.sh"
printf '%s\n' "echo \"\$bad\"" >> "$tmp/bad.sh"
if (cd "$tmp" && "$root/checks/shell/check.sh") >"$tmp/out" 2>&1; then
    echo 'expected ShellCheck failure' >&2
    exit 1
fi
for field in severity invariant reason evidence remediation; do
    grep -q "^$field: " "$tmp/out"
done
printf 'structured diagnostics: PASS\n'
