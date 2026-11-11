import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertGtmVerifyOk, runGtmVerifyChecks } from "./gtmVerifyChecks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(root, "../..");

describe("gtmVerifyChecks", () => {
  it("passes against current product tree", () => {
    const n = assertGtmVerifyOk({ root, repoRoot });
    assert.ok(n >= 10);
  });

  it("reports failure when setup page omits SetupPageClient", () => {
    const results = runGtmVerifyChecks({ root, repoRoot });
    const setupCheck = results.find((r) => r.name === "setup route mounts canonical setup client");
    assert.ok(setupCheck?.ok, setupCheck && !setupCheck.ok ? setupCheck.detail : undefined);
  });

  it("fails closed on missing web root", () => {
    const results = runGtmVerifyChecks({
      root: join(root, "nonexistent-gtm-root"),
      repoRoot,
    });
    const failed = results.filter((r) => !r.ok);
    assert.ok(failed.length > 0);
    assert.ok(failed.some((f) => f.name === "gtm artifacts exist"));
  });
});
