import { TestResult } from "../../../../types/payload";
import {
  VALID_IGM1_CATEGORIES,
  VALID_IGM1_ITEM_SUBCATEGORIES,
  VALID_IGM1_FULFILLMENT_SUBCATEGORIES,
  VALID_IGM1_STATUSES,
  VALID_IGM1_ISSUE_TYPES
} from "../constants";
import {
  validateIgm1ComplainantInfo,
  validateIgm1OrderDetails,
  validateIgm1Description,
  validateIgm1Source,
  validateIgm1IssueActions,
  validateIgm1ResolutionProvider,
  validateIgm1Resolution
} from "./helpers";

/**
 * Validates IGM 1.0.0 /issue request
 * 
 * OPEN issue has: category, sub_category, complainant_info, order_details, 
 *                 description, source, expected_*_time, status, issue_type, issue_actions
 * CLOSE issue has: id, status=CLOSED, issue_actions, rating
 */
export function validateIgm1Issue(
  message: any,
  testResults: TestResult
): void {
  const issue = message?.issue;
  
  if (!issue) {
    testResults.failed.push("message.issue is missing in issue request");
    return;
  }

  // Validate Issue ID (required for both OPEN and CLOSE)
  if (!issue.id) {
    testResults.failed.push("issue.id is missing");
  } else {
    testResults.passed.push(`Issue ID: ${issue.id}`);
  }

  // Validate Status (required for both)
  if (!issue.status) {
    testResults.failed.push("issue.status is missing");
  } else if (!VALID_IGM1_STATUSES.includes(issue.status)) {
    testResults.failed.push(`issue.status must be OPEN or CLOSED, found: ${issue.status}`);
  } else {
    testResults.passed.push(`Issue status: ${issue.status}`);
  }

  // Validate Timestamps (required for both)
  if (!issue.created_at) testResults.failed.push("issue.created_at is missing");
  if (!issue.updated_at) testResults.failed.push("issue.updated_at is missing");
  if (issue.created_at && issue.updated_at) {
    testResults.passed.push("Issue timestamps are present");
  }

  // Validate Issue Actions (required for both)
  validateIgm1IssueActions(issue.issue_actions, testResults);

  // Determine if this is OPEN or CLOSE issue
  const isCloseIssue = issue.status === "CLOSED";

  if (isCloseIssue) {
    // CLOSE issue: only needs id, status, issue_actions, rating, timestamps
    if (issue.rating) {
      const validRatings = ["THUMBS-UP", "THUMBS-DOWN", "THUMBS_UP", "THUMBS_DOWN"];
      if (validRatings.includes(issue.rating)) {
        testResults.passed.push(`Rating: ${issue.rating}`);
      } else {
        testResults.failed.push(`Invalid rating: ${issue.rating}. Expected THUMBS-UP or THUMBS-DOWN`);
      }
    }
    testResults.passed.push("IGM 1.0.0 CLOSE issue validation completed");
  } else {
    // OPEN issue: needs all the additional fields
    
    // Validate Category
    if (!issue.category) {
      testResults.failed.push("issue.category is missing");
    } else if (!VALID_IGM1_CATEGORIES.includes(issue.category)) {
      testResults.failed.push(`issue.category must be ITEM or FULFILLMENT, found: ${issue.category}`);
    } else {
      testResults.passed.push(`Issue category: ${issue.category}`);
    }

    // Validate Sub-category
    if (!issue.sub_category) {
      testResults.failed.push("issue.sub_category is missing");
    } else {
      const validSubcats = issue.category === "ITEM" 
        ? VALID_IGM1_ITEM_SUBCATEGORIES 
        : VALID_IGM1_FULFILLMENT_SUBCATEGORIES;
      if (validSubcats.includes(issue.sub_category)) {
        testResults.passed.push(`Issue sub-category: ${issue.sub_category}`);
      } else {
        testResults.passed.push(`Sub-category ${issue.sub_category} (custom code)`);
      }
    }

    // Validate Complainant Info
    validateIgm1ComplainantInfo(issue.complainant_info, testResults);

    // Validate Order Details
    validateIgm1OrderDetails(issue.order_details, issue.category, testResults);

    // Validate Description
    validateIgm1Description(issue.description, testResults);

    // Validate Source
    validateIgm1Source(issue.source, testResults);

    // Validate Expected Times
    if (!issue.expected_response_time?.duration) {
      testResults.failed.push("issue.expected_response_time.duration is missing");
    } else {
      testResults.passed.push(`Expected response time: ${issue.expected_response_time.duration}`);
    }

    if (!issue.expected_resolution_time?.duration) {
      testResults.failed.push("issue.expected_resolution_time.duration is missing");
    } else {
      testResults.passed.push(`Expected resolution time: ${issue.expected_resolution_time.duration}`);
    }

    // Validate Issue Type
    if (!issue.issue_type) {
      testResults.failed.push("issue.issue_type is missing");
    } else if (!VALID_IGM1_ISSUE_TYPES.includes(issue.issue_type)) {
      testResults.failed.push(`issue.issue_type must be ISSUE, GRIEVANCE, or DISPUTE, found: ${issue.issue_type}`);
    } else {
      testResults.passed.push(`Issue type: ${issue.issue_type}`);
    }

    testResults.passed.push("IGM 1.0.0 OPEN issue validation completed");
  }
}

