# ACC-19

Status: PASS

Purpose: Copier update and integration profiles

Expected Result: infrastruttura aggiornata e codice project-specific intatto;
`standalone` non genera `mcp/`, mentre `mcp` genera il server locale, il
manifest e il lockfile MCP.

Evidence: Copier 9.17.1 with `--vcs-ref=HEAD` generated both profiles;
standalone produced no MCP files, while MCP produced `mcp/server.mjs`,
`mcp/package.json`, `mcp/package-lock.json`, and the rendered integration mode.
