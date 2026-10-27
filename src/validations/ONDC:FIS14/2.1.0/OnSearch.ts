import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
    validateMfContextConsistency,
    validateMfMessageIdMatch,
} from "../../shared/mutualFundsL2Validations";

export default async function on_search(
    element: Payload,
    sessionID: string,
    flowId: string,
    actionId: string,
    usecaseId?: string
): Promise<TestResult> {
    const result = await DomainValidators.fis14OnSearch(element, sessionID, flowId, actionId);

    try {
        const ctx = element?.jsonRequest?.context;
        const txnId = ctx?.transaction_id as string | undefined;

        if (txnId) {
            const searchData = await getActionData(sessionID, flowId, txnId, "search");
            // MF-CTX-001: context fields match search
            validateMfContextConsistency(ctx, searchData, result, flowId, "on_search", "search");
            // MF-CTX-002: message_id matches search
            validateMfMessageIdMatch(ctx, searchData, result, flowId, "on_search", "search");
        }
    } catch (_) { }

    await saveFromElement(element, sessionID, flowId, "jsonRequest");
    return result;
}
