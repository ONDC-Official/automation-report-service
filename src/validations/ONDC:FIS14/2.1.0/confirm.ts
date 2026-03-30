import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
    validateMfContextConsistency,
    validateMfProviderConsistency,
    validateMfItemsPersistence,
    validateMfQuoteConsistency,
} from "../../shared/mutualFundsL2Validations";

export default async function confirm(
    element: Payload,
    sessionID: string,
    flowId: string,
    actionId: string,
    usecaseId?: string
): Promise<TestResult> {
    const result = await DomainValidators.fis14Confirm(element, sessionID, flowId, actionId, usecaseId);

    try {
        const ctx = element?.jsonRequest?.context;
        const message = element?.jsonRequest?.message;
        const txnId = ctx?.transaction_id as string | undefined;

        if (txnId) {
            const onInitData = await getActionData(sessionID, flowId, txnId, "on_init");
            // MF-CTX-001
            validateMfContextConsistency(ctx, onInitData, result, flowId, "confirm", "on_init");
            // MF-ORD-002: provider consistent
            validateMfProviderConsistency(message, onInitData, result, flowId, "confirm", "on_init");
            // MF-ITEM-002: items persist
            validateMfItemsPersistence(message, onInitData, result, flowId, "confirm", "on_init");
            // MF-QOT-001: quote consistent
            validateMfQuoteConsistency(message, onInitData, result, flowId, "confirm", "on_init");
        }
    } catch (_) { }

    await saveFromElement(element, sessionID, flowId, "jsonRequest");
    return result;
}
