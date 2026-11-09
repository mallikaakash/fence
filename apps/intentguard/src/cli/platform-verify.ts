#!/usr/bin/env node
/**
 * SRE / platform verification — probes, graceful shutdown, optional Docker.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { startGatewayServer } from "../server/http.ts";
import { INTENTGUARD_VERSION } from "../server/version.ts";
import { writeJsonAtomic } from "../server/persist.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(appRoot, "../..");

const required = [
  [join(repoRoot, "docs/SRE.md"), "SRE.md"],
  [join(repoRoot, ".github/workflows/intentguard-ci.yml"), "intentguard-ci"],
  [join(appRoot, "Dockerfile"), "Dockerfile"],
  [join(appRoot, "docker-compose.yml"), "docker-compose"],
  [join(appRoot, "src/server/persist.ts"), "atomic persist"],
  [join(appRoot, "src/server/log.ts"), "structured log"],
];

for (const [p, label] of required) {
  assert.ok(existsSync(p), `missing platform artifact: ${label}`);
}

const sre = readFileSync(join(repoRoot, "docs/SRE.md"), "utf8");
assert.match(sre, /\/health\/live/);
assert.match(sre, /platform:verify/);

const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
assert.ok(pkg.scripts["platform:verify"]);

// Atomic write sanity (already unit-tested; quick double-check here)
const tmp = mkdtempSync(join(tmpdir(), "ig-platform-"));
const statePath = join(tmp, "state.json");
writeJsonAtomic(statePath, { version: 2, sessions: [] });
assert.ok(existsSync(statePath));

// HTTP probes + shutdown
const dataDir = mkdtempSync(join(tmpdir(), "ig-platform-http-"));
process.env.INTENTGUARD_DATA_DIR = dataDir;
process.env.INTENTGUARD_OWNER_API_KEY = "own_platform";
process.env.INTENTGUARD_PORT = "0";
process.env.INTENTGUARD_DATA_KEY = "a".repeat(64);

const { server, shutdown } = startGatewayServer();
await new Promise<void>((r) => server.once("listening", () => r()));
const addr = server.address();
assert.ok(addr && typeof addr === "object");
const base = `http://127.0.0.1:${addr.port}`;

const health = (await fetch(`${base}/health`).then((r) => r.json())) as {
  version: string;
};
assert.equal(health.version, INTENTGUARD_VERSION);

const ready = await fetch(`${base}/health/ready`);
assert.equal(ready.status, 200);

await shutdown();
rmSync(dataDir, { recursive: true, force: true });
rmSync(tmp, { recursive: true, force: true });

const docker = spawnSync("docker", ["version"], { encoding: "utf8" });
if (docker.status !== 0) {
  console.log("OK platform-verify: files, atomic write, probes, shutdown (docker SKIPPED — no daemon)");
  process.exit(0);
}

const build = spawnSync("docker", ["build", "-t", "intentguard:platform-verify", "."], {
  cwd: appRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
assert.equal(
  build.status,
  0,
  `docker build failed:\n${build.stderr ?? build.stdout}`,
);

const run = spawnSync(
  "docker",
  [
    "run",
    "-d",
    "--rm",
    "-e",
    "DOCKER=1",
    "-e",
    "INTENTGUARD_OWNER_API_KEY=own_docker",
    "-p",
    "18787:8787",
    "intentguard:platform-verify",
  ],
  { encoding: "utf8" },
);
assert.equal(run.status, 0, run.stderr);
const cid = (run.stdout ?? "").trim();

let readyOk = false;
for (let i = 0; i < 45; i++) {
  const probe = await fetch("http://127.0.0.1:18787/health/ready").catch(() => null);
  if (probe?.ok) {
    const body = (await probe.json()) as { ok?: boolean };
    if (body.ok) {
      readyOk = true;
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 1000));
}

spawnSync("docker", ["rm", "-f", cid], { encoding: "utf8" });
assert.equal(readyOk, true, "container /health/ready did not become ok");

console.log("OK platform-verify: files, atomic write, probes, shutdown, docker image");
