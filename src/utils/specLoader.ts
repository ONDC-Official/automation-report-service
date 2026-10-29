import { readFileSync } from "fs";
import path from "path";
import yaml from "js-yaml";
import { saveActionData } from "../services/actionDataService";
import { ValidationAction } from "../types/actions";
import { isFdDomain } from "../fd/constants";

/**
 * The save-specs folder of a context domain: the part after the first colon.
 *
 * Beckn domains have at most one colon ("ONDC:TRV11" → "TRV11", "nic2004:60232" → "60232"), and
 * for them this is exactly the old `split(":").pop()`. FD's "ONDC:FIS14:FD" has two, and `pop()`
 * read it as "FD". Every part after the first is kept, joined with "_" (a colon is not a safe
 * folder name): "FIS14_FD".
 */
export function saveSpecDomainKey(domain: string): string {
  const parts = domain.split(":");
  if (parts.length <= 2) return parts.pop() || "";
  return parts.slice(1).join("_");
}

export function loadSaveSpec(domain: string, version: string, action: string): { [k: string]: any } {
  const specPath = path.resolve(
    __dirname,
    `../config/save-specs/${domain}/${version}/${action}.yaml`
  );
  const content = readFileSync(specPath, "utf8");
  return yaml.load(content) as any;
}

export async function saveFromElement(
  element: any,
  sessionID: string,
  flowId: string,
  source: "jsonRequest" | "jsonResponse"
) {
  try {
    const payload = element?.[source];
    const context = payload?.context as any;
    // FD keeps transaction state in the FD engine (src/fd), never in save-specs action data.
    if (isFdDomain(context?.domain)) return;
    const transactionId: string | undefined = context?.transaction_id;
    const domainKey = saveSpecDomainKey(context?.domain || "");
    const action = (context?.action || "");
    const version: string | undefined = context?.version;
    if (transactionId && domainKey && version && action) {
      const spec = loadSaveSpec(domainKey, version, action);
      await saveActionData(sessionID,flowId, transactionId, action, payload, spec);
    }
  } catch (_) {}
}


