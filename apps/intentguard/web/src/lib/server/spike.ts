import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve `apps/intentguard/.spike` from the web app. */
export function spikeDir(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../.spike",
  );
}

export function readSpikeJson<T>(name: string): T | null {
  const local = path.join(spikeDir(), name);
  if (existsSync(local)) {
    return JSON.parse(readFileSync(local, "utf8")) as T;
  }
  const bundled = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../public/spike",
    name,
  );
  if (existsSync(bundled)) {
    return JSON.parse(readFileSync(bundled, "utf8")) as T;
  }
  return null;
}
