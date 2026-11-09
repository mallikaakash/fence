import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeJsonAtomic } from "./persist.ts";

describe("writeJsonAtomic", () => {
  it("writes readable json", () => {
    const dir = mkdtempSync(join(tmpdir(), "ig-persist-"));
    const path = join(dir, "state.json");
    writeJsonAtomic(path, { ok: true, n: 1 });
    const raw = JSON.parse(readFileSync(path, "utf8")) as { ok: boolean };
    assert.equal(raw.ok, true);
    rmSync(dir, { recursive: true, force: true });
  });
});
