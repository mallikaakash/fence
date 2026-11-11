/**
 * Static validation for deploy target separation in scripts/deploy-intentguard-gcp.sh
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type DeployTarget = "full" | "gateway" | "web";

export function normalizeDeployTarget(raw: string | undefined): DeployTarget {
  const t = (raw ?? "full").trim().toLowerCase();
  if (t === "full" || t === "gateway" || t === "web") return t;
  throw new Error(`Invalid INTENTGUARD_DEPLOY_TARGET=${raw}`);
}

export type DeployScriptAnalysis = {
  hasTargetResolver: boolean;
  hasGatewayMarker: boolean;
  hasWebMarker: boolean;
  hasCorsMarker: boolean;
  fullInvokesGateway: boolean;
  fullInvokesWeb: boolean;
  fullInvokesCors: boolean;
  gatewaySkipsWebDeploy: boolean;
  webSkipsGatewayDeploy: boolean;
  webSkipsCors: boolean;
  noRotateByDefault: boolean;
  dryRunSupported: boolean;
};

export function analyzeDeployScript(content: string): DeployScriptAnalysis {
  const hasTargetResolver = /intentguard_resolve_deploy_target/.test(content);
  const hasGatewayMarker = /intentguard_deploy_gateway_service/.test(content);
  const hasWebMarker = /intentguard_deploy_web_service/.test(content);
  const hasCorsMarker = /intentguard_update_gateway_cors/.test(content);

  const deployCase = content.match(
    /GW_URL=""[\s\S]*?case "\$DEPLOY_TARGET" in[\s\S]*?esac/,
  )?.[0] ?? content;

  const fullBlock = extractCaseArm(deployCase, "full");
  const gatewayBlock = extractCaseArm(deployCase, "gateway");
  const webBlock = extractCaseArm(deployCase, "web");

  return {
    hasTargetResolver,
    hasGatewayMarker,
    hasWebMarker,
    hasCorsMarker,
    fullInvokesGateway: /intentguard_deploy_gateway_service/.test(fullBlock),
    fullInvokesWeb: /intentguard_deploy_web_service/.test(fullBlock),
    fullInvokesCors: /intentguard_update_gateway_cors/.test(fullBlock),
    gatewaySkipsWebDeploy: !/intentguard_deploy_web_service/.test(gatewayBlock),
    webSkipsGatewayDeploy: !/intentguard_deploy_gateway_service/.test(webBlock),
    webSkipsCors: !/intentguard_update_gateway_cors/.test(webBlock),
    noRotateByDefault:
      /keeping current version/.test(content) &&
      /INTENTGUARD_DEPLOY_ROTATE_SECRETS/.test(content),
    dryRunSupported: /INTENTGUARD_DEPLOY_DRY_RUN/.test(content),
  };
}

function extractCaseArm(content: string, arm: string): string {
  const re = new RegExp(
    `${arm}\\)\\s*([\\s\\S]*?)(?=\\n\\s{2}(?:full|gateway|web)\\)|\\nesac)`,
    "m",
  );
  return content.match(re)?.[1] ?? "";
}

export function assertDeployTargetSeparation(repoRoot: string): DeployScriptAnalysis {
  const deploySh = join(repoRoot, "scripts/deploy-intentguard-gcp.sh");
  const libSh = join(repoRoot, "scripts/lib/intentguard-deploy-lib.sh");
  if (!existsSync(deploySh) || !existsSync(libSh)) {
    throw new Error("deploy script or lib missing");
  }
  const content = readFileSync(deploySh, "utf8") + "\n" + readFileSync(libSh, "utf8");
  const a = analyzeDeployScript(content);
  const errors: string[] = [];
  if (!a.hasTargetResolver) errors.push("missing intentguard_resolve_deploy_target");
  if (!a.hasGatewayMarker || !a.hasWebMarker) errors.push("missing deploy service markers");
  if (!a.fullInvokesGateway || !a.fullInvokesWeb || !a.fullInvokesCors) {
    errors.push("full target must deploy gateway, web, and CORS");
  }
  if (!a.gatewaySkipsWebDeploy) errors.push("gateway target must not deploy web");
  if (!a.webSkipsGatewayDeploy) errors.push("web target must not deploy gateway");
  if (!a.webSkipsCors) errors.push("web target must not update gateway CORS");
  if (!/keeping current version/.test(content)) {
    errors.push("missing secret rotation guard");
  }
  if (errors.length) {
    throw new Error(`deploy target validation failed:\n${errors.join("\n")}`);
  }
  return a;
}
