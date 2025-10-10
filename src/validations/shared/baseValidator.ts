import { ValidationAction } from "../../types/actions";
import { TestResult, Payload } from "../../types/payload";
import { logger } from "../../utils/logger";

type CheckJsonResponseFn = (jsonResponse: any, testResults: TestResult) => void;

type VersionResolver = (element: Payload) => string | undefined;

/**
 * Factory to create a domain validator with shared logic.
 * - Uses dynamic imports per action and version: `./${version}/${ActionFile}`
 * - Aggregates results and applies response schema validation if response present
 */
export function createDomainValidator(
  resolveVersion: VersionResolver,
  checkJsonResponse: CheckJsonResponseFn
) {
  return async function validate(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    console.log("validate=>>>>>>>>>>>>>>>>>validate", element,sessionID, flowId);
    const version = resolveVersion(element);

    let testResults: TestResult = { response: {}, passed: [], failed: [] };

    try {
      const { jsonResponse, action_id } = element;
      if (jsonResponse) {
        checkJsonResponse(jsonResponse, testResults);
      }

      try {
        const fileName = action_id;
        // File name --> based on the action_id --> dynamic 
        if (!fileName || !version) {
          testResults.failed.push(`Incorrect version or unsupported action: ${action_id}`);
          return testResults;
        }

        // Dynamic import of action module based on version
        const mod: any = await import(`../${element.jsonRequest.context.domain}/${version}/${fileName}`);

        // Detect exported function name (check<ActionPascalCase>)
        const exportedFnName = Object.keys(mod).find((k) => typeof (mod as any)[k] === "function");
        const testFunction: Function | undefined = exportedFnName ? (mod as any)[exportedFnName] : undefined;

        if (!testFunction) {
          testResults.failed.push(`No matching test function found for ${action_id}.`);
          return testResults;
        }

        const testResult: TestResult = await testFunction(element, sessionID, flowId);
        testResults.passed.push(...(testResult.passed || []));
        testResults.failed.push(...(testResult.failed || []));
        if (testResult.response) {
          testResults.response = testResult.response;
        }
      } catch (err: any) {
        testResults.failed.push(`Incorrect version for ${action_id}`);
        logger.error(`Error importing version-specific tests: ${err?.stack || err}`);
      }

      return testResults;
    } catch (error: any) {
      logger.error(`Error during validation: ${error?.message || error}`);
      return { response: {}, passed: [], failed: [`Error during ${element.action_id} test execution`] };
    }
  };
}


