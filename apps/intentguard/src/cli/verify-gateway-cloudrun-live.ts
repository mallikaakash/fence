#!/usr/bin/env node
/**
 * Read-only Cloud Run inspection for gateway single-writer posture.
 * Does not modify GCP. Does not replace validate-gateway-deploy.sh.
 */
import { fetchGatewayCloudRunLiveReport } from "../deploy/gatewayCloudRunLiveVerify.ts";

const project =
  process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
const region = process.env.GCP_REGION ?? "us-central1";
const service = process.env.INTENTGUARD_GW_SERVICE ?? "intentguard-gateway";

if (!project) {
  console.error(
    "Set GCP_PROJECT_ID (or GOOGLE_CLOUD_PROJECT) for live verify; local validator: bash scripts/validate-gateway-deploy.sh",
  );
  process.exit(2);
}

const report = fetchGatewayCloudRunLiveReport({ project, region, service });
console.log(JSON.stringify(report, null, 2));

if (report.source === "unavailable") {
  process.exit(3);
}

process.exit(report.warnings.length > 0 ? 1 : 0);
