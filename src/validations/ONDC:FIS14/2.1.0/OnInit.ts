import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
    validateMfContextConsistency,
    validateMfMessageIdMatch,
    validateMfQuoteConsistency,
    validateMfProviderConsistency,
} from "../../shared/mutualFundsL2Validations";

export default async function on_init(
    element: Payload,
    sessionID: string,
    flowId: string,
    actionId: string,
    usecaseId?: string
): Promise<TestResult> {
    const result = await DomainValidators.fis14OnInit(element, sessionID, flowId, actionId, usecaseId);

    try {
        const ctx = element?.jsonRequest?.context;
        const message = element?.jsonRequest?.message;
        const txnId = ctx?.transaction_id as string | undefined;

        if (txnId) {
            const initData = await getActionData(sessionID, flowId, txnId, "init");
            // MF-CTX-001: context match with init
            validateMfContextConsistency(ctx, initData, result, flowId, "on_init", "init");
            // MF-CTX-002: message_id matches init
            validateMfMessageIdMatch(ctx, initData, result, flowId, "on_init", "init");
            // MF-ORD-002: provider consistent
            validateMfProviderConsistency(message, initData, result, flowId, "on_init", "init");

            // MF-QOT-001: quote consistent with on_select
            const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
            if (message?.order?.quote) {
                validateMfQuoteConsistency(message, onSelectData, result, flowId, "on_init", "on_select");
            }
        }
    } catch (_) { }

    await saveFromElement(element, sessionID, flowId, "jsonRequest");
    return result;
}
