import { readFileSync, existsSync } from "node:fs";
import { writeJsonAtomic } from "./persist.ts";
import { join } from "node:path";
import type { GatewaySession } from "../gateway/session.ts";
import type { AuditEvent } from "../gateway/audit.ts";

export type PersistedState = {
  version: 1;
  updatedAt: string;
  sessions: GatewaySession[];
  audit: AuditEvent[];
};

export class FileStore {
  readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, "state.json");
  }

  load(): PersistedState {
    if (!existsSync(this.path)) {
      return {
        version: 1,
        updatedAt: new Date().toISOString(),
        sessions: [],
        audit: [],
      };
    }
    return JSON.parse(readFileSync(this.path, "utf8")) as PersistedState;
  }

  save(state: PersistedState): void {
    state.updatedAt = new Date().toISOString();
    writeJsonAtomic(this.path, state);
  }
}
