import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { GcsLivePreflightError } from "./gcsLivePreflight.ts";

/** Matches google-auth-library `IMPERSONATED_ACCOUNT_TYPE`. */
export const ADC_TYPE_IMPERSONATED = "impersonated_service_account" as const;
export const ADC_TYPE_AUTHORIZED_USER = "authorized_user" as const;
export const ADC_TYPE_SERVICE_ACCOUNT = "service_account" as const;

const IMPERSONATION_URL_TARGET_RE =
  /(?<target>[^/]+):(generateAccessToken|generateIdToken)$/;

export type ParsedAdcIdentity =
  | { mode: "impersonated"; targetPrincipal: string }
  | { mode: "service_account"; clientEmail: string }
  | { mode: "authorized_user"; account?: string }
  | { mode: "malformed"; reason: string };

export type AdcFileSnapshot = {
  path: string;
  json: unknown;
};

export type GoogleAuthHandle = {
  getClient: () => Promise<unknown>;
  getCredentials: () => Promise<{ client_email?: string }>;
};

export type AdcIdentityResolverDeps = {
  createGoogleAuth?: () => Promise<GoogleAuthHandle>;
  readAdcFile?: () => Promise<AdcFileSnapshot | null>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extract impersonation target from IAM Credentials URL (same regex as google-auth-library).
 */
export function extractTargetPrincipalFromImpersonationUrl(
  url: string,
): string | null {
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 256) {
    return null;
  }
  const match = IMPERSONATION_URL_TARGET_RE.exec(trimmed);
  return match?.groups?.target?.trim() ?? null;
}

export function parseAdcJsonForIdentity(json: unknown): ParsedAdcIdentity {
  if (!isRecord(json)) {
    return { mode: "malformed", reason: "ADC JSON is not an object" };
  }
  const type = typeof json.type === "string" ? json.type.trim() : "";

  if (type === ADC_TYPE_AUTHORIZED_USER) {
    const account =
      typeof json.account === "string" && json.account.trim() !== ""
        ? json.account.trim()
        : undefined;
    return { mode: "authorized_user", account };
  }

  if (type === ADC_TYPE_IMPERSONATED) {
    const url = json.service_account_impersonation_url;
    if (typeof url !== "string" || url.trim() === "") {
      return {
        mode: "malformed",
        reason: "impersonated ADC missing service_account_impersonation_url",
      };
    }
    if (!isRecord(json.source_credentials)) {
      return {
        mode: "malformed",
        reason: "impersonated ADC missing source_credentials",
      };
    }
    const targetPrincipal = extractTargetPrincipalFromImpersonationUrl(url);
    if (!targetPrincipal) {
      return {
        mode: "malformed",
        reason: "cannot parse target principal from service_account_impersonation_url",
      };
    }
    return { mode: "impersonated", targetPrincipal };
  }

  if (type === ADC_TYPE_SERVICE_ACCOUNT) {
    const clientEmail =
      typeof json.client_email === "string" ? json.client_email.trim() : "";
    if (!clientEmail) {
      return { mode: "malformed", reason: "service_account ADC missing client_email" };
    }
    return { mode: "service_account", clientEmail };
  }

  if (type === "") {
    return { mode: "malformed", reason: "ADC JSON missing type" };
  }

  return { mode: "malformed", reason: `unsupported ADC type: ${type}` };
}

export async function readDefaultAdcFile(): Promise<AdcFileSnapshot | null> {
  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const paths = explicit
    ? [explicit]
    : [join(homedir(), ".config", "gcloud", "application_default_credentials.json")];

  for (const path of paths) {
    try {
      const raw = await readFile(path, "utf8");
      const json = JSON.parse(raw) as unknown;
      return { path, json };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        continue;
      }
      throw new GcsLivePreflightError(
        `Cannot read ADC file at ${path}: ${code ?? "parse error"}`,
      );
    }
  }
  return null;
}

