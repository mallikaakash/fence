import { writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";

/** Atomic JSON write: temp file in same dir, then rename. */
export function writeJsonAtomic(path: string, data: unknown): void {
  const dir = dirname(path);
  const tmp = join(dir, `.${path.split("/").pop()}.tmp`);
  const text = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, path);
}
