import type { GrantAuditReport } from "./authz-types";

export function formatGrantAuditReport(report: GrantAuditReport): string {
  const lines: string[] = [];
  lines.push(`Grantor: ${report.granter}`);
  lines.push(`Grants: ${report.grantCount}  |  Risk score: ${report.score}/100 (higher = safer)`);
  lines.push("");

  if (report.grantCount === 0) {
    lines.push("No AuthZ grants on this address.");
    return lines.join("\n");
  }

  const bySeverity = { critical: 0, high: 0, medium: 0, info: 0 };
  for (const f of report.findings) {
    bySeverity[f.severity]++;
    if (f.severity === "high" || f.severity === "critical") {
      lines.push(`[${f.severity.toUpperCase()}] ${f.message}`);
    }
  }

  const mediumInfo = report.findings.filter(
    (f) => f.severity === "medium" || f.severity === "info",
  );
  if (mediumInfo.length) {
    lines.push("");
    lines.push("Notes:");
    for (const f of mediumInfo.slice(0, 8)) {
      lines.push(`  • ${f.message}`);
    }
    if (mediumInfo.length > 8) {
      lines.push(`  … +${mediumInfo.length - 8} more`);
    }
  }

  if (report.score < 70) {
    lines.push("");
    lines.push(
      "Verdict: Stock-style grants detected — use typed AuthZ + IntentGuard notional policy.",
    );
  } else if (report.score < 90) {
    lines.push("");
    lines.push(
      "Verdict: Typed grants help; still add gateway notional/leverage limits.",
    );
  } else {
    lines.push("");
    lines.push("Verdict: No high-risk patterns in fetched grant metadata.");
  }

  return lines.join("\n");
}
