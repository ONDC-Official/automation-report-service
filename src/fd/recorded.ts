/**
 * Reading what the recorder stored for an FD run.
 *
 * One DB payload is one HTTP exchange (automation-recorder-service side_effects.go):
 * - `jsonRequest`: the body sent. For an NP's GET read, fd-gate's internal frame:
 *   `{context, fdEnvelope, message: {pathParams, query}}`, since the NP sent no body;
 * - `jsonResponse`: `{response: <the HTTP answer's body>}`;
 * - `httpStatus`: the answer's status;
 * - `reqHeader`: the request headers as a JSON string. fd-gate's internal headers say which REST
 *   call it was: `X-Pwb-Fd-Method`, `X-Pwb-Fd-Path` (np mode: the NP called the workbench),
 *   `X-Pwb-Fd-Route`, `X-Pwb-Fd-Path-Params`, `X-Pwb-Fd-Replay`; `X-Pwb-Internal-Key` marks a
 *   message the workbench's mock sent;
 * - `createdAt`: when it was recorded; `messageId`, `action`, `flowId`, `transactionId`;
 * - `durationMs` (FD only, when network-observability measured it): how long the module took to
 *   answer the exchange, in milliseconds. For a call the workbench made to the NP it is the NP's
 *   answer time plus the workbench's own small overhead (signing, transport); for a call the NP
 *   made it measures the workbench.
 */
import { FD_HEADERS } from "./constants";

/** A DB payload, as `POST /payload/ids` returns it. Every field is read defensively. */
export interface FdRecordedPayload {
  payloadId?: string;
  messageId?: string;
  transactionId?: string;
  flowId?: string;
  action?: string;
  reqHeader?: unknown;
  jsonRequest?: unknown;
  jsonResponse?: unknown;
  httpStatus?: unknown;
  createdAt?: string;
  durationMs?: unknown;
}

export interface FdRecord {
  /** Position in the original list, to keep the sort stable. */
  original: number;
  payloadId: string;
  recordedAt: string;
  recordedMs: number;
  request: Record<string, unknown> | undefined;
  /** The answer's body, or undefined when none was recorded (or it was not a JSON object). */
  response: Record<string, unknown> | undefined;
  httpStatus?: number;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  /** The request's `context.action`, else the payload's `action`. */
  bodyAction?: string;
  messageId?: string;
  /** A callback's `fdEnvelope.inReplyTo`. */
  inReplyTo?: string;
  transactionId?: string;
  /** The recorded answer time in ms: a finite, non-negative number, else absent. */
  durationMs?: number;
  /** The request's `context.ttl`. */
  ttl?: string;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/** `reqHeader` (a JSON string, or an object) → lower-cased names → the first value. */
export function parseHeaders(raw: unknown): Record<string, string> {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [name, v] of Object.entries(value)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string") out[name.toLowerCase()] = first;
    else if (typeof first === "number" || typeof first === "boolean") out[name.toLowerCase()] = String(first);
  }
  return out;
}

export function header(record: FdRecord, name: string): string | undefined {
  return record.headers[name.toLowerCase()];
}

/** The answer body: the recorder wraps it as `{response: …}`. */
function responseOf(jsonResponse: unknown): Record<string, unknown> | undefined {
  const inner = isRecord(jsonResponse) && "response" in jsonResponse ? jsonResponse.response : jsonResponse;
  if (!isRecord(inner) || Object.keys(inner).length === 0) return undefined;
  return inner;
}

