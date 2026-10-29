/**
 * Where the FD judge's inputs come from. The same sources and env vars as the mock playground
 * (automation-mock-playground-service/src/fd/fd-config.ts), so the judge replays a run against
 * the same route table and spec the counterparty used.
 *
 * - Route table: env `FD_ROUTE_TABLE` (a path to fd_routes.yaml) or, failing that, the config
 *   service: `GET {CONFIG_SERVICE_URL}/api-service/fdRoutes?domain=&version=` → `{data: <table>}`.
 * - Spec: env `FD_SPEC`, a path to the FD OpenAPI YAML.
 * - Registry keys (to verify an issuer's quote signatures when the NP is the issuer): env
 *   `FD_REGISTRY_URL` (else `REGISTRY_URL`): `POST <url>/lookup {subscriber_id, ukId}`, as
 *   fd-gate does. Unset: no key lookup, so every quote signature is a finding (fail closed).
 * - Identity fallback: env `FD_SUBSCRIBER_ID` / `FD_SUBSCRIBER_URI`, used only when the recorded
 *   run holds no message the workbench sent.
 *
 * Every missing input is an `FdConfigError`: the FD report fails closed and names it.
 */
import axios from "axios";
import { readFile } from "fs/promises";
import { FdIdentity } from "./engine";

export class FdConfigError extends Error {
  constructor(message: string) {
    super(`[FD] ${message}`);
    this.name = "FdConfigError";
  }
}

const ROUTE_TABLE_TTL_MS = 10 * 60 * 1000;
const routeTableCache = new Map<string, { value: unknown; at: number }>();
let specText: Promise<string> | null = null;

/** The FD route table for a build: fd_routes.yaml text, or the table object from the config service. */
export async function fetchFdRouteTableSource(domain: string, version: string): Promise<unknown> {
  const override = process.env.FD_ROUTE_TABLE;
  const key = override ? `file:${override}` : `${domain}::${version}`;
  const hit = routeTableCache.get(key);
  if (hit && Date.now() - hit.at < ROUTE_TABLE_TTL_MS) return hit.value;

  let value: unknown;
  if (override) {
    try {
      value = await readFile(override, "utf8");
    } catch (e) {
      throw new FdConfigError(`cannot read the route table FD_ROUTE_TABLE=${override}: ${(e as Error).message}`);
    }
  } else {
    const base = process.env.CONFIG_SERVICE_URL;
    if (!base) throw new FdConfigError("no route table source: set CONFIG_SERVICE_URL or FD_ROUTE_TABLE");
    try {
      const res = await axios.get(`${base.replace(/\/$/, "")}/api-service/fdRoutes`, { params: { domain, version }, timeout: 10_000 });
      value = (res.data as { data?: unknown })?.data;
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      throw new FdConfigError(
        `the config service has no route table for ${domain} ${version} (GET ${base}/api-service/fdRoutes → ${status ?? (e as Error).message})`
      );
    }
    if (!value) throw new FdConfigError(`the config service returned an empty route table for ${domain} ${version}`);
  }
  routeTableCache.set(key, { value, at: Date.now() });
  return value;
}

/** The FD OpenAPI document as text, from env `FD_SPEC` (read once). */
export function readFdSpecSource(): Promise<string> {
  const path = process.env.FD_SPEC;
  if (!path) return Promise.reject(new FdConfigError("FD_SPEC is not set: point it at the FD OpenAPI YAML"));
  if (!specText) {
    specText = readFile(path, "utf8").catch((e) => {
      specText = null;
      throw new FdConfigError(`cannot read the FD spec FD_SPEC=${path}: ${(e as Error).message}`);
    });
  }
  return specText;
}

/** The workbench identity from env, when the run itself does not show it. */
export function fdIdentityFromEnv(): FdIdentity | undefined {
  const subscriberId = process.env.FD_SUBSCRIBER_ID;
  const subscriberUri = process.env.FD_SUBSCRIBER_URI;
  if (!subscriberId || !subscriberUri) return undefined;
  return { subscriberId, subscriberUri };
}

const KEY_TTL_MS = 10 * 60 * 1000;
const keyCache = new Map<string, { key: string; at: number }>();

/**
 * A Registry key lookup for quote signatures, or undefined when no registry is configured. A
 * failed lookup throws, so the engine reports the signature as unverified (fail closed); failures
 * are not cached.
 */
export function fdRegistryKeyLookup(): ((subscriberId: string, uniqueKeyId: string) => Promise<string>) | undefined {
  const url = process.env.FD_REGISTRY_URL || process.env.REGISTRY_URL;
  if (!url) return undefined;
  const endpoint = `${url.replace(/\/$/, "")}/lookup`;
  return async (subscriberId, uniqueKeyId) => {
    const cacheKey = `${subscriberId}|${uniqueKeyId}`;
    const hit = keyCache.get(cacheKey);
    if (hit && Date.now() - hit.at < KEY_TTL_MS) return hit.key;
    const res = await axios.post(endpoint, { subscriber_id: subscriberId, ukId: uniqueKeyId }, { timeout: 5_000 });
    const entries: unknown[] = Array.isArray(res.data) ? res.data : [];
    const keyOf = (e: unknown) => (e && typeof e === "object" ? (e as Record<string, unknown>) : {});
    const exact = entries.map(keyOf).find(
      (e) => typeof e.signing_public_key === "string" && (e.ukId === uniqueKeyId || e.unique_key_id === uniqueKeyId)
    );
    const any = entries.map(keyOf).find(
      (e) => typeof e.signing_public_key === "string" && e.ukId === undefined && e.unique_key_id === undefined
    );
    const key = (exact ?? any)?.signing_public_key;
    if (typeof key !== "string" || !key) throw new Error(`registry lookup: no signing key for ${cacheKey}`);
    keyCache.set(cacheKey, { key, at: Date.now() });
    return key;
  };
}

/** Test hook: forget cached sources and keys. */
export function resetFdConfigCacheForTests(): void {
  routeTableCache.clear();
  keyCache.clear();
  specText = null;
}
