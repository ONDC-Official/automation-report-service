import { TestResult } from "../../../types/payload";
import { failureGate, tagGroupsByCode, tagValue } from "./onSearchB2BChecks";
import { validateGpsFormat, toMillis } from "./commonChecks";

// Business checks for ONDC:RETeB2B 1.2.5 `track` / `on_track`.
//
// ---------------------------------------------------------------------------
// WHERE THE RULES COME FROM
// ---------------------------------------------------------------------------
// NOT from the B2C prior art. log-validation-utility's Track/track.ts and Track/onTrack.ts
// are 75 and 74 lines and assert nothing domain-specific at all — only `checkContext`,
// city-vs-search and transaction-id continuity, every one of which this repo already runs
// for every action via contextValidators() / checkFlowContinuity() / the shared factory.
// There was nothing to port.
//
// The real source is L1: automation-specifications/config/validations/index.yaml,
// `on_track:` at line 4428. It describes a far richer payload than the prior art ever
// checked — tracking status, an `order` tag carrying the order id, a `config` tag declaring
// how tracking works, and a `path` polyline. Everything below is calibrated against the
// SIX eB2B flows that contain a track leg, and every rule holds on all six.
//
// ---------------------------------------------------------------------------
// CALIBRATION
// ---------------------------------------------------------------------------
// Ground truth, identical in all six flows:
//   tracking.id            "F1"                        (the FULFILLMENT id, not the order's)
//   tracking.status        "active"
//   tracking.url           https://snp.com/ondc/tracking/F1
//   tracking.location      { gps, time.timestamp, updated_at }
//   tags[order].id         the confirm order id         (e.g. "253678")
//   tags[config].attr      "tracking.location.gps"
//   tags[config].type      "live_poll"
//   tags[path] x3          { lat_lng, sequence 1|2|3 }
//
// TWO DELIBERATE DIVERGENCES FROM L1:
//
//  1. L1 enum-restricts `path.sequence` to ["1","2","3"]. That is not enforced here — a
//     three-point cap looks like an artifact of the sample payload rather than a real limit,
//     and a seller sending a longer polyline would be reporting MORE detail, not a defect.
//     What IS enforced is that the sequence numbers are unique and contiguous from 1, which
//     is what makes a polyline orderable and holds on all six flows. L1 still applies its
//     enum independently.
//  2. A `message_id` pairing check between `track` and `on_track` is NOT added, even though
//     it holds on all six flows. One was removed from shared/flowContinuityValidators.ts:28
//     at explicit request ("not needed for this domain").
//
// Like L1's own `_CONTINUE_: "(error_type are present)"` gate, every tracking check is
// skipped when the callback carries an `error` — an NP that cannot track is answering with
// an error, not with a malformed tracking object.

const TRACKING_STATUSES = ["active", "inactive"];
const CONFIG_TYPES = ["live_poll", "deferred"];
const URL_RE = /^https?:\/\/[^\s]+$/;

function isAbsent(value: any): boolean {
  return value === undefined || value === null;
}

/** Every `path` tag group, in payload order. */
function pathGroups(tracking: any): any[] {
  return tagGroupsByCode(tracking?.tags, "path");
}

/**
 * `track` is a one-field request: `message.order_id`. It must name the order the flow
 * actually created, which is what makes it more than a presence check.
 *
 * L1 additionally pattern-checks the id (`^[a-zA-Z0-9-]{1,32}$|UUID`, via the shared
 * STATUS_ORDER anchor), so that is not repeated here.
 */
export function validateTrackRequest(
  message: any,
  storedOrderId: any,
  result: TestResult
): void {
  const orderId = message?.order_id;
  if (isAbsent(orderId) || !String(orderId).trim()) {
    result.failed.push("track: message.order_id is required");
    return;
  }

  if (isAbsent(storedOrderId)) {
    // No confirm captured for this flow — presence is all that can be judged.
    result.passed.push(`track: message.order_id '${orderId}' is present`);
    return;
  }

  if (String(orderId) !== String(storedOrderId)) {
    result.failed.push(
      `track: message.order_id '${orderId}' does not match the order '${storedOrderId}' created at confirm`
    );
    return;
  }

  result.passed.push(`track: message.order_id '${orderId}' matches the order created at confirm`);
}

