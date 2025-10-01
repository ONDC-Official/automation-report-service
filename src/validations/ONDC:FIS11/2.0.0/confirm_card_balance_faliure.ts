import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/validationFactory";

export default async function confirm_card_balance_faliure(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  // Use the same validator as regular confirm but with additional balance-specific validations
  const result = await DomainValidators.fis11Confirm(element, sessionID, flowId);
  
  // Add balance-specific validations for failure scenario
  const message = element.jsonRequest?.message;
  if (message?.order?.items) {
    const balanceItem = message.order.items.find((item: any) => 
      item.descriptor?.code === "BALANCE_CHECK" || item.id === "I2"
    );
    
    if (balanceItem) {
      if (balanceItem.price?.value === "0") {
        result.passed.push("Balance check item has zero price as expected");
      } else {
        result.failed.push("Balance check item should have zero price");
      }
    }
  }
  
  return result;
}