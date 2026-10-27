import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
    validateMfContextConsistency,
    validateMfOrderIdConsistency,
    validateMfFulfillmentStateProgression,
    validateMfPaymentConsistency,
    validateMfQuoteConsistency,
} from "../../shared/mutualFundsL2Validations";

export default async function on_update(
    element: Payload,
    sessionID: string,
    flowId: string,
    actionId: string,
    usecaseId?: string
): Promise<TestResult> {
    const result = await DomainValidators.fis14OnUpdate(element, sessionID, flowId, actionId, usecaseId);

    try {
        const ctx = element?.jsonRequest?.context;
        const message = element?.jsonRequest?.message;
        const txnId = ctx?.transaction_id as string | undefined;

        if (txnId) {
            const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");

            // MF-ORD-001: order.id consistent with on_confirm
            validateMfOrderIdConsistency(message, onConfirmData, result, flowId, "on_update", "on_confirm");
            // MF-CTX-001: context consistent with on_confirm baseline
            validateMfContextConsistency(ctx, onConfirmData, result, flowId, "on_update", "on_confirm");
            // MF-FUL-001: fulfillment state progression vs on_confirm (initial baseline)
            validateMfFulfillmentStateProgression(message, onConfirmData, result, flowId, "on_update", "on_confirm");
            // MF-PAY-001: payment persistence
            validateMfPaymentConsistency(message, onConfirmData, result, flowId, "on_update", "on_confirm");

            // MF-QOT-001: quote price vs on_confirm baseline
            // Skip for CANCELLED orders (failed instalment with 0 quote amount is valid)
            const orderStatus = message?.order?.status;
            if (orderStatus !== "CANCELLED" && message?.order?.quote) {
                validateMfQuoteConsistency(message, onConfirmData, result, flowId, "on_update", "on_confirm");
            }
        }
    } catch (_) { }

    await saveFromElement(element, sessionID, flowId, "jsonRequest");
    return result;
}
