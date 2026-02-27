import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateInsuranceContext,
} from "../../shared/healthInsuranceValidations";
import {
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";
import { HEALTH_INSURANCE_FLOWS } from "../../../utils/constants";

export default async function update(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13Update(element, sessionID, flowId, actionId);

  // Health insurance context validation
  const context = element?.jsonRequest?.context;
  validateInsuranceContext(context, result, flowId);

  // ── L2: Context integrity vs on_confirm ──
  try {
    const txnId = context?.transaction_id as string | undefined;
    if (txnId && flowId && HEALTH_INSURANCE_FLOWS.includes(flowId)) {
      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      if (onConfirmData) {
        validateAllContext(context, onConfirmData, result, flowId, "update", "on_confirm");
      }
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
