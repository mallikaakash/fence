/** Mirror of executeOrchestrator durablePersist for adversarial tests (no orchestrator import). */
export async function durablePersist(
  persistNow: () => Promise<void>,
): Promise<{ httpStatus: number; body: { errorCode: string } } | null> {
  try {
    await persistNow();
    return null;
  } catch {
    return {
      httpStatus: 503,
      body: {
        errorCode: "persist_failed",
      },
    };
  }
}
