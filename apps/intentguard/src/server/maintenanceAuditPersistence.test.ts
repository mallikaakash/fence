/**
 * Phase 2A.3.5 — maintenance rejection audit must survive state.json + process restart.
 */
import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startGatewayServer } from "./http.ts";
import { idempotencyClear } from "./idempotency.ts";
import type { PersistedStateV3 } from "./secureStore.ts";
import { SPIKE_ALLOWED_MARKET_ID } from "../chain/network.ts";

const intent = {
  marketId: SPIKE_ALLOWED_MARKET_ID,
  margin: "1",
  leverage: 1,
  price: "1",
  quantity: "1",
  side: "buy" as const,
};

const envSnap = { ...process.env };

async function boot(dataDir: string, maintenance: boolean) {
  process.env.INTENTGUARD_DATA_DIR = dataDir;
  process.env.INTENTGUARD_OWNER_API_KEY = "own_maint_audit_test";
  process.env.INTENTGUARD_PORT = "0";
  process.env.INTENTGUARD_BIND = "127.0.0.1";
  process.env.INTENTGUARD_EXECUTE = "1";
  if (maintenance) {
    process.env.INTENTGUARD_EXECUTION_MAINTENANCE = "1";
  } else {
    delete process.env.INTENTGUARD_EXECUTION_MAINTENANCE;
  }
  const started = startGatewayServer();
  await new Promise<void>((r) => started.server.once("listening", () => r()));
  const addr = started.server.address();
  assert.ok(addr && typeof addr === "object");
  return {
    port: addr.port,
    shutdown: started.shutdown,
    ownerKey: started.config.ownerApiKey,
  };
}

afterEach(() => {
  process.env = { ...envSnap };
  idempotencyClear();
});

describe("maintenance audit persistence", () => {
  it("execute_maintenance_rejected survives restart via state.json", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ig-maint-audit-"));
    try {
      const first = await boot(dataDir, true);
      const base = `http://127.0.0.1:${first.port}`;

      const create = await fetch(`${base}/v1/sessions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${first.ownerKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
          subaccountIndex: 1,
          policy: {
            version: 1,
            marketIds: [SPIKE_ALLOWED_MARKET_ID],
            maxMarginPerOrder: "100",
            maxOrderNotional: "10",
            maxLeverage: 3,
            dailyMarginBudget: "500",
          },
        }),
      });
      assert.equal(create.status, 201);
      const { agentApiToken } = (await create.json()) as { agentApiToken: string };

      const propose = await fetch(`${base}/v1/propose`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${agentApiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ intent }),
      });
      assert.equal(propose.status, 200);
      const { proposalId } = (await propose.json()) as { proposalId: string };
      assert.ok(proposalId?.startsWith("prp_"));

      const exec = await fetch(`${base}/v1/execute`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${agentApiToken}`,
          "content-type": "application/json",
          "idempotency-key": "audit-persist-maint",
        },
        body: JSON.stringify({ proposalId, intent }),
      });
      assert.equal(exec.status, 503);
      const body = (await exec.json()) as { errorCode: string };
      assert.equal(body.errorCode, "execution_maintenance");

      await first.shutdown();

      const statePath = join(dataDir, "state.json");
      assert.ok(existsSync(statePath));
      const onDisk = JSON.parse(readFileSync(statePath, "utf8")) as PersistedStateV3;
      assert.ok(
        onDisk.audit?.some((e) => e.type === "execute_maintenance_rejected"),
        "state.json must contain execute_maintenance_rejected",
      );

      const second = await boot(dataDir, true);
      const auditRes = await fetch(`http://127.0.0.1:${second.port}/v1/audit/events`, {
        headers: { authorization: `Bearer ${second.ownerKey}` },
      });
      assert.equal(auditRes.status, 200);
      const { events } = (await auditRes.json()) as {
        events: { type: string }[];
      };
      assert.ok(
        events.some((e) => e.type === "execute_maintenance_rejected"),
        "GET /v1/audit/events after restart",
      );
      await second.shutdown();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
