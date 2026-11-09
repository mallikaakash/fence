import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);

export const INTENTGUARD_VERSION = (
  JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }
).version;
