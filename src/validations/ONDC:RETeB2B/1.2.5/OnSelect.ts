import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateQuoteBreakup } from "./commonChecks";
import {
  validateMandatoryOutOfStockError,
  validateErrorResponse,
  validateSelectProvider,
  validateOnSelectProviderConsistency,
  validateOnSelectItemsAgainstSelect,
  validateOnSelectFulfillmentRefs,
  validateOnSelectFulfillmentDetails,
  validateOnSelectQuoteTtl,
  validateCustomerIdentification,
} from "./selectChecks";

// The Out_of_Stock(Error_code) flow runs two on_select legs, disambiguated by
// action_id (confirmed against automation-specifications'
// config/flows/eB2B/Out_of_Stock_Error_code_.yaml, whose 16 steps start
// select0 -> on_select_out_of_stock -> select -> on_select -> init -> ...):
//   on_select_out_of_stock = the rejection; the out-of-stock error is MANDATORY
//   on_select              = the retry after the buyer adjusts quantity; expected to succeed
// Every other flow has a single on_select where an error is an optional
// terminal state, so the strict rule stays scoped to this flow.
const FLOW_OUT_OF_STOCK = "Out_of_Stock(Error_code)";
const ACTION_ID_OOS_REJECTION = "on_select_out_of_stock";
const ACTION_ID_OOS_RETRY = "on_select";

export default async function on_select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.retEB2BOnSelect(element, sessionID, flowId, actionId);

  try {
    // The out-of-stock / item-unavailable signal lives at the callback's own
    // `error` field (jsonRequest.error), not the ACK/NACK envelope — confirmed
    // against automation-specifications' on_select_out_of_stock_validate.js and
    // its real example payload (error.code "40002"). The ACK/NACK envelope
    // itself is already validated generically by the shared response schema.
    const requestError = element?.jsonRequest?.error;

    if (flowId === FLOW_OUT_OF_STOCK) {
      if (actionId === ACTION_ID_OOS_REJECTION) {
        validateMandatoryOutOfStockError(requestError, result);
        return await finish(element, sessionID, flowId, result);
      }
      if (actionId !== ACTION_ID_OOS_RETRY) {
        result.failed.push(
          `on_select: unexpected action_id '${actionId}' for flow '${flowId}' — expected '${ACTION_ID_OOS_REJECTION}' (rejection) or '${ACTION_ID_OOS_RETRY}' (retry)`
        );
        return await finish(element, sessionID, flowId, result);
      }
      // falls through to the normal path — the retry is expected to succeed
    }

    // Everything that did NOT take the Out_of_Stock rejection branch above. An error here is
    // an optional terminal state rather than a required one, but when the seller does refuse,
    // the refusal must be well-formed — the contract documents two codes for this leg
    // (40002 out of stock, 50009 invalid customer id) and until 2026-10-12 neither was
    // validated outside the one flow: validateErrorResponse was exported but never called.
    // See docs/RETeB2B-select-contract-audit.md §3.2.
    //
    // Deliberately NOT an early return. The contract's 50009 example is a bare
    // {context, error} with no message.order, and every check below already skips an absent
    // order — while an error-bearing response that DOES carry an order (the shape the
    // out-of-stock rejection uses) still gets its order validated. Returning here would
    // silently drop that.
    validateErrorResponse(element?.jsonRequest?.error, result);

    const message = element?.jsonRequest?.message;
    const order = message?.order;

    if (order?.quote) {
      validateQuoteBreakup(order.quote, result, "on_select");
      // on_select is where the quote is issued, so this is where its ttl belongs. The same
      // check already ran one leg later at confirm/on_confirm; the issuing leg was the gap.
      validateOnSelectQuoteTtl(order, result);
    }
    // provider.id + descriptor, shared with the select leg — the contract mandates the
    // descriptor in BOTH sections and every on_select mock merges the saved provider that
    // carries it. See validateSelectProvider for why this is required, not optional.
    validateSelectProvider(order, result, "on_select");
    validateOnSelectFulfillmentRefs(order, result);
    validateOnSelectFulfillmentDetails(order, result);
    validateCustomerIdentification(order, "on_select", result);

    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const selectData = await getActionData(sessionID, flowId, txnId, "select");
      validateOnSelectProviderConsistency(order, selectData, result);
      validateOnSelectItemsAgainstSelect(order, selectData, result);
    }

  } catch (_) { }

  return await finish(element, sessionID, flowId, result);
}

async function finish(
  element: Payload,
  sessionID: string,
  flowId: string,
  result: TestResult
): Promise<TestResult> {
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
