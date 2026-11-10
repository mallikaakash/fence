/**
 * Static checks for gateway Cloud Run deploy scripts (no GCP credentials).
 * Does not prove live scale or traffic — only repository script contents.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type GatewayDeployIssue = {
  severity: "error" | "warn";
  file: string;
  message: string;
};

const GATEWAY_SERVICE_PATTERNS = [
  /\$GW_SERVICE/,
  /intentguard-gateway/,
  /\$SERVICE/,
];

export function isGatewayGcloudBlock(block: string): boolean {
  if (!/gcloud\s+run\s+(deploy|services\s+update)/.test(block)) return false;
  if (/intentguard-web/.test(block) && !GATEWAY_SERVICE_PATTERNS.some((p) => p.test(block))) {
    return false;
  }
  return GATEWAY_SERVICE_PATTERNS.some((p) => p.test(block));
}

export function isGatewayTrafficBlock(block: string): boolean {
  if (!/gcloud\s+run\s+services\s+update-traffic/.test(block)) return false;
  return GATEWAY_SERVICE_PATTERNS.some((p) => p.test(block));
}

/** Join continued shell lines (trailing \) into one block per gcloud invocation. */
export function extractGcloudBlocks(content: string): string[] {
  const lines = content.split("\n");
  const blocks: string[] = [];
  let current = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!current && !trimmed.includes("gcloud run ")) continue;
    if (!current && trimmed.includes("gcloud run ")) {
      current = line;
    } else if (current) {
      current += "\n" + line;
    }
    if (current && !trimmed.endsWith("\\")) {
      blocks.push(current);
      current = "";
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

export function hasServiceLevelScaleOne(block: string): boolean {
  return (
    /--max[= ](1)\b/.test(block) ||
    /GW_CLOUDRUN_SERVICE_SCALE_FLAGS/.test(block) ||
    /GW_CLOUDRUN_SCALE_FLAGS/.test(block)
  );
}

/** @deprecated use hasRevisionMaxInstancesOne */
export function hasMaxInstancesOne(block: string): boolean {
  return hasRevisionMaxInstancesOne(block);
}

export function hasRevisionMaxInstancesOne(block: string): boolean {
  return (
    /--max-instances[= ](1)\b/.test(block) ||
    /GW_CLOUDRUN_REVISION_SCALE_FLAGS/.test(block) ||
    /GW_CLOUDRUN_SCALE_FLAGS/.test(block)
  );
}

export function hasFullGatewayScaleConfig(block: string): boolean {
  return hasServiceLevelScaleOne(block) && hasRevisionMaxInstancesOne(block);
}

/** Tagged no-traffic + revision min-instances can run alongside production (extra writer). */
export function isUnsafeTaggedCandidateBlock(block: string): boolean {
  return (
    /gcloud\s+run\s+deploy/.test(block) &&
    /--no-traffic/.test(block) &&
    /--tag=/.test(block) &&
    /--min-instances[= ]([1-9]|\d{2,})/.test(block)
  );
}

function hasRiskyTrafficToLatest(block: string): boolean {
  return (
    /gcloud\s+run\s+services\s+update-traffic/.test(block) &&
    /--to-latest\b/.test(block) &&
    !/INTENTGUARD_EXECUTION_MAINTENANCE/.test(block)
  );
}

function scanGatewayGcloudBlocks(
  file: string,
  content: string,
  issues: GatewayDeployIssue[],
): void {
  const blocks = extractGcloudBlocks(content);
  for (const block of blocks) {
    if (isGatewayGcloudBlock(block)) {
      if (!hasFullGatewayScaleConfig(block)) {
        const missing: string[] = [];
        if (!hasServiceLevelScaleOne(block)) missing.push("service --max 1");
        if (!hasRevisionMaxInstancesOne(block)) missing.push("revision --max-instances 1");
        issues.push({
          severity: "error",
          file,
          message: `gateway gcloud block missing ${missing.join(" and ")}`,
        });
      }
      if (isUnsafeTaggedCandidateBlock(block)) {
        issues.push({
          severity: "error",
          file,
          message:
            "tagged --no-traffic deploy with revision --min-instances>0 can start a second writer on GCS (use --min-instances 0 or separate staging service)",
        });
      }
    }
    if (isGatewayTrafficBlock(block) && hasRiskyTrafficToLatest(block)) {
      issues.push({
        severity: "warn",
        file,
        message:
          "update-traffic --to-latest without documented maintenance can route execute to an unprepared revision",
      });
    }
    if (isGatewayTrafficBlock(block) && /--to-tags=/.test(block)) {
      issues.push({
        severity: "warn",
        file,
        message:
          "traffic to tag URL can start an instance that does not count toward service --max; ensure prior revision is drained (see DEPLOY-GCP.md)",
      });
    }
  }
}

export function validateGatewayDeployScripts(repoRoot: string): GatewayDeployIssue[] {
  const issues: GatewayDeployIssue[] = [];
  const files = [
    join(repoRoot, "scripts/deploy-intentguard-gcp.sh"),
    join(repoRoot, "scripts/enable-gcp-execute.sh"),
  ];

  for (const file of files) {
    if (!existsSync(file)) {
      issues.push({
        severity: "error",
        file,
        message: "missing gateway deploy script",
      });
      continue;
    }
    const content = readFileSync(file, "utf8");
    scanGatewayGcloudBlocks(file, content, issues);
    if (
      file.includes("deploy-intentguard-gcp") &&
      !content.includes("gateway-cloudrun-scale.sh")
    ) {
      issues.push({
        severity: "warn",
        file,
        message: "expected source of scripts/lib/gateway-cloudrun-scale.sh",
      });
    }
  }

  const deployDoc = join(repoRoot, "docs/DEPLOY-GCP.md");
  if (existsSync(deployDoc)) {
    const doc = readFileSync(deployDoc, "utf8");
    scanGatewayGcloudBlocks(deployDoc, doc, issues);
    if (!doc.includes("Single-Writer Guarantee and Cloud Run Limitations")) {
      issues.push({
        severity: "warn",
        file: deployDoc,
        message: "missing Single-Writer Guarantee section",
      });
    }
  }

  const enableSh = join(repoRoot, "scripts/enable-gcp-execute.sh");
  if (existsSync(enableSh)) {
    const enableContent = readFileSync(enableSh, "utf8");
    if (!enableContent.includes("gateway-cloudrun-env.sh")) {
      issues.push({
        severity: "error",
        file: enableSh,
        message:
          "enable-gcp-execute must source scripts/lib/gateway-cloudrun-env.sh (preserve GCS state env on partial updates)",
      });
    }
    const envLib = join(repoRoot, "scripts/lib/gateway-cloudrun-env.sh");
    const envCsv = existsSync(envLib)
      ? readFileSync(envLib, "utf8")
      : "";
    const gcsInEnable =
      /INTENTGUARD_STATE_BACKEND=gcs/.test(enableContent) ||
      /INTENTGUARD_STATE_BACKEND=gcs/.test(envCsv);
    if (!gcsInEnable) {
      issues.push({
        severity: "error",
        file: enableSh,
        message: "enable-gcp-execute must set INTENTGUARD_STATE_BACKEND=gcs (via gateway-cloudrun-env.sh)",
      });
    }
    if (
      !/INTENTGUARD_GCS_STATE_BUCKET=/.test(enableContent) &&
      !/INTENTGUARD_GCS_STATE_BUCKET/.test(envCsv)
    ) {
      issues.push({
        severity: "error",
        file: enableSh,
        message: "enable-gcp-execute must set INTENTGUARD_GCS_STATE_BUCKET",
      });
    }
  }

  const deploySh = join(repoRoot, "scripts/deploy-intentguard-gcp.sh");
  if (existsSync(deploySh)) {
    const content = readFileSync(deploySh, "utf8");
    if (
      /gcloud run deploy "\$GW_SERVICE"/.test(content) &&
      !/INTENTGUARD_REQUIRE_GCS_STATE=1/.test(content)
    ) {
      issues.push({
        severity: "error",
        file: deploySh,
        message:
          "gateway deploy must set INTENTGUARD_REQUIRE_GCS_STATE=1 (native GCS state — see docs/STATE-PERSISTENCE-GCS-DESIGN.md)",
      });
    }
    if (
      /gcloud run deploy "\$GW_SERVICE"/.test(content) &&
      !/INTENTGUARD_GCS_STATE_BUCKET=\$\{BUCKET\}/.test(content)
    ) {
      issues.push({
        severity: "error",
        file: deploySh,
        message:
          "gateway deploy must set INTENTGUARD_GCS_STATE_BUCKET to the state bucket (API object path, not FUSE-only)",
      });
    }
    if (/gcloud run deploy "\$GW_SERVICE"/.test(content) && !/--no-traffic/.test(content)) {
      issues.push({
        severity: "warn",
        file: deploySh,
        message:
          "initial deploy sends traffic immediately; with execute enabled prefer maintenance + serial rollout (docs/DEPLOY-GCP.md)",
      });
    }
  }

  return issues;
}

export function assertGatewayDeployScripts(repoRoot: string): void {
  const issues = validateGatewayDeployScripts(repoRoot).filter((i) => i.severity === "error");
  if (issues.length === 0) return;
  const text = issues.map((i) => `${i.file}: ${i.message}`).join("\n");
  throw new Error(`gateway deploy validation failed:\n${text}`);
}
