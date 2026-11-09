export type LogLevel = "info" | "warn" | "error";

export function logJson(
  level: LogLevel,
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    service: "intentguard-gateway",
    ...fields,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}
