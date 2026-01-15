import { ValidationAction } from "../../types/actions";
import { TestResult, Payload } from "../../types/payload";
import { DOMAINS } from "../../utils/constants";
import { getRuntimeExtension } from "../../utils/getRuntimeExtension";
import { getFileName } from "./validationFactory";

import logger from "@ondc/automation-logger";
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
    flowId: string,
    actionId: string,
    usecaseId?: string
  ): Promise<TestResult> {
    const version = resolveVersion(element);

    let testResults: TestResult = { response: {}, passed: [], failed: [] };

    try {
      const { jsonResponse, action_id, action } = element;
      if (jsonResponse) {
        checkJsonResponse(jsonResponse, testResults);
      }

      try {
        const domain = element?.jsonRequest?.context?.domain;
        const ext = getRuntimeExtension();

        let baseName =
          domain && domain.startsWith(DOMAINS.FIS11)
            ? action_id
            : getFileName(action);

        const fileName = `${baseName}.${ext}`;

        if (!fileName || !version) {
          testResults.failed.push(
            `Incorrect version or unsupported action: ${action_id}`
          );
          return testResults;
        }

        const mod: any = await import(
          `../${element.jsonRequest.context.domain}/${version}/${fileName}`
        );

        const exportedFnName = Object.keys(mod).find(
          (k) => typeof (mod as any)[k] === "function"
        );

        const testFunction: Function | undefined = exportedFnName
          ? (mod as any)[exportedFnName]
          : undefined;

        if (!testFunction) {
          testResults.failed.push(
            `No matching test function found for ${action_id}.`
          );
          return testResults;
        }

        // Support both old and new function signatures (with optional usecaseId)
        // Pass usecaseId if the function accepts it (function.length >= 5 means it has 5+ parameters)
        const testResult: TestResult = testFunction.length >= 5
          ? await testFunction(element, sessionID, flowId, action_id, usecaseId)
          : await testFunction(element, sessionID, flowId, action_id);
        testResults.passed.push(...(testResult.passed || []));
        testResults.failed.push(...(testResult.failed || []));
        if (testResult.response) {
          testResults.response = testResult.response;
        }
      } catch (err: any) {
        testResults.failed.push(`Incorrect version for ${action_id}`);
        logger.error(
          `Error importing version-specific tests: ${err?.stack || err}`
        );
      }

      return testResults;
    } catch (error: any) {
      logger.error(`Error during validation: ${error?.message || error}`);
      return {
        response: {},
        passed: [],
        failed: [`Error during ${element.action_id} test execution`],
      };
    }
  };
}
