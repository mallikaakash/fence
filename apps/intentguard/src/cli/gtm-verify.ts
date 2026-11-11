#!/usr/bin/env node
/**
 * Product / GTM static checks — routes, canonical copy, setup→dashboard journey wiring.
 * Does not exercise wallets, grants, or live gateway (see limitations in gtmVerifyChecks.ts).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertGtmVerifyOk } from "./gtmVerifyChecks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = join(root, "../..");

const count = assertGtmVerifyOk({ root, repoRoot });
console.log(`OK gtm-verify: ${count} checks (setup → dashboard → trade → audit paths)`);
