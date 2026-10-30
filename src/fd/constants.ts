/**
 * Constants of the FD (ONDC:FIS14:FD, fixed deposits) branch of the report service. Every FD
 * code path is gated on `isFdDomain(domain)`; Beckn domains never reach it.
 */
export const FD_DOMAIN = "ONDC:FIS14:FD";

export function isFdDomain(domain: unknown): boolean {
  return typeof domain === "string" && domain.trim() === FD_DOMAIN;
}

/** The two FD participant roles a certificate names (automation-db CERTIFICATE_ROLES). */
export type FdParticipantRole = "INVESTOR_APP" | "DEPOSIT_ISSUER";

/** The session's npType is the NP under test: BAP is the investor app, BPP the issuer. */
export function fdRoleOfNp(npType: unknown): FdParticipantRole {
  if (npType === "BAP") return "INVESTOR_APP";
  if (npType === "BPP") return "DEPOSIT_ISSUER";
  throw new Error(`FD: npType ${JSON.stringify(npType)} is neither BAP nor BPP`);
}

/** The role the WORKBENCH played: the counterpart of the NP under test. */
export function fdWorkbenchRole(npType: unknown): FdParticipantRole {
  return fdRoleOfNp(npType) === "INVESTOR_APP" ? "DEPOSIT_ISSUER" : "INVESTOR_APP";
}

/**
 * Internal `X-Pwb-*` headers (M2-DESIGN §2) the recorder keeps in a payload's `reqHeader`.
 * Matched case-insensitively.
 */
export const FD_HEADERS = {
  route: "X-Pwb-Fd-Route",
  method: "X-Pwb-Fd-Method",
  path: "X-Pwb-Fd-Path",
  pathParams: "X-Pwb-Fd-Path-Params",
  replay: "X-Pwb-Fd-Replay",
  /** The playground's scenario directives (JSON) on a deliberate deviation by the workbench. */
  scenario: "X-Pwb-Fd-Scenario",
  /** fd-gate: "np" when the participant under test sent it, "workbench" when the mock did. */
  origin: "X-Pwb-Fd-Origin",
  internalKey: "X-Pwb-Internal-Key",
} as const;

/** The fewest SYNC answer times per action that certify it; env `FD_SLA_MIN_SAMPLES` overrides. */
export const FD_SLA_DEFAULT_MIN_SAMPLES = 20;

/** The session key the NP's capability declaration is read from. */
export const FD_DECLARATION_KEY = "capabilityDeclaration";

/** The declaration certification assumes when the session carries none: BOOKING only. */
export const FD_DEFAULT_DECLARATION = { actionGroups: ["BOOKING"] } as const;
