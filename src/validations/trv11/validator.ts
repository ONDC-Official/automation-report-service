import { ValidationAction } from "../../types/actions";

export const validate = async (
  element: any,
  action: ValidationAction
): Promise<{ passed: string[]; failed: string[] }> => {
  const version = element?.jsonRequest?.context?.version; // Get version from the payload

  // Initialize test results structure
  let testResults: { passed: string[]; failed: string[] } = { passed: [], failed: [] };

  try {
    // Dynamically import the test files based on version
    const { checkSearch } = await import(`./${version}/search.test`);
    const { checkOnSearch } = await import(`./${version}/onSearch.test`);

    // Function to run tests programmatically
    const runTest = async (testFunction: Function, element: any, testResults: { passed: string[]; failed: string[] }) => {
      try {
        const testResult = testFunction(element); // Execute the test function
        // Store results for the passed tests
        testResults.passed.push(...testResult.passed);
        // Store results for the failed tests
        testResults.failed.push(...testResult.failed);
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

      // Add more cases for other actions as needed

      default:
        return { passed: [], failed: ["Action not found"] };
    }

    // Return the results after running all tests
    console.log(JSON.stringify(testResults));
    return testResults;

  } catch (error) {
    console.log(`Error occurred:`, error);
    return { passed: [], failed: ["Error during test execution"] };
  }
};