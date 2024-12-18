import { expect } from 'chai';
import { logger } from "../../../utils/logger";
import { Payload } from "../../../types/payload";

export function checkSearch(payload: Payload) {
  logger.info("Inside search validations");

  const jsonRequest = payload?.jsonRequest as any;

  // Store results
  const testResults: { passed: string[]; failed: string[] } = {
    passed: [],
    failed: []
  };
  const { context } = jsonRequest;
  const { message } = jsonRequest;
  // BDD-style validation: context validation
  try {
    // Test: Should have valid context with transactionId and timestamp

    expect(context).to.have.property('transaction_id').that.is.a('string').and.is.not.empty;
    expect(context).to.have.property('timestamp').that.is.a('string'); // ISO 8601 format
    testResults.passed.push('Should have valid context with transactionId and timestamp');
  } catch (error:any) {
    testResults.failed.push(`Should have valid context with transactionId and timestamp`);
  }

  // Test: Should have valid message with intent
  try {

    expect(message).to.have.property('intent').that.is.a('string').and.is.not.empty;
    testResults.passed.push('Should have valid message with intent');
  } catch (error:any) {
    testResults.failed.push(`Should have valid message with intent`);
  }

//   // Test: Should have valid searchTerm field
//   try {
//     expect(jsonRequest).to.have.property('searchTerm').that.is.a('string').and.is.not.empty;
//     testResults.passed.push('Should have valid searchTerm field');
//   } catch (error:any) {
//     testResults.failed.push({
//       testName: 'Should have valid searchTerm field',
//       error: error.message
//     });
//   }

//   // Test: Should have valid query type
//   try {
//     expect(jsonRequest).to.have.property('queryType').that.is.a('string').and.is.not.empty;
//     testResults.passed.push('Should have valid query type');
//   } catch (error:any) {
//     testResults.failed.push({
//       testName: 'Should have valid query type',
//       error: error.message
//     });
//   }

  // Return the result object containing passed and failed tests
  return testResults;
}