import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
    validateMfContextConsistency,
    validateMfProviderConsistency,
    validateMfItemsPersistence,
} from "../../shared/mutualFundsL2Validations";

export default async function init(
    element: Payload,
    sessionID: string,
    flowId: string,
    actionId: string,
    usecaseId?: string
): Promise<TestResult> {
    const result = await DomainValidators.fis14Init(element, sessionID, flowId, actionId, usecaseId);

    try {
        const ctx = element?.jsonRequest?.context;
        const message = element?.jsonRequest?.message;
        const txnId = ctx?.transaction_id as string | undefined;

        if (txnId) {
            const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
            // MF-CTX-001: context consistent with on_select
            validateMfContextConsistency(ctx, onSelectData, result, flowId, "init", "on_select");
            // MF-ORD-002: provider consistent
            validateMfProviderConsistency(message, onSelectData, result, flowId, "init", "on_select");
            // MF-ITEM-002: items persist from on_select
            validateMfItemsPersistence(message, onSelectData, result, flowId, "init", "on_select");
        }
    } catch (_) { }

    await saveFromElement(element, sessionID, flowId, "jsonRequest");
    return result;
}
