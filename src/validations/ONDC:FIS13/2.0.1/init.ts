import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import {
  validateInsuranceContext,
  validateInsuranceBilling,
  validateInsuranceFulfillments,
  validateInsurancePaymentTags,
  validateInsuranceInitXinput,
} from "../../shared/healthInsuranceValidations";

export default async function init(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13Init(element, sessionID, flowId, actionId, usecaseId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Health insurance context validation
    validateInsuranceContext(context, result, flowId);
    if (message) validateInsuranceBilling(message, result, flowId);
    if (message) validateInsuranceFulfillments(message, result, flowId, actionId);
    if (message) validateInsurancePaymentTags(message, result, flowId, "order");
    if (message) validateInsuranceInitXinput(message, result, flowId);

    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      // Provider + item ID comparison: on_select → init
      const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
      if (onSelectData) {
        const initProviderId = message?.order?.provider?.id;
        const selectProviderId = onSelectData?.order?.provider?.id || onSelectData?.provider?.id;
        if (initProviderId && selectProviderId) {
          if (initProviderId === selectProviderId) result.passed.push("Provider id matches on_select");
          else result.failed.push("Provider id mismatch with on_select");
        }

        const initItems: any[] = message?.order?.items || [];
        const selItems: any[] = onSelectData?.order?.items || onSelectData?.items || [];
        const selIds = selItems.map((it: any) => it?.id).filter(Boolean) as string[];
        const iniIds = initItems.map((it: any) => it?.id).filter(Boolean) as string[];
        const missing = selIds.filter(id => !iniIds.includes(id));
        if (selIds.length > 0) {
          if (missing.length === 0) result.passed.push(`Item IDs consistent between on_select and init (${selIds.length} items)`);
          else result.failed.push(`Items from on_select missing in init: ${missing.join(", ")}`);
        }
      }

      // Form ID (xinput) check
      await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "init", result);
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