/**
 * The tracking object's own fields: a fulfillment id, a status the buyer app can act on, and
 * a well-formed location/url when one is given.
 *
 * `tracking.id` is the FULFILLMENT id (`F1`), not the order id — the order id travels in the
 * `order` tag instead (see `validateTrackingTags`). Both are checked against what the flow
 * already established.
 */
export function validateTrackingObject(
  tracking: any,
  context: any,
  storedFulfillmentIds: string[],
  result: TestResult
): void {
  const cleanRun = failureGate(result);

  if (isAbsent(tracking?.id) || !String(tracking.id).trim()) {
    result.failed.push("on_track: message.tracking.id is required (the fulfillment being tracked)");
  } else if (storedFulfillmentIds.length > 0 && !storedFulfillmentIds.includes(String(tracking.id))) {
    result.failed.push(
      `on_track: tracking.id '${tracking.id}' is not one of the fulfillments quoted in on_select (${storedFulfillmentIds.join(", ")})`
    );
  }

  if (isAbsent(tracking?.status)) {
    result.failed.push(`on_track: message.tracking.status is required (one of ${TRACKING_STATUSES.join(", ")})`);
  } else if (!TRACKING_STATUSES.includes(String(tracking.status))) {
    result.failed.push(
      `on_track: message.tracking.status '${tracking.status}' is not one of ${TRACKING_STATUSES.join(", ")}`
    );
  }

  if (!isAbsent(tracking?.url) && !URL_RE.test(String(tracking.url))) {
    result.failed.push(`on_track: message.tracking.url '${tracking.url}' is not a valid http(s) URL`);
  }

  const location = tracking?.location;
  if (location) {
    if (!isAbsent(location.gps)) {
      validateGpsFormat(location.gps, "on_track.tracking.location", result);
    }
    const callMs = toMillis(context?.timestamp);
    for (const [path, raw] of [
      ["location.time.timestamp", location.time?.timestamp],
      ["location.updated_at", location.updated_at],
    ] as const) {
      if (isAbsent(raw)) continue;
      const stamp = toMillis(raw);
      if (stamp === null) {
        result.failed.push(`on_track: message.tracking.${path} '${raw}' is not a valid timestamp`);
      } else if (callMs !== null && stamp > callMs) {
        result.failed.push(
          `on_track: message.tracking.${path} '${raw}' is after context.timestamp '${context?.timestamp}' — a location cannot be observed after the call reporting it`
        );
      }
    }
  }

  if (cleanRun()) {
    result.passed.push(
      `on_track: tracking for fulfillment '${tracking?.id}' is coherent (status '${tracking?.status}', location, url)`
    );
  }
}

/**
 * The `order` and `config` tags.
 *
 * `order.id` is the one cross-call anchor on this leg: the tracking object must be about the
 * order the flow created, not some other one. It carries the confirm order id in all six
 * flows.
 *
 * `config` declares HOW tracking works — `attr` names the field that carries the live value
 * and `type` is `live_poll` or `deferred`. That distinction drives
 * `validateLivePollCompleteness` below, which is why the enum is enforced here rather than
 * being left to L1: an unrecognised type would silently disable that check.
 */
export function validateTrackingTags(
  tracking: any,
  storedOrderId: any,
  result: TestResult
): void {
  const cleanRun = failureGate(result);

  const orderGroup = tagGroupsByCode(tracking?.tags, "order")[0];
  if (!orderGroup) {
    result.failed.push("on_track: message.tracking.tags is missing the required 'order' tag group");
  } else {
    const taggedOrderId = tagValue(orderGroup.list, "id");
    if (isAbsent(taggedOrderId) || !String(taggedOrderId).trim()) {
      result.failed.push("on_track: tracking.tags 'order' group is missing its 'id'");
    } else if (!isAbsent(storedOrderId) && String(taggedOrderId) !== String(storedOrderId)) {
      result.failed.push(
        `on_track: tracking.tags.order.id '${taggedOrderId}' is not the order '${storedOrderId}' created at confirm`
      );
    }
  }

  const configGroup = tagGroupsByCode(tracking?.tags, "config")[0];
  if (!configGroup) {
    result.failed.push("on_track: message.tracking.tags is missing the required 'config' tag group");
  } else {
    if (isAbsent(tagValue(configGroup.list, "attr"))) {
      result.failed.push("on_track: tracking.tags 'config' group is missing 'attr' (which field carries the live value)");
    }
    const type = tagValue(configGroup.list, "type");
    if (isAbsent(type)) {
      result.failed.push(`on_track: tracking.tags config.type is required (one of ${CONFIG_TYPES.join(", ")})`);
    } else if (!CONFIG_TYPES.includes(String(type))) {
      result.failed.push(
        `on_track: tracking.tags config.type '${type}' is not one of ${CONFIG_TYPES.join(", ")}`
      );
    }
  }

  if (cleanRun()) {
    result.passed.push("on_track: tracking tags declare the order and a valid tracking config");
  }
}

