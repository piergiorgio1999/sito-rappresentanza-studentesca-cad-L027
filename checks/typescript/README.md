# typescript checker

Status: Active

Activated by the `checks` CI job when `detect` finds the language
manifest for typescript. The check itself no-ops (exit 0) if the manifest
is absent, so it is safe to run unconditionally too.
