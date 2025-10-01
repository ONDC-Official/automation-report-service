import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/validationFactory";

export default async function on_confirm_card_balance_faliure(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  // For failure scenario, we expect an error response
  const result: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };
  
  // Check if error is present in the response
  const error = element.jsonRequest?.error;
  if (error) {
    result.passed.push("Error response is present for balance check failure");
    
    if (error.code) {
      result.passed.push(`Error code is present: ${error.code}`);
    } else {
      result.failed.push("Error code is missing");
    }
    
    if (error.message) {
      result.passed.push(`Error message is present: ${error.message}`);
    } else {
      result.failed.push("Error message is missing");
    }
    
    // Check for specific error code for invalid card details
    if (error.code === "80101") {
      result.passed.push("Correct error code for invalid card details");
    } else {
      result.failed.push("Expected error code 80101 for invalid card details");
    }
  } else {
    result.failed.push("Error response is missing for balance check failure scenario");
  }
  
  return result;
}