import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
    validateMfContextConsistency,
    validateMfMessageIdMatch,
    validateMfOrderIdConsistency,
    validateMfFulfillmentStateProgression,
    validateMfPaymentConsistency,
} from "../../shared/mutualFundsL2Validations";

export default async function on_status(
    element: Payload,
    sessionID: string,
    flowId: string,
    actionId: string,
    usecaseId?: string
): Promise<TestResult> {
    const result = await DomainValidators.fis14OnStatus(element, sessionID, flowId, actionId, usecaseId);

    try {
        const ctx = element?.jsonRequest?.context;
        const message = element?.jsonRequest?.message;
        const txnId = ctx?.transaction_id as string | undefined;

        if (txnId) {
            const statusData = await getActionData(sessionID, flowId, txnId, "status");
            // MF-CTX-001 + MF-CTX-002: match status request
            validateMfContextConsistency(ctx, statusData, result, flowId, "on_status", "status");
            validateMfMessageIdMatch(ctx, statusData, result, flowId, "on_status", "status");

            const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
            // MF-ORD-001: order_id consistent from on_confirm
            validateMfOrderIdConsistency(message, onConfirmData, result, flowId, "on_status", "on_confirm");
            // MF-FUL-001: fulfillment state progression
            validateMfFulfillmentStateProgression(message, onConfirmData, result, flowId, "on_status", "on_confirm");
            // MF-PAY-001: payment persistence
            validateMfPaymentConsistency(message, onConfirmData, result, flowId, "on_status", "on_confirm");
        }
    } catch (_) { }

    await saveFromElement(element, sessionID, flowId, "jsonRequest");
    return result;
}