/**
 * Validates IGM 1.0.0 /on_issue response
 */
export function validateIgm1OnIssue(
  message: any,
  testResults: TestResult
): void {
  const issue = message?.issue;
  
  if (!issue) {
    testResults.failed.push("message.issue is missing in on_issue response");
    return;
  }

  // Validate Issue ID
  if (!issue.id) {
    testResults.failed.push("issue.id is missing");
  } else {
    testResults.passed.push(`Issue ID: ${issue.id}`);
  }

  // Validate Issue Actions (must have respondent_actions in on_issue)
  validateIgm1IssueActions(issue.issue_actions, testResults);

  // Check for respondent_actions specifically
  if (!issue.issue_actions?.respondent_actions || issue.issue_actions.respondent_actions.length === 0) {
    testResults.failed.push("on_issue must have respondent_actions");
  }

  // Validate Timestamps
  if (!issue.created_at) testResults.failed.push("issue.created_at is missing");
  if (!issue.updated_at) testResults.failed.push("issue.updated_at is missing");
  if (issue.created_at && issue.updated_at) {
    testResults.passed.push("Issue timestamps are present");
  }

  // Validate Resolution Provider (when RESOLVED)
  if (issue.resolution_provider) {
    validateIgm1ResolutionProvider(issue.resolution_provider, testResults);
  }

  // Validate Resolution (when RESOLVED)
  if (issue.resolution) {
    validateIgm1Resolution(issue.resolution, testResults);
  }
}

/**
 * Validates IGM 1.0.0 /issue_status request
 */
export function validateIgm1IssueStatus(
  message: any,
  testResults: TestResult
): void {
  const issueId = message?.issue_id;
  
  if (!issueId) {
    testResults.failed.push("message.issue_id is missing in issue_status request");
  } else {
    testResults.passed.push(`Issue ID for status check: ${issueId}`);
  }
}

/**
 * Validates IGM 1.0.0 /on_issue_status response
 */
export function validateIgm1OnIssueStatus(
  message: any,
  testResults: TestResult
): void {
  const issue = message?.issue;
  
  if (!issue) {
    testResults.failed.push("message.issue is missing in on_issue_status response");
    return;
  }

  // Validate Issue ID
  if (!issue.id) {
    testResults.failed.push("issue.id is missing");
  } else {
    testResults.passed.push(`Issue ID: ${issue.id}`);
  }

  // Validate Issue Actions
  validateIgm1IssueActions(issue.issue_actions, testResults);

  // Validate Timestamps
  if (!issue.created_at) testResults.failed.push("issue.created_at is missing");
  if (!issue.updated_at) testResults.failed.push("issue.updated_at is missing");
  if (issue.created_at && issue.updated_at) {
    testResults.passed.push("Issue timestamps are present");
  }

  // Validate Resolution Provider (when RESOLVED)
  if (issue.resolution_provider) {
    validateIgm1ResolutionProvider(issue.resolution_provider, testResults);
  }

  // Validate Resolution (when RESOLVED)
  if (issue.resolution) {
    validateIgm1Resolution(issue.resolution, testResults);
  }
}
