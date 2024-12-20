import { ValidationAction } from "../../types/actions";
import { TestResult } from "../../types/payload";

export const validate = async (
  element: any,
  action: ValidationAction
): Promise<TestResult> => {
  const version = element?.jsonRequest?.context?.version; // Get version from the payload

  // Initialize test results structure
  let testResults: TestResult = { response: {}, passed: [], failed: [] };

  try {
    // Dynamically import the test files based on version
    const { checkSearch } = await import(`./${version}/search.test`);
    const { checkOnSearch } = await import(`./${version}/OnSearch.test`);
    const { checkSelect } = await import(`./${version}/select.test`);
    const { checkOnSelect } = await import(`./${version}/OnSelect.test`);
    const { checkInit } = await import(`./${version}/init.test`);
    const { checkOnInit } = await import(`./${version}/OnInit.test`);
    const { checkConfirm } = await import(`./${version}/confirm.test`);
    const { checkOnConfirm } = await import(`./${version}/OnConfirm.test`);
    const { checkOnStatus } = await import(`./${version}/OnStatus.test`);

    // Function to run tests programmatically
    const runTest = async (
      testFunction: Function,
      element: any,
      testResults: TestResult
    ) => {
      try {
        const testResult = testFunction(element); // Execute the test function
        // Store results for the passed tests
        testResults.passed.push(...testResult.passed);
        // Store results for the failed tests
        testResults.failed.push(...testResult.failed);

        // Store ack if available in the test result
        if (testResult.response) {
          testResults.response = testResult.response;
        }
      } catch (err: any) {
        // If there's an error in the test execution, store the error in failed
        testResults.failed.push(`${err.message}`);
      }
    };

    // Route to specific tests based on the action
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

      // Add more cases for other actions as needed

      default:
        return {
          response: {},
          passed: [],
          failed: ["No test functions found"],
        };
    }

    // Return the results after running all tests
    // console.log(JSON.stringify(testResults));
    return testResults;
  } catch (error) {
    console.log(`Error occurred:`, error);
    return {
      response: {},
      passed: [],
      failed: [`Error during ${action} tests execution`],
    };
  }
};
