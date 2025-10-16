import { readFileSync } from "fs";
import path from "path";
import yaml from "js-yaml";
import { saveActionData } from "../services/actionDataService";
import { ValidationAction } from "../types/actions";

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
    const transactionId: string | undefined = context?.transaction_id;
    const domainKey = (context?.domain || "").split(":").pop() || "";
    const action = (context?.action || "");
    const version: string | undefined = context?.version;
    if (transactionId && domainKey && version && action) {
      const spec = loadSaveSpec(domainKey, version, action);
      await saveActionData(sessionID,flowId, transactionId, action, payload, spec);
    }
  } catch (_) {}
}


