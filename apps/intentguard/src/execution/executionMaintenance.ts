/**
 * Operational guard: pause new executes during gateway deploy/rollback.
 * Not shared across revisions — each process reads its own env at startup.
 */
export function isExecutionMaintenanceEnabled(): boolean {
  const v = process.env.INTENTGUARD_EXECUTION_MAINTENANCE;
  return v === "1" || v === "true";
}

export const EXECUTION_MAINTENANCE_ERROR_CODE = "execution_maintenance" as const;

export const EXECUTION_MAINTENANCE_MESSAGE =
  "gateway execution maintenance — new executes paused for deployment";
