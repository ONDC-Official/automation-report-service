/**
 * The ONE place the report service touches the FD engine, `@ondc/fd-contract` (M2-DESIGN §7).
 *
 * The rest of the FD judge uses the types and functions below. If the engine's API changes, only
 * this file should need to.
 *
 * Mapping to the engine:
 * - the package is loaded lazily with `require("@ondc/fd-contract")` (its CommonJS build) on the
 *   first FD report, never at startup, so a missing or unbuilt package fails that FD report closed
 *   with `FdEngineUnavailableError` and never affects Beckn reports;
 * - `prepareFdJudgeKit({spec, routes})` parses the spec once (`parseSpec`), loads the route table
 *   once (`loadRouteTable`, which fails closed on a bad `tableHash`) and builds the requirement map
 *   from it (`requirementMapFromRoutes`);
 * - `kit.createEngine({role, identity, clock, keyLookup})` calls `createEngine` with that spec and
 *   route index. The judge creates one engine per flow, with a clock that reads the recorded time
 *   of the message being replayed, so expiry checks see the time of the run, not of the report;
 * - the judge then drives `initialState`, `observe` and `sent`, exactly as the playground does
 *   when it plays the counterparty, and reads the ledger (`state.engine.messages`).
 */
import { randomBytes } from "crypto";

// ── The engine's API, as the judge uses it ─────────────────────────────────

/** The role the WORKBENCH played; the NP under test played the counterpart. */
export type FdEngineRole = "DEPOSIT_ISSUER" | "INVESTOR_APP";

/** The engine's `Finding`. */
export interface FdFinding {
  requirementIds: string[];
  rule: string;
  detail: string;
  errorCode?: string;
  fieldPath?: string;
  messageId?: string;
  action?: string;
  reference?: string;
}

/** One route-table entry (FD-ROUTE-TABLE.md). */
export interface FdRoute {
  action: string;
  kind: "request" | "callback" | "webhook";
  method: "GET" | "POST";
  path: string;
  pathParams: string[];
  mode: "SYNC" | "ASYNC_ACK_CALLBACK" | "WEBHOOK";
  caller: string;
  callee: string;
  callback: string | null;
  inReplyTo: string | null;
  hasBody: boolean;
  requirements: string[];
}

export interface FdRouteIndex {
  table: { domain: string; version: string; tableHash: string; routes: FdRoute[] };
  find(action: string): FdRoute | undefined;
  match(method: string, path: string): { route: FdRoute; params: Record<string, string> } | undefined;
}

export interface FdRequirementMap {
  readonly requirementIds: readonly string[];
  hasAction(action: string): boolean;
  requirementsFor(action: string, opts?: { inheritFromRequest?: boolean }): string[];
}

export interface FdIdentity {
  subscriberId: string;
  subscriberUri: string;
  signingPrivateKey?: string;
  uniqueKeyId?: string;
}

export interface FdInbound {
  body: unknown;
  action: string;
  method?: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  httpStatus?: number;
  receivedAt?: string;
  requestMessageId?: string;
}

export interface FdSentMessage {
  action: string;
  body: unknown;
  pathParams?: Record<string, string>;
  answering?: string;
  httpStatus?: number;
  replay?: boolean;
}

/** One entry of the engine's ledger (`state.engine.messages`). */
export interface FdMessageRecord {
  seq: number;
  direction: "in" | "out";
  action: string;
  leg: "request" | "response";
  messageId: string | null;
  inReplyTo?: string;
  httpStatus?: number;
  replayOf?: number;
  verdict?: { accepted: boolean; error?: { code: string; message: string } };
  expectError?: string;
}

/** The session state. Opaque to the judge, except the ledger it reads. */
export interface FdState {
  transactionId: string | null;
  engine: { messages: FdMessageRecord[]; findings: FdFinding[] };
}

export interface FdObserveResult {
  state: FdState;
  findings: FdFinding[];
  replayOf?: string;
}

export interface FdEngine {
  initialState(transactionId?: string | null): FdState;
  observe(state: FdState, inbound: FdInbound): Promise<FdObserveResult>;
  sent(state: FdState, message: FdSentMessage): FdState;
}

interface EngineConfig {
  spec: unknown;
  routes: unknown;
  identity: FdIdentity;
  role: FdEngineRole;
  clock: () => Date;
  keyLookup?: (subscriberId: string, uniqueKeyId: string) => Promise<string>;
}

interface FdContractModule {
  createEngine(cfg: EngineConfig): FdEngine;
  loadRouteTable(input: unknown): FdRouteIndex;
  requirementMapFromRoutes(source: unknown): FdRequirementMap;
  parseSpec(input: unknown): unknown;
  isAcknowledgement(body: unknown): boolean;
}