export function readRecord(p: FdRecordedPayload, original: number): FdRecord {
  const request = isRecord(p.jsonRequest) ? p.jsonRequest : undefined;
  const context = isRecord(request?.context) ? (request?.context as Record<string, unknown>) : {};
  const envelope = isRecord(request?.fdEnvelope) ? (request?.fdEnvelope as Record<string, unknown>) : {};
  const recordedMs = Date.parse(String(p.createdAt ?? ""));
  const status = typeof p.httpStatus === "number" ? p.httpStatus : Number.parseInt(String(p.httpStatus ?? ""), 10);
  const out: FdRecord = {
    original,
    payloadId: str(p.payloadId) ?? `payload-${original}`,
    recordedAt: str(p.createdAt) ?? "",
    recordedMs: Number.isNaN(recordedMs) ? Number.NaN : recordedMs,
    request,
    response: responseOf(p.jsonResponse),
    headers: parseHeaders(p.reqHeader),
  };
  if (Number.isInteger(status) && status > 0) out.httpStatus = status;
  const bodyAction = str(context.action) ?? str(p.action)?.toLowerCase();
  if (bodyAction) out.bodyAction = bodyAction;
  const messageId = str(context.message_id) ?? str(p.messageId);
  if (messageId) out.messageId = messageId;
  const inReplyTo = str(envelope.inReplyTo);
  if (inReplyTo) out.inReplyTo = inReplyTo;
  const transactionId = str(context.transaction_id) ?? str(p.transactionId);
  if (transactionId) out.transactionId = transactionId;
  const duration = typeof p.durationMs === "number" ? p.durationMs : typeof p.durationMs === "string" ? Number(p.durationMs) : Number.NaN;
  if (Number.isFinite(duration) && duration >= 0) out.durationMs = duration;
  const ttl = str(context.ttl);
  if (ttl) out.ttl = ttl;
  return out;
}

/**
 * Orders a flow's records by recorded time (stable). Then one correction, for recording latency
 * only: the recorder writes an exchange after its answer, so a callback can be recorded just
 * before the request it answers. A callback whose `inReplyTo` names a request recorded later in
 * the same flow is moved to just after that request. Nothing else is reordered.
 */
export function orderRecords(records: FdRecord[]): FdRecord[] {
  const sorted = [...records].sort((a, b) => {
    const ta = Number.isNaN(a.recordedMs) ? Number.POSITIVE_INFINITY : a.recordedMs;
    const tb = Number.isNaN(b.recordedMs) ? Number.POSITIVE_INFINITY : b.recordedMs;
    return ta - tb || a.original - b.original;
  });
  const moved = new Set<FdRecord>();
  for (let i = 0; i < sorted.length; i++) {
    const callback = sorted[i] as FdRecord;
    if (!callback.inReplyTo || moved.has(callback)) continue;
    // Already preceded by its request (a later repeat of the request is not a reason to move it).
    if (sorted.slice(0, i).some((r) => r.messageId === callback.inReplyTo)) continue;
    const j = sorted.findIndex((r, k) => k > i && r.messageId === callback.inReplyTo);
    if (j < 0) continue;
    sorted.splice(i, 1);
    sorted.splice(j, 0, callback); // just after the request, which moved up by one
    moved.add(callback);
    i--;
  }
  return sorted;
}

/** Path parameters: `X-Pwb-Fd-Path-Params`, else a GET frame's `message.pathParams`. */
export function pathParamsOf(record: FdRecord): Record<string, string> | undefined {
  const raw = header(record, FD_HEADERS.pathParams);
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (isRecord(v)) {
        const out: Record<string, string> = {};
        for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
        return out;
      }
    } catch {
      // fall through to the body
    }
  }
  const message = isRecord(record.request?.message) ? (record.request?.message as Record<string, unknown>) : undefined;
  if (isRecord(message?.pathParams)) {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(message?.pathParams as Record<string, unknown>)) if (typeof val === "string") out[k] = val;
    return out;
  }
  return undefined;
}

/** A GET frame's `message.query`. */
export function queryOf(record: FdRecord): Record<string, string> | undefined {
  const message = isRecord(record.request?.message) ? (record.request?.message as Record<string, unknown>) : undefined;
  if (!isRecord(message?.query)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(message?.query as Record<string, unknown>)) if (typeof val === "string") out[k] = val;
  return out;
}