async function defaultCreateGoogleAuth(): Promise<GoogleAuthHandle> {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/devstorage.read_only"],
  });
  return {
    getClient: () => auth.getClient(),
    getCredentials: () => auth.getCredentials(),
  };
}

function readPrincipalFromAuthClient(client: unknown): string | null {
  if (!client || typeof client !== "object") {
    return null;
  }
  const withTarget = client as { getTargetPrincipal?: () => string };
  if (typeof withTarget.getTargetPrincipal === "function") {
    const principal = withTarget.getTargetPrincipal()?.trim();
    return principal || null;
  }
  return null;
}

/**
 * Resolve the effective service account identity for live GCS tests.
 * Uses google-auth-library client metadata first, with ADC file cross-check when present.
 */
export async function resolveAdcServiceAccountIdentity(
  deps: AdcIdentityResolverDeps = {},
): Promise<string | null> {
  let filePrincipal: string | null = null;

  const readAdc = deps.readAdcFile ?? readDefaultAdcFile;
  const adcFile = await readAdc();

  if (adcFile) {
    const parsed = parseAdcJsonForIdentity(adcFile.json);
    switch (parsed.mode) {
      case "authorized_user":
        throw new GcsLivePreflightError(
          parsed.account
            ? `Personal user OAuth ADC is not permitted (authorized_user: ${parsed.account})`
            : "Personal user OAuth ADC is not permitted (authorized_user ADC lacks a service account identity)",
        );
      case "impersonated":
        filePrincipal = parsed.targetPrincipal;
        break;
      case "service_account":
        filePrincipal = parsed.clientEmail;
        break;
      case "malformed":
        throw new GcsLivePreflightError(
          `Malformed ADC configuration (${adcFile.path}): ${parsed.reason}`,
        );
    }
  }

  let sdkPrincipal: string | null = null;
  let sdkImpersonated = false;

  try {
    const createAuth = deps.createGoogleAuth ?? defaultCreateGoogleAuth;
    const auth = await createAuth();
    const client = await auth.getClient();

    const fromClient = readPrincipalFromAuthClient(client);
    if (fromClient) {
      sdkPrincipal = fromClient;
      sdkImpersonated = true;
    }

    try {
      const creds = await auth.getCredentials();
      const fromCreds = creds.client_email?.trim();
      if (fromCreds) {
        if (sdkPrincipal && sdkPrincipal !== fromCreds) {
          throw new GcsLivePreflightError(
            `ADC identity mismatch: getTargetPrincipal "${sdkPrincipal}" vs getCredentials().client_email "${fromCreds}"`,
          );
        }
        sdkPrincipal = sdkPrincipal ?? fromCreds;
      }
    } catch (err) {
      if (err instanceof GcsLivePreflightError) {
        throw err;
      }
      if (!sdkPrincipal) {
        throw err;
      }
    }

    if (
      filePrincipal &&
      sdkPrincipal &&
      filePrincipal !== sdkPrincipal
    ) {
      throw new GcsLivePreflightError(
        `ADC file principal "${filePrincipal}" does not match SDK-resolved principal "${sdkPrincipal}"`,
      );
    }

    if (adcFile) {
      const parsed = parseAdcJsonForIdentity(adcFile.json);
      if (parsed.mode === "impersonated" && !sdkImpersonated) {
        throw new GcsLivePreflightError(
          "ADC file declares impersonated_service_account but google-auth-library did not load an Impersonated client (credentials unverifiable)",
        );
      }
    }
  } catch (err) {
    if (err instanceof GcsLivePreflightError) {
      throw err;
    }
    if (filePrincipal && adcFile) {
      const parsed = parseAdcJsonForIdentity(adcFile.json);
      if (parsed.mode === "impersonated") {
        throw new GcsLivePreflightError(
          `Cannot verify impersonated ADC via google-auth-library: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return null;
  }

  return sdkPrincipal ?? filePrincipal;
}
