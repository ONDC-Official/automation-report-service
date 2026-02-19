import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateGcDomainVersion, validateGcBppAbsentInSearch } from "../../shared/giftCardL2Validations";

export default async function search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10Search(element, sessionID, flowId, actionId);

  try {
    const ctx = element?.jsonRequest?.context;
    // GC-CTX-013,014: domain/version check
    validateGcDomainVersion(ctx, result, flowId, "search");
    // GC-CTX-017: bpp_id/bpp_uri must be absent in search
    validateGcBppAbsentInSearch(ctx, result, flowId);
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}