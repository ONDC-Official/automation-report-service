import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
    validateMfContextConsistency,
    validateMfMessageIdMatch,
    validateMfOrderIdConsistency,
    validateMfProviderConsistency,
    validateMfItemsPersistence,
    validateMfQuoteConsistency,
    validateMfPaymentConsistency,
} from "../../shared/mutualFundsL2Validations";

export default async function on_confirm(
    element: Payload,
    sessionID: string,
    flowId: string,
    actionId: string,
    usecaseId?: string
): Promise<TestResult> {
    const result = await DomainValidators.fis14OnConfirm(element, sessionID, flowId, actionId, usecaseId);

    try {
        const ctx = element?.jsonRequest?.context;
        const message = element?.jsonRequest?.message;
        const txnId = ctx?.transaction_id as string | undefined;

        if (txnId) {
            const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
            // MF-CTX-001: context match with confirm
            validateMfContextConsistency(ctx, confirmData, result, flowId, "on_confirm", "confirm");
            // MF-CTX-002: message_id matches confirm
            validateMfMessageIdMatch(ctx, confirmData, result, flowId, "on_confirm", "confirm");
            // MF-ORD-002: provider consistent
            validateMfProviderConsistency(message, confirmData, result, flowId, "on_confirm", "confirm");
            // MF-ITEM-002: items persist from confirm
            validateMfItemsPersistence(message, confirmData, result, flowId, "on_confirm", "confirm");
            // MF-QOT-001: quote consistent with on_init
            const onInitData = await getActionData(sessionID, flowId, txnId, "on_init");
            validateMfQuoteConsistency(message, onInitData, result, flowId, "on_confirm", "on_init");
            // MF-PAY-001: payment ids persist
            validateMfPaymentConsistency(message, confirmData, result, flowId, "on_confirm", "confirm");
        }
    } catch (_) { }

    await saveFromElement(element, sessionID, flowId, "jsonRequest");
    return result;
}
