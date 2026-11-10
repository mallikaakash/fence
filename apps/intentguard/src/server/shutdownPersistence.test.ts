import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it, afterEach } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startGatewayServer } from "./http.ts";
import { idempotencyClear } from "./idempotency.ts";
import type { PersistedStateV3 } from "./secureStore.ts";

const MARKET = "0xmarket";
const intent = {
  marketId: MARKET,
  margin: "5",
  leverage: 2,
  price: "10",
  quantity: "1",
  side: "buy" as const,
};

const envSnap = { ...process.env };

async function bootOn(dataDir: string) {
  process.env.INTENTGUARD_DATA_DIR = dataDir;
  process.env.INTENTGUARD_PORT = "0";
  process.env.INTENTGUARD_BIND = "127.0.0.1";
  process.env.INTENTGUARD_EXECUTE = "0";
  delete process.env.DOCKER;
  const { server, shutdown, config } = startGatewayServer();
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  return { port: addr.port, shutdown, ownerKey: config.ownerApiKey, server };
}

afterEach(() => {
  process.env = { ...envSnap };
  idempotencyClear();
});

describe("shutdown persistence (process restart)", () => {
  it("proposal survives graceful shutdown and second process", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ig-shutdown-prop-"));
    const first = await bootOn(dataDir);
    const create = await fetch(`http://127.0.0.1:${first.port}/v1/sessions`, {
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
          marketIds: [MARKET],
          maxMarginPerOrder: "50",
          maxOrderNotional: "500",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      }),
    });
    const { agentApiToken } = (await create.json()) as { agentApiToken: string };
    const prop = await fetch(`http://127.0.0.1:${first.port}/v1/propose`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentApiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ intent }),
    });
    const proposed = (await prop.json()) as { proposalId?: string };
    assert.ok(proposed.proposalId?.startsWith("prp_"));
    await first.shutdown();

    const disk = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as PersistedStateV3;
    assert.ok(disk.proposals?.length, "proposals missing after shutdown");

    const second = await bootOn(dataDir);
    const disk2 = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as PersistedStateV3;
    assert.equal(disk2.proposals![0]!.status, "approved");

    const ex = await fetch(`http://127.0.0.1:${second.port}/v1/execute`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentApiToken}`,
        "content-type": "application/json",
        "idempotency-key": "post-shutdown",
      },
      body: JSON.stringify({
        proposalId: proposed.proposalId,
        intent,
      }),
    });
    assert.equal(ex.status, 503);
    await second.shutdown();

    const afterExec = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as PersistedStateV3;
    assert.ok(afterExec.executeIdempotency?.length, "idempotency missing after execute+shutdown");
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("broadcast_unknown survives shutdown and blocks new key after restart", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ig-shutdown-bu-"));
    const first = await bootOn(dataDir);
    const create = await fetch(`http://127.0.0.1:${first.port}/v1/sessions`, {
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
          marketIds: [MARKET],
          maxMarginPerOrder: "50",
          maxOrderNotional: "500",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      }),
    });
    const { agentApiToken, session } = (await create.json()) as {
      agentApiToken: string;
      session: { sessionId: string };
    };
    const prop = await fetch(`http://127.0.0.1:${first.port}/v1/propose`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentApiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ intent }),
    });
    const { proposalId } = (await prop.json()) as { proposalId: string };
    await first.shutdown();

    const raw = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as PersistedStateV3;
    const proposal = raw.proposals!.find((p) => p.proposalId === proposalId)!;
    proposal.status = "broadcast_unknown";
    proposal.consumedByIdempotencyKeyHash = "hash-bu";
    raw.executeIdempotency = [
      {
        idempotencyKeyHash: "hash-bu",
        sessionId: session.sessionId,
        requestFingerprint: "rf",
        proposalId,
        state: "broadcast_unknown",
        result: { errorCode: "broadcast_unknown" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    writeFileSync(join(dataDir, "state.json"), JSON.stringify(raw, null, 2));

    const second = await bootOn(dataDir);
    const out = await fetch(`http://127.0.0.1:${second.port}/v1/execute`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentApiToken}`,
        "content-type": "application/json",
        "idempotency-key": "new-key",
      },
      body: JSON.stringify({ proposalId, intent }),
    });
    assert.equal(out.status, 409);
    await second.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("repeated shutdown calls await the same flush", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ig-shutdown-twice-"));
    const first = await bootOn(dataDir);
    await Promise.all([first.shutdown(), first.shutdown()]);
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("graceful shutdown persists when not frozen", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ig-shutdown-nofreeze-"));
    const gw = await bootOn(dataDir);
    await fetch(`http://127.0.0.1:${gw.port}/v1/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${gw.ownerKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
        subaccountIndex: 1,
        policy: {
          version: 1,
          marketIds: [MARKET],
          maxMarginPerOrder: "50",
          maxOrderNotional: "500",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      }),
    });
    await gw.shutdown();
    const disk = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as PersistedStateV3;
    assert.equal(disk.sessions?.length, 1);
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("shutdown while operator-frozen does not mutate state.json", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ig-shutdown-frozen-"));
    const gw = await bootOn(dataDir);
    await fetch(`http://127.0.0.1:${gw.port}/v1/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${gw.ownerKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
        subaccountIndex: 1,
        policy: {
          version: 1,
          marketIds: [MARKET],
          maxMarginPerOrder: "50",
          maxOrderNotional: "500",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      }),
    });
    const freeze = await fetch(
      `http://127.0.0.1:${gw.port}/v1/owner/state-write/freeze`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${gw.ownerKey}` },
      },
    );
    assert.equal(freeze.status, 200);
    const statePath = join(dataDir, "state.json");
    const digest = createHash("sha256").update(readFileSync(statePath)).digest("hex");
    await gw.shutdown();
    const after = createHash("sha256").update(readFileSync(statePath)).digest("hex");
    assert.equal(after, digest, "shutdown must not write when frozen");
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("shutdown with env freeze completes without final flush", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ig-shutdown-envfreeze-"));
    process.env.INTENTGUARD_STATE_WRITE_FREEZE = "1";
    const gw = await bootOn(dataDir);
    const statePath = join(dataDir, "state.json");
    const before = existsStateDigest(statePath);
    await gw.shutdown();
    const after = existsStateDigest(statePath);
    assert.equal(after, before);
    delete process.env.INTENTGUARD_STATE_WRITE_FREEZE;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("unfreeze then shutdown persists again", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ig-shutdown-unfreeze-"));
    const gw = await bootOn(dataDir);
    await fetch(`http://127.0.0.1:${gw.port}/v1/owner/state-write/freeze`, {
      method: "POST",
      headers: { authorization: `Bearer ${gw.ownerKey}` },
    });
    await fetch(`http://127.0.0.1:${gw.port}/v1/owner/state-write/unfreeze`, {
      method: "POST",
      headers: { authorization: `Bearer ${gw.ownerKey}` },
    });
    await fetch(`http://127.0.0.1:${gw.port}/v1/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${gw.ownerKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ownerInjectiveAddress: "inj1yrvztj7g3x3009uhm03hgsp3fru6e4mdv7jpkz",
        subaccountIndex: 1,
        policy: {
          version: 1,
          marketIds: [MARKET],
          maxMarginPerOrder: "50",
          maxOrderNotional: "500",
          maxLeverage: 5,
          dailyMarginBudget: "500",
        },
      }),
    });
    await gw.shutdown();
    const disk = JSON.parse(
      readFileSync(join(dataDir, "state.json"), "utf8"),
    ) as PersistedStateV3;
    assert.equal(disk.sessions?.length, 1);
    rmSync(dataDir, { recursive: true, force: true });
  });
});

function existsStateDigest(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}
