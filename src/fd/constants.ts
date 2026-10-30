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

/**
 * The engine's certification plan names a scenario's flow `fd_scn_<n>` (`scenarioFlowId`). The
 * FD spec branch's flows (written by fd-protocol's spec/to_pwb.py) use descriptive ids for the
 * same scenarios. Until the two agree, a plan flow is met by a session flow of either name; an
 * exact `fd_scn_<n>` id always works.
 */
export const FD_SCENARIO_FLOW_ALIASES: Readonly<Record<string, readonly string[]>> = {
  fd_scn_6: ["fd_quote_expired"],
  fd_scn_12: ["fd_redelivered_booking"],
  fd_scn_34: ["fd_stale_version"],
  fd_scn_35: ["fd_replayed_request"],
  fd_scn_36: ["fd_replaced_quote_digest"],
  fd_scn_37: ["fd_party_conflict"],
  fd_scn_38: ["fd_out_of_order"],
};

/** The session flow ids that run a plan flow: its own id first, then its aliases. */
export function sessionFlowIdsFor(planFlowId: string): string[] {
  return [planFlowId, ...(FD_SCENARIO_FLOW_ALIASES[planFlowId] ?? [])];
}

/** The plan flow id a session flow runs (`fd_stale_version` → `fd_scn_34`); itself when it has no alias. */
export function planFlowIdOf(sessionFlowId: string): string {
  for (const [planFlowId, aliases] of Object.entries(FD_SCENARIO_FLOW_ALIASES)) {
    if (aliases.includes(sessionFlowId)) return planFlowId;
  }
  return sessionFlowId;
}

/** The fewest SYNC answer times per action that certify it; env `FD_SLA_MIN_SAMPLES` overrides. */
export const FD_SLA_DEFAULT_MIN_SAMPLES = 20;

/** The session key the NP's capability declaration is read from. */
export const FD_DECLARATION_KEY = "capabilityDeclaration";

/** The declaration certification assumes when the session carries none: BOOKING only. */
export const FD_DEFAULT_DECLARATION = { actionGroups: ["BOOKING"] } as const;
