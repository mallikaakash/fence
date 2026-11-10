/**
 * Authoritative list of gateway operations that mutate persisted state (state.json).
 * Used for documentation and tests — keep in sync with http.ts + orchestrator + hydrate.
 */
export type StateMutationRow = {
  operation: string;
  entryPoint: string;
  persistence: string;
  duringExecutionMaintenance: boolean;
  duringStateWriteFreeze: boolean;
  duringShutdown: boolean;
};

/** Maintenance blocks new executes only; freeze blocks all rows marked false for freeze. */
export const STATE_MUTATION_INVENTORY: StateMutationRow[] = [
  {
    operation: "Startup hydrate + recovery",
    entryPoint: "http.ts hydrate → recoverExecutionSafetyOnStartup",
    persistence: "persist() → store.save",
    duringExecutionMaintenance: true,
    duringStateWriteFreeze: false,
    duringShutdown: false,
  },
  {
    operation: "Session create",
    entryPoint: "POST /v1/sessions",
    persistence: "persist()",
    duringExecutionMaintenance: true,
    duringStateWriteFreeze: false,
    duringShutdown: false,
  },
  {
    operation: "Session revoke",
    entryPoint: "POST /v1/sessions/:id/revoke",
    persistence: "persist()",
    duringExecutionMaintenance: true,
    duringStateWriteFreeze: false,
    duringShutdown: false,
  },
  {
    operation: "Owner API key rotate",
    entryPoint: "POST /v1/owner/rotate-api-key",
    persistence: "persist() + config.json direct write",
    duringExecutionMaintenance: true,
    duringStateWriteFreeze: false,
    duringShutdown: false,
  },
  {
    operation: "Agent propose + proposal record",
    entryPoint: "POST /v1/propose",
    persistence: "persist()",
    duringExecutionMaintenance: true,
    duringStateWriteFreeze: false,
    duringShutdown: false,
  },
  {
    operation: "Execute lifecycle + idempotency",
    entryPoint: "POST /v1/execute → orchestrateAgentExecute",
    persistence: "persistNow() checkpoints + persist()",
    duringExecutionMaintenance: false,
    duringStateWriteFreeze: false,
    duringShutdown: false,
  },
  {
    operation: "Maintenance reject audit",
    entryPoint: "executeOrchestrator maintenance branch",
    persistence: "persistNow (if after claim)",
    duringExecutionMaintenance: true,
    duringStateWriteFreeze: false,
    duringShutdown: false,
  },
  {
    operation: "Shutdown final flush",
    entryPoint: "http.ts shutdown",
    persistence: "persist({ shutdownFlush: true }) — skipped when frozen",
    duringExecutionMaintenance: true,
    duringStateWriteFreeze: false,
    duringShutdown: true,
  },
];
