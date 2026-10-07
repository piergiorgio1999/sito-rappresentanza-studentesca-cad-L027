import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const root = process.env.AGENT_TEMPLATE_ROOT ?? process.cwd();
const timeoutMs = 120_000;

function run(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn(script, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, signal: null, stdout, stderr: `${stderr}${error.message}\n` });
    });
  });
}

function result(runResult) {
  const text = [runResult.stdout.trim(), runResult.stderr.trim()]
    .filter(Boolean)
    .join("\n\n") || `exit=${runResult.code}`;
  return {
    content: [{ type: "text", text }],
    isError: runResult.code !== 0,
  };
}

const server = new McpServer({ name: "agent-template", version: "1.0.0" });

server.registerTool("project_status", {
  description: "Read the GitHub-derived Project Status Digest. Read-only.",
  inputSchema: { format: z.enum(["md", "json"]).default("md") },
}, async ({ format }) => result(await run("tools/project-status/project-status", [format])));

server.registerTool("agent_preflight", {
  description: "Run the existing deterministic template preflight and acceptance checks.",
  inputSchema: {},
}, async () => {
  const checks = [
    ["tools/validate/validate.sh", []],
    ["acceptance/scripts/run-anti-rot.sh", []],
    ["acceptance/scripts/run-scope-guard.sh", []],
  ];
  const outputs = [];
  for (const [script, args] of checks) {
    const check = await run(script, args);
    outputs.push(`${script}\n${[check.stdout.trim(), check.stderr.trim()].filter(Boolean).join("\n")}`);
    if (check.code !== 0) return result({ ...check, stdout: outputs.join("\n\n") });
  }
  return result({ code: 0, stdout: outputs.join("\n\n"), stderr: "" });
});

server.registerTool("release_readiness", {
  description: "Run release readiness checks without creating a tag or GitHub release.",
  inputSchema: { version: z.string().regex(/^\\d+\\.\\d+\\.\\d+$/) },
}, async ({ version }) => result(await run("scripts/release/prepare-release.sh", [version])));

await server.connect(new StdioServerTransport());
