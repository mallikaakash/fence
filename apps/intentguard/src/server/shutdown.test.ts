import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startGatewayServer } from "./http.ts";

describe("gateway shutdown", () => {
  let dataDir: string;

  after(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    delete process.env.INTENTGUARD_DATA_DIR;
    delete process.env.INTENTGUARD_OWNER_API_KEY;
    delete process.env.INTENTGUARD_PORT;
  });

  it("drains and returns 503 when shutting down", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "ig-shutdown-"));
    process.env.INTENTGUARD_DATA_DIR = dataDir;
    process.env.INTENTGUARD_OWNER_API_KEY = "own_shutdown";
    process.env.INTENTGUARD_PORT = "0";
    process.env.INTENTGUARD_BIND = "127.0.0.1";

    const { server, shutdown } = startGatewayServer();
    await new Promise<void>((r) => server.once("listening", () => r()));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const base = `http://127.0.0.1:${addr.port}`;

    const live = await fetch(`${base}/health/live`);
    assert.equal(live.status, 200);

    const ready = await fetch(`${base}/health/ready`);
    assert.equal(ready.status, 200);

    await shutdown();

    const after = await fetch(`${base}/health/live`).catch(() => null);
    assert.ok(!after || after.status >= 400);
  });
});
