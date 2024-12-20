import { ValidationAction } from "../../types/actions";
import { TestResult } from "../../types/payload";
import { checkJsonResponse } from "./responseSchemaValidator";

export const validate = async (
  element: any,
  action: ValidationAction
): Promise<TestResult> => {
  const version = element?.jsonRequest?.context?.version;

  let testResults: TestResult = { response: {}, passed: [], failed: [] };

  try {
    const { jsonResponse } = element;

    // Common JSON response validation
    if (jsonResponse) {
      checkJsonResponse(jsonResponse, testResults);
    }

    // Dynamically import test files based on version
    const { checkSearch } = await import(`./${version}/search.test`);
    const { checkOnSearch } = await import(`./${version}/OnSearch.test`);
    const { checkSelect } = await import(`./${version}/select.test`);
    const { checkOnSelect } = await import(`./${version}/OnSelect.test`);
    const { checkInit } = await import(`./${version}/init.test`);
    const { checkOnInit } = await import(`./${version}/OnInit.test`);
    const { checkConfirm } = await import(`./${version}/confirm.test`);
    const { checkOnConfirm } = await import(`./${version}/OnConfirm.test`);
    const { checkOnStatus } = await import(`./${version}/OnStatus.test`);

    const runTest = async (
      testFunction: Function,
      element: any,
      testResults: TestResult
    ) => {
      try {
        const testResult = testFunction(element);
        testResults.passed.push(...testResult.passed);
        testResults.failed.push(...testResult.failed);

        if (testResult.response) {
          testResults.response = testResult.response;
        }
      } catch (err: any) {
        testResults.failed.push(`${err.message}`);
      }
    };

    switch (action) {
      case "search":
        await runTest(checkSearch, element, testResults);
        break;

      case "on_search":
        await runTest(checkOnSearch, element, testResults);
        break;

      case "select":
        await runTest(checkSelect, element, testResults);
        break;

      case "on_select":
        await runTest(checkOnSelect, element, testResults);
        break;

      case "init":
        await runTest(checkInit, element, testResults);
        break;

      case "on_init":
        await runTest(checkOnInit, element, testResults);
        break;

      case "confirm":
        await runTest(checkConfirm, element, testResults);
        break;

      case "on_confirm":
        await runTest(checkOnConfirm, element, testResults);
        break;

      case "on_status":
        await runTest(checkOnStatus, element, testResults);
        break;

      default:
        testResults.failed.push(
          `No matching test function found for ${action}.`
        );
        break;
    }

    return testResults;
  } catch (error: any) {
    return {
      response: {},
      passed: [],
      failed: [`Error during ${action} test execution: ${error.message}`],
    };
  }
};
