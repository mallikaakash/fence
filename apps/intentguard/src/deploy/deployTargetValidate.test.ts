import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeDeployScript,
  assertDeployTargetSeparation,
  normalizeDeployTarget,
} from "./deployTargetValidate.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../");

describe("deployTargetValidate", () => {
  it("accepts full, gateway, web targets", () => {
    assert.equal(normalizeDeployTarget(undefined), "full");
    assert.equal(normalizeDeployTarget("gateway"), "gateway");
    assert.equal(normalizeDeployTarget("web"), "web");
  });

  it("rejects invalid targets", () => {
    assert.throws(() => normalizeDeployTarget("both"));
  });

  it("repo deploy scripts separate gateway and web", () => {
    const a = assertDeployTargetSeparation(repoRoot);
    assert.equal(a.gatewaySkipsWebDeploy, true);
    assert.equal(a.webSkipsGatewayDeploy, true);
    assert.equal(a.webSkipsCors, true);
    assert.equal(a.fullInvokesGateway, true);
    assert.equal(a.fullInvokesWeb, true);
  });

  it("maps deployment commands per target (deploy script)", () => {
    const deploySh = readFileSync(
      join(repoRoot, "scripts/deploy-intentguard-gcp.sh"),
      "utf8",
    );
    const deployCase =
      deploySh.match(/GW_URL=""[\s\S]*?case "\$DEPLOY_TARGET"[\s\S]*?esac/)?.[0] ??
      "";
    const table: Record<string, { gw: boolean; web: boolean }> = {
      full: { gw: true, web: true },
      gateway: { gw: true, web: false },
      web: { gw: false, web: true },
    };
    for (const [target, expect] of Object.entries(table)) {
      const arm =
        deployCase.match(
          new RegExp(
            `${target}\\)\\s*([\\s\\S]*?)(?=\\n\\s{2}(?:full|gateway|web)\\)|\\nesac)`,
            "m",
          ),
        )?.[1] ?? "";
      const gw = /intentguard_deploy_gateway_service/.test(arm);
      const web = /intentguard_deploy_web_service/.test(arm);
      assert.equal(gw, expect.gw, target);
      assert.equal(web, expect.web, target);
    }
  });

  it("lib includes scale flags on gateway deploy and CORS update", () => {
    const lib = join(repoRoot, "scripts/lib/intentguard-deploy-lib.sh");
    const content = readFileSync(lib, "utf8");
    assert.match(content, /GW_CLOUDRUN_SCALE_FLAGS/);
    const gwDeploy = content.slice(
      content.indexOf("intentguard_deploy_gateway_service"),
      content.indexOf("intentguard_deploy_web_service"),
    );
    const cors = content.slice(content.indexOf("intentguard_update_gateway_cors"));
    assert.match(gwDeploy, /INTENTGUARD_REQUIRE_GCS_STATE=1/);
    assert.match(cors, /GW_CLOUDRUN_SCALE_FLAGS/);
  });
});
