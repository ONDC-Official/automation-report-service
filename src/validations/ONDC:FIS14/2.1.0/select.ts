import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
    validateMfContextConsistency,
    validateMfItemsInCatalog,
} from "../../shared/mutualFundsL2Validations";

export default async function select(
    element: Payload,
    sessionID: string,
    flowId: string,
    actionId: string,
    usecaseId?: string
): Promise<TestResult> {
    const result = await DomainValidators.fis14Select(element, sessionID, flowId, actionId, usecaseId);

    try {
        const ctx = element?.jsonRequest?.context;
        const message = element?.jsonRequest?.message;
        const txnId = ctx?.transaction_id as string | undefined;

        if (txnId) {
            const onSearchData = await getActionData(sessionID, flowId, txnId, "on_search");
            // MF-CTX-001: context consistent with on_search
            validateMfContextConsistency(ctx, onSearchData, result, flowId, "select", "on_search");
            // MF-ITEM-001: selected items must exist in on_search catalog
            validateMfItemsInCatalog(message, onSearchData, result, flowId);
        }
    } catch (_) { }

    await saveFromElement(element, sessionID, flowId, "jsonRequest");
    return result;
}
