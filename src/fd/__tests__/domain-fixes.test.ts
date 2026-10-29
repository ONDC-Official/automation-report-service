/**
 * The two-colon domain problems (plan §6.14): specLoader read "ONDC:FIS14:FD" as "FD", and the
 * shared ACK schema rejected any domain with two colons. Beckn readings must not change.
 */
import { saveSpecDomainKey } from "../../utils/specLoader";
import { validateJsonResponse } from "../../validations/shared/schemaValidator";

describe("saveSpecDomainKey", () => {
  it.each([
    ["ONDC:TRV11", "TRV11"],
    ["ONDC:FIS12", "FIS12"],
    ["nic2004:60232", "60232"],
    ["ONDC", "ONDC"],
    ["", ""],
  ])("reads the Beckn domain %j as split(':').pop() did", (domain, key) => {
    expect(saveSpecDomainKey(domain)).toBe(key);
    expect(saveSpecDomainKey(domain)).toBe(domain.split(":").pop() || "");
  });

  it("reads the FD domain as FIS14_FD, not FD", () => {
    expect(saveSpecDomainKey("ONDC:FIS14:FD")).toBe("FIS14_FD");
  });
});

const becknAck = {
  context: {
    domain: "ONDC:TRV11",
    country: "IND",
    city: "std:080",
    action: "search",
    core_version: "1.2.5",
    bap_id: "bap.example.com",
    bap_uri: "https://bap.example.com",
    message_id: "6f2b9a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
    timestamp: "2026-10-29T10:00:00.000Z",
    transaction_id: "7a3c0b2f-3d4e-4f60-9b0c-1d2e3f4a5b6c",
    ttl: "PT30S",
  },
  message: { ack: { status: "ACK" } },
};

const fdContext = {
  domain: "ONDC:FIS14:FD",
  location: { country: { code: "IND" }, city: { code: "*" } },
  version: "0.1.4",
  action: "on_application_create",
  bap_id: "fd.exampledistributor.in",
  bap_uri: "https://fd.exampledistributor.in/fd/v0.1/callbacks",
  bpp_id: "fd.examplebank.in",
  bpp_uri: "https://fd.examplebank.in/fd/v0.1",
  transaction_id: "6a0b6b2e-64c4-4c8a-9b2a-3f6f1c2d55aa",
  message_id: "58cb2a10-7d2e-4c31-b9f0-7a2e1d6c0099",
  timestamp: "2026-09-17T10:18:05.000+05:30",
  ttl: "PT30S",
};

describe("validateJsonResponse", () => {
  it("still accepts a Beckn ACK and still rejects a two-colon domain on a Beckn ACK", () => {
    expect(validateJsonResponse(becknAck)).toEqual({ isValid: true, errors: [] });
    const twoColons = { ...becknAck, context: { ...becknAck.context, domain: "ONDC:TRV11:X" } };
    const result = validateJsonResponse(twoColons);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/domain must start with "ONDC:"/);
  });

  it("accepts an FD ACK, which the Beckn schema rejected", () => {
    expect(validateJsonResponse({ context: fdContext, message: { ack: { status: "ACK" } } })).toEqual({ isValid: true, errors: [] });
  });

  it("accepts an FD NACK whose context is the one being rejected", () => {
    const nack = {
      context: { domain: "ONDC:FIS14:FD", action: "application_create" },
      message: { ack: { status: "NACK" } },
      error: { code: "FD-PWB-0030", class: "PROTOCOL", message: "schema", obligedParty: "N-01 INVESTOR_APP", retryable: false },
    };
    expect(validateJsonResponse(nack)).toEqual({ isValid: true, errors: [] });
  });

  it("rejects an FD ACK with an fdEnvelope, a missing message_id or an error", () => {
    const { message_id: _drop, ...noId } = fdContext;
    for (const bad of [
      { context: fdContext, fdEnvelope: { envelopeVersion: "1.0" }, message: { ack: { status: "ACK" } } },
      { context: noId, message: { ack: { status: "ACK" } } },
      { context: fdContext, message: { ack: { status: "ACK" } }, error: { code: "x", message: "y" } },
    ]) {
      expect(validateJsonResponse(bad).isValid).toBe(false);
    }
  });
});
