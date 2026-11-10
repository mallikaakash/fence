import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpretLiveScaleReport } from "./gatewayCloudRunLiveVerify.ts";

describe("gatewayCloudRunLiveVerify", () => {
  it("distinguishes service-level and revision-level max", () => {
    const report = interpretLiveScaleReport(
      {
        metadata: { annotations: { "run.googleapis.com/maxScale": "1" } },
        spec: {
          template: {
            metadata: { annotations: { "autoscaling.knative.dev/maxScale": "3" } },
          },
        },
        status: { traffic: [{ percent: 100, latestRevision: true }] },
      },
      "intentguard-gateway",
    );
    assert.equal(report.serviceMaxInstances, "1");
    assert.equal(report.latestRevisionMaxScale, "3");
    assert.ok(report.warnings.some((w) => w.includes("latest revision template")));
  });

  it("warns on traffic split and tag targets", () => {
    const report = interpretLiveScaleReport(
      {
        metadata: { annotations: { "run.googleapis.com/maxScale": "1" } },
        spec: {
          template: {
            metadata: { annotations: { "autoscaling.knative.dev/maxScale": "1" } },
          },
        },
        status: {
          traffic: [
            { percent: 90, revisionName: "intentguard-gateway-00001" },
            { percent: 10, tag: "candidate", revisionName: "intentguard-gateway-00002" },
          ],
        },
      },
      "intentguard-gateway",
    );
    assert.ok(report.warnings.some((w) => w.includes("traffic split")));
    assert.ok(report.warnings.some((w) => w.includes("tagged")));
  });

  it("notes tagged no-traffic is not proof of no active instance", () => {
    const report = interpretLiveScaleReport(
      {
        metadata: { annotations: { "run.googleapis.com/maxScale": "1" } },
        spec: {
          template: {
            metadata: { annotations: { "autoscaling.knative.dev/maxScale": "1" } },
          },
        },
        status: { traffic: [{ percent: 100, latestRevision: true }] },
      },
      "intentguard-gateway",
    );
    assert.ok(
      report.operatorNotes.some((n) => n.toLowerCase().includes("tagged")),
    );
  });
});
