/**
 * Read-only Cloud Run scale/traffic report (optional gcloud; no mutations).
 * A passing local validator does NOT prove this report is healthy.
 */
import { spawnSync } from "node:child_process";

export type CloudRunTrafficTarget = {
  percent?: number;
  revisionName?: string;
  tag?: string;
  latestRevision?: boolean;
};

export type GatewayCloudRunLiveReport = {
  source: "gcloud" | "unavailable";
  service?: string;
  region?: string;
  project?: string;
  /** Service-level run.googleapis.com/maxScale (if present). */
  serviceMaxInstances?: string | null;
  serviceMinInstances?: string | null;
  /** Latest revision template autoscaling.knative.dev/maxScale. */
  latestRevisionMaxScale?: string | null;
  latestRevisionMinScale?: string | null;
  traffic: CloudRunTrafficTarget[];
  warnings: string[];
  operatorNotes: string[];
};

type GcloudServiceJson = {
  metadata?: { annotations?: Record<string, string> };
  spec?: {
    template?: { metadata?: { annotations?: Record<string, string> } };
  };
  status?: {
    traffic?: Array<{
      percent?: number;
      revisionName?: string;
      tag?: string;
      latestRevision?: boolean;
    }>;
  };
};

export function interpretLiveScaleReport(
  parsed: GcloudServiceJson,
  service: string,
): GatewayCloudRunLiveReport {
  const warnings: string[] = [];
  const operatorNotes: string[] = [
    "Local validate-gateway-deploy.sh does not prove live safety.",
    "Tagged revisions may run instances outside service --max budget.",
    "Revision overlap with shared GCS state.json is not multi-writer safe.",
  ];

  const serviceMax =
    parsed.metadata?.annotations?.["run.googleapis.com/maxScale"] ??
    parsed.metadata?.annotations?.["run.googleapis.com/max-instances"] ??
    null;
  const serviceMin =
    parsed.metadata?.annotations?.["run.googleapis.com/minScale"] ??
    parsed.metadata?.annotations?.["run.googleapis.com/min-instances"] ??
    null;

  const latestRevisionMax =
    parsed.spec?.template?.metadata?.annotations?.["autoscaling.knative.dev/maxScale"] ?? null;
  const latestRevisionMin =
    parsed.spec?.template?.metadata?.annotations?.["autoscaling.knative.dev/minScale"] ?? null;

  const traffic: CloudRunTrafficTarget[] = (parsed.status?.traffic ?? []).map((t) => ({
    percent: t.percent,
    revisionName: t.revisionName,
    tag: t.tag,
    latestRevision: t.latestRevision,
  }));

  if (serviceMax !== "1") {
    warnings.push(
      `service-level max is ${serviceMax ?? "unset/default"} — IntentGuard expects 1 for single-writer budget`,
    );
  }
  if (latestRevisionMax !== "1") {
    warnings.push(
      `latest revision template maxScale is ${latestRevisionMax ?? "unset"} — expect 1`,
    );
  }
  const activeSplits = traffic.filter((t) => (t.percent ?? 0) > 0);
  if (activeSplits.length > 1) {
    warnings.push(
      `traffic split across ${activeSplits.length} targets — multiple revisions may run concurrently`,
    );
  }
  const tagTargets = traffic.filter((t) => t.tag && (t.percent ?? 0) > 0);
  if (tagTargets.length > 0) {
    warnings.push(
      "tagged traffic targets present — tag URLs can start writers not counted in service max",
    );
  }

  return {
    source: "gcloud",
    service,
    serviceMaxInstances: serviceMax,
    serviceMinInstances: serviceMin,
    latestRevisionMaxScale: latestRevisionMax,
    latestRevisionMinScale: latestRevisionMin,
    traffic,
    warnings,
    operatorNotes,
  };
}

export function fetchGatewayCloudRunLiveReport(params: {
  project: string;
  region: string;
  service: string;
}): GatewayCloudRunLiveReport {
  const gcloud = spawnSync(
    "gcloud",
    [
      "run",
      "services",
      "describe",
      params.service,
      "--project",
      params.project,
      "--region",
      params.region,
      "--format=json",
    ],
    { encoding: "utf8" },
  );

  if (gcloud.status !== 0) {
    return {
      source: "unavailable",
      service: params.service,
      region: params.region,
      project: params.project,
      traffic: [],
      warnings: [
        gcloud.error?.message?.trim() ||
          gcloud.stderr?.trim() ||
          "gcloud run services describe failed (credentials or service missing)",
      ],
      operatorNotes: [
        "Run only when authenticated; this command does not modify Cloud Run.",
      ],
    };
  }

  const parsed = JSON.parse(gcloud.stdout) as GcloudServiceJson;
  return {
    ...interpretLiveScaleReport(parsed, params.service),
    project: params.project,
    region: params.region,
  };
}
