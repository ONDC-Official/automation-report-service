import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/validationFactory";

export default async function on_confirm_card_balance_success(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  // Use the same validator as regular on_confirm but with additional balance-specific validations
  const result = await DomainValidators.fis11OnConfirm(element, sessionID, flowId);
  
  // Add balance-specific validations
  const message = element.jsonRequest?.message;
  if (message?.order) {
    // Check for COMPLETE status for balance check
    if (message.order.status === "COMPLETE") {
      result.passed.push("Balance check order status is COMPLETE as expected");
    } else {
      result.failed.push("Balance check order status should be COMPLETE");
    }
    
    // Check for balance in quote breakup
    if (message.order.quote?.breakup) {
      const balanceBreakup = message.order.quote.breakup.find((item: any) => 
        item.title === "CURRENT_BALANCE"
      );
      
      if (balanceBreakup) {
        result.passed.push("Current balance is present in quote breakup");
        if (balanceBreakup.item?.price?.value) {
          result.passed.push("Current balance value is present");
        } else {
          result.failed.push("Current balance value is missing");
        }
      } else {
        result.failed.push("Current balance not found in quote breakup");
      }
    }
  }
  
  return result;
}