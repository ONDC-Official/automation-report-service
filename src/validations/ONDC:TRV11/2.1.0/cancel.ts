import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateTrv11Cancel } from "../../shared/trv11Validations";

export default async function cancel(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const message = jsonRequest?.message;

  // Validate cancel message for TRV11
  validateTrv11Cancel(message, testResults);

  // 2.1.0: Validate cancellation_reason_id
  if (message?.cancellation_reason_id) {
    const validReasons = ["001", "002", "003", "004", "005", "011", "012", "013", "014"];
    if (validReasons.includes(message.cancellation_reason_id)) {
      testResults.passed.push(`cancel: cancellation_reason_id '${message.cancellation_reason_id}' is valid`);
    } else {
      testResults.failed.push(`cancel: cancellation_reason_id '${message.cancellation_reason_id}' is not a recognized code`);
    }
  }

  // Validate descriptor.short_desc for cancel type (SOFT_CANCEL / CONFIRM_CANCEL)
  if (message?.descriptor?.short_desc) {
    const desc = message.descriptor.short_desc;
    if (["SOFT_CANCEL", "CONFIRM_CANCEL"].includes(desc)) {
      testResults.passed.push(`cancel: descriptor.short_desc '${desc}' is valid`);
    }
  }

  // Add default message if no validations ran
  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated cancel`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