// ── Loading ─────────────────────────────────────────────────────────────────

/** The engine could not be loaded or set up: the FD report fails closed, naming the cause. */
export class FdEngineUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(
      `[FD] the FD engine (@ondc/fd-contract) is unavailable: ${message}` +
        (cause instanceof Error ? ` (${cause.message})` : "")
    );
    this.name = "FdEngineUnavailableError";
  }
}

const defaultLoader = (): unknown => {
  // Loaded on first FD use, never at startup: Beckn reports must not depend on it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@ondc/fd-contract");
};

let loader: () => unknown = defaultLoader;
let contract: FdContractModule | null = null;

const REQUIRED_EXPORTS = [
  "createEngine",
  "loadRouteTable",
  "requirementMapFromRoutes",
  "parseSpec",
  "isAcknowledgement",
] as const;

export function loadFdContract(): FdContractModule {
  if (contract) return contract;
  let mod: Record<string, unknown>;
  try {
    mod = loader() as Record<string, unknown>;
  } catch (e) {
    throw new FdEngineUnavailableError(
      'require("@ondc/fd-contract") failed; install it and build its CommonJS output (npm run build in automation-fd-contract)',
      e
    );
  }
  const missing = REQUIRED_EXPORTS.filter((name) => typeof mod?.[name] !== "function");
  if (missing.length > 0) {
    throw new FdEngineUnavailableError(`the package does not export ${missing.join(", ")}`);
  }
  contract = mod as unknown as FdContractModule;
  return contract;
}

/** The engine package's version, for the certificate's `toolVersions`. */
export function fdContractVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require("@ondc/fd-contract/package.json") as { version?: unknown };
    return typeof pkg.version === "string" && pkg.version ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

/** Test hook: replace how the package is loaded (null restores `require`), and forget the loaded one. */
export function setFdContractLoaderForTests(next: (() => unknown) | null): void {
  loader = next ?? defaultLoader;
  contract = null;
}

// ── The judge kit ───────────────────────────────────────────────────────────

export interface FdJudgeKit {
  readonly routes: FdRouteIndex;
  readonly requirements: FdRequirementMap;
  readonly domain: string;
  readonly version: string;
  /** The `tableHash` of the route table the engine loaded. */
  readonly tableHash: string;
  readonly contractVersion: string;
  /** A fresh engine for one judged flow. */
  createEngine(opts: {
    role: FdEngineRole;
    identity: FdIdentity;
    clock: () => Date;
    keyLookup?: (subscriberId: string, uniqueKeyId: string) => Promise<string>;
  }): FdEngine;
  isAcknowledgement(body: unknown): boolean;
}

/**
 * Loads the engine and prepares what every judged flow shares: the parsed spec, the route table
 * (fail-closed: `loadRouteTable` throws on a hash mismatch) and the requirement map.
 */
export function prepareFdJudgeKit(sources: { spec: unknown; routes: unknown }): FdJudgeKit {
  const mod = loadFdContract();
  let spec: unknown;
  let routes: FdRouteIndex;
  let requirements: FdRequirementMap;
  try {
    spec = mod.parseSpec(sources.spec);
    routes = mod.loadRouteTable(sources.routes);
    requirements = mod.requirementMapFromRoutes(routes);
  } catch (e) {
    throw new FdEngineUnavailableError("the FD spec or route table could not be loaded", e);
  }
  const contractVersion = fdContractVersion();
  return {
    routes,
    requirements,
    domain: routes.table.domain,
    version: routes.table.version,
    tableHash: routes.table.tableHash,
    contractVersion,
    createEngine({ role, identity, clock, keyLookup }) {
      const cfg: EngineConfig = { spec, routes, identity: judgeIdentity(role, identity), role, clock };
      if (keyLookup) cfg.keyLookup = keyLookup;
      return mod.createEngine(cfg);
    },
    isAcknowledgement: (body) => mod.isAcknowledgement(body),
  };
}

/**
 * `createEngine` refuses the issuer role without a signing key, because the issuer signs the
 * quotes it drafts. The judge never drafts, so a key it was not given is an ephemeral, random one
 * that signs nothing.
 */
function judgeIdentity(role: FdEngineRole, identity: FdIdentity): FdIdentity {
  if (role !== "DEPOSIT_ISSUER" || (identity.signingPrivateKey && identity.uniqueKeyId)) return identity;
  return {
    ...identity,
    signingPrivateKey: identity.signingPrivateKey ?? randomBytes(32).toString("base64"),
    uniqueKeyId: identity.uniqueKeyId ?? "pwb-report-judge",
  };
}
