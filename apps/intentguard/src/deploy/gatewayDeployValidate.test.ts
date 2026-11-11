import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertGatewayDeployScripts,
  extractGcloudBlocks,
  hasFullGatewayScaleConfig,
  hasRevisionMaxInstancesOne,
  hasServiceLevelScaleOne,
  isGatewayGcloudBlock,
  isUnsafeTaggedCandidateBlock,
  validateGatewayDeployScripts,
} from "./gatewayDeployValidate.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../");

describe("gatewayDeployValidate", () => {
  it("extractGcloudBlocks joins line continuations", () => {
    const sample = `gcloud run services update "$GW_SERVICE" \\
  --project x \\
  --max 1 \\
  --max-instances 1 \\
  --update-env-vars FOO=1
`;
    const blocks = extractGcloudBlocks(sample);
    assert.equal(blocks.length, 1);
    assert.ok(hasFullGatewayScaleConfig(blocks[0]!));
  });

  it("repo deploy scripts pass validation", () => {
    assertGatewayDeployScripts(repoRoot);
  });

  it("enable-gcp-execute preserves GCS state env", () => {
    const content = readFileSync(
      join(repoRoot, "scripts/enable-gcp-execute.sh"),
      "utf8",
    );
    assert.match(content, /gateway-cloudrun-env\.sh/);
    assert.match(content, /GW_STATE_ENV/);
    assert.match(content, /INTENTGUARD_GCS_STATE_BUCKET/);
    const envLib = readFileSync(
      join(repoRoot, "scripts/lib/gateway-cloudrun-env.sh"),
      "utf8",
    );
    assert.match(envLib, /INTENTGUARD_STATE_BACKEND=gcs/);
  });

  it("every gateway gcloud block in deploy scripts includes service and revision scale", () => {
    for (const rel of ["scripts/deploy-intentguard-gcp.sh", "scripts/enable-gcp-execute.sh"]) {
      const content = readFileSync(join(repoRoot, rel), "utf8");
      for (const block of extractGcloudBlocks(content)) {
        if (!isGatewayGcloudBlock(block)) continue;
        assert.ok(
          hasFullGatewayScaleConfig(block),
          `${rel} block missing scale: ${block.slice(0, 80)}`,
        );
      }
    }
  });

  it("web deploy scaling is not constrained to single instance", () => {
    const deploy = readFileSync(join(repoRoot, "scripts/lib/intentguard-deploy-lib.sh"), "utf8");
    const webBlock = extractGcloudBlocks(deploy).find((b) => /\$WEB_SERVICE/.test(b));
    assert.ok(webBlock);
    assert.ok(/--max-instances[= ]5/.test(webBlock));
    assert.ok(!hasServiceLevelScaleOne(webBlock));
  });

  it("flags gateway block without revision max-instances", () => {
    const bad = `gcloud run services update "$GW_SERVICE" \\
  --max 1 \\
  --update-env-vars INTENTGUARD_CORS_ORIGINS=https://example.com
`;
    const block = extractGcloudBlocks(bad)[0]!;
    assert.ok(hasServiceLevelScaleOne(block));
    assert.ok(!hasRevisionMaxInstancesOne(block));
    assert.ok(!hasFullGatewayScaleConfig(block));
    assert.ok(isGatewayGcloudBlock(block));
  });

  it("detects unsafe tagged candidate with revision min-instances", () => {
    const block = `gcloud run deploy "$GW_SERVICE" \\
  --no-traffic \\
  --tag=candidate \\
  --min-instances 1 \\
  --max-instances 1`;
    assert.ok(isUnsafeTaggedCandidateBlock(block));
  });

  it("no-traffic alone is not proof of no writer (documented in operator notes)", () => {
    const block = `gcloud run deploy "$GW_SERVICE" \\
  --no-traffic \\
  --tag=candidate \\
  --min-instances 0 \\
  --max 1 \\
  --max-instances 1`;
    assert.equal(isUnsafeTaggedCandidateBlock(block), false);
    assert.ok(/--no-traffic/.test(block));
  });

  it("DEPLOY-GCP documents Single-Writer section without tag+candidate+min-instances 1", () => {
    const issues = validateGatewayDeployScripts(repoRoot).filter((i) => i.severity === "error");
    assert.equal(
      issues.filter((i) => i.file.includes("DEPLOY-GCP")).length,
      0,
      issues.map((i) => i.message).join("; "),
    );
  });
});