/**
 * The `path` polyline: each point needs a parseable `lat_lng` and a `sequence`, and the
 * sequence numbers must be unique and contiguous from 1 — otherwise the points cannot be
 * ordered into a path, which is the only thing they are for.
 *
 * NOT enum-restricted to 1/2/3 as L1 does; see the module header for why.
 */
export function validateTrackingPath(tracking: any, result: TestResult): void {
  const groups = pathGroups(tracking);
  if (groups.length === 0) return;

  const cleanRun = failureGate(result);
  const sequences: number[] = [];

  groups.forEach((group: any, index: number) => {
    const ref = `tracking.tags path[${index}]`;

    const latLng = tagValue(group.list, "lat_lng");
    if (isAbsent(latLng)) {
      result.failed.push(`on_track: ${ref} is missing 'lat_lng'`);
    } else {
      validateGpsFormat(latLng, `on_track.${ref}.lat_lng`, result);
    }

    const sequence = tagValue(group.list, "sequence");
    if (isAbsent(sequence)) {
      result.failed.push(`on_track: ${ref} is missing 'sequence'`);
      return;
    }
    const n = Number(sequence);
    if (!Number.isInteger(n) || n < 1) {
      result.failed.push(`on_track: ${ref} sequence '${sequence}' must be a positive integer`);
      return;
    }
    sequences.push(n);
  });

  if (sequences.length === groups.length && sequences.length > 0) {
    const sorted = [...sequences].sort((a, b) => a - b);
    const duplicate = sorted.find((v, i) => i > 0 && v === sorted[i - 1]);
    if (duplicate !== undefined) {
      result.failed.push(`on_track: tracking path has two points with sequence ${duplicate} — the path cannot be ordered`);
    } else if (sorted.some((v, i) => v !== i + 1)) {
      result.failed.push(
        `on_track: tracking path sequences [${sorted.join(", ")}] are not contiguous from 1 — the path has gaps`
      );
    }
  }

  if (cleanRun()) {
    result.passed.push(`on_track: tracking path has ${groups.length} ordered point(s) with valid coordinates`);
  }
}

/**
 * `config.type: live_poll` is a promise that the location fields hold a current, pollable
 * position — so L1 requires `location.gps`, `location.time.timestamp` and
 * `location.updated_at`, plus the `path`, only in that case. A `deferred` tracker may
 * legitimately send none of them and point at the `url` instead.
 *
 * All six reference flows declare `live_poll` and satisfy every clause, so the `deferred`
 * branch is implemented from L1's gating rather than from a payload — it is why this skips
 * silently rather than requiring the fields unconditionally.
 */
export function validateLivePollCompleteness(tracking: any, result: TestResult): void {
  const configGroup = tagGroupsByCode(tracking?.tags, "config")[0];
  if (String(tagValue(configGroup?.list, "type")) !== "live_poll") return;

  const cleanRun = failureGate(result);

  const location = tracking?.location;
  if (!location) {
    result.failed.push("on_track: config.type is 'live_poll' but message.tracking.location is missing");
  } else {
    for (const [label, value] of [
      ["location.gps", location.gps],
      ["location.time.timestamp", location.time?.timestamp],
      ["location.updated_at", location.updated_at],
    ] as const) {
      if (isAbsent(value)) {
        result.failed.push(`on_track: config.type is 'live_poll' but message.tracking.${label} is missing`);
      }
    }
  }

  if (pathGroups(tracking).length === 0) {
    result.failed.push("on_track: config.type is 'live_poll' but tracking.tags carries no 'path' point");
  }

  if (cleanRun()) {
    result.passed.push("on_track: live_poll tracking carries a complete location and path");
  }
}
