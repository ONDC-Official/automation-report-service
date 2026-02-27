import { TestResult } from "../../../../types/payload";
import { VALID_ISSUE_STATUSES, VALID_ISSUE_LEVELS } from "../constants";
import {
  validateRefs,
  validateActors,
  validateIssueDescriptor,
  validateActions,
  validateResolutions
} from "./helpers";

/**
 * Validates IGM 2.0.0 /issue request
 */
export function validateIgm2Issue(
  message: any,
  testResults: TestResult
): void {
  const issue = message?.issue;
  
  if (!issue) {
    testResults.failed.push("message.issue is missing in issue request");
    return;
  }

  // Validate Issue ID
  if (!issue.id) {
    testResults.failed.push("issue.id is missing");
  } else {
    testResults.passed.push(`Issue ID is present: ${issue.id}`);
  }

  // Validate Status
  if (!issue.status) {
    testResults.failed.push("issue.status is missing");
  } else if (!VALID_ISSUE_STATUSES.includes(issue.status)) {
    testResults.failed.push(`issue.status must be one of ${VALID_ISSUE_STATUSES.join(", ")}, found: ${issue.status}`);
  } else {
    testResults.passed.push(`Issue status is valid: ${issue.status}`);
  }

  // Validate Level
  if (!issue.level) {
    testResults.failed.push("issue.level is missing");
  } else if (!VALID_ISSUE_LEVELS.includes(issue.level)) {
    testResults.failed.push(`issue.level must be one of ${VALID_ISSUE_LEVELS.join(", ")}, found: ${issue.level}`);
  } else {
    testResults.passed.push(`Issue level is valid: ${issue.level}`);
  }

  // Validate Timestamps
  if (!issue.created_at) testResults.failed.push("issue.created_at is missing");
  if (!issue.updated_at) testResults.failed.push("issue.updated_at is missing");
  if (issue.created_at && issue.updated_at) {
    testResults.passed.push("Issue timestamps are present");
  }

  // Validate Expected Response/Resolution Time
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

  // Validate Refs (references to order, provider, etc.)
  validateRefs(issue.refs, testResults);

  // Validate Actors
  validateActors(issue.actors, testResults);

  // Validate Source ID and Complainant ID
  if (!issue.source_id) {
    testResults.failed.push("issue.source_id is missing");
  } else {
    testResults.passed.push(`Source ID: ${issue.source_id}`);
  }

  if (!issue.complainant_id) {
    testResults.failed.push("issue.complainant_id is missing");
  } else {
    testResults.passed.push(`Complainant ID: ${issue.complainant_id}`);
  }

  // Validate Descriptor
  validateIssueDescriptor(issue.descriptor, testResults);

  // Validate Actions
  validateActions(issue.actions, issue.last_action_id, testResults);
}

/**
 * Validates IGM 2.0.0 /on_issue response
 */
export function validateIgm2OnIssue(
  message: any,
  testResults: TestResult
): void {
  // Validate update_target (specific to on_issue)
  const updateTarget = message?.update_target;
  if (!updateTarget || !Array.isArray(updateTarget) || updateTarget.length === 0) {
    testResults.failed.push("message.update_target is missing or empty in on_issue");
  } else {
    const hasValidTarget = updateTarget.some((t: any) => t.path && t.action);
    if (hasValidTarget) {
      testResults.passed.push("update_target is valid");
    } else {
      testResults.failed.push("update_target entries must have path and action");
    }
  }

  // Validate Issue object (same as /issue)
  const issue = message?.issue;
  
  if (!issue) {
    testResults.failed.push("message.issue is missing in on_issue response");
    return;
  }

  // Validate Issue ID
  if (!issue.id) {
    testResults.failed.push("issue.id is missing");
  } else {
    testResults.passed.push(`Issue ID is present: ${issue.id}`);
  }

  // Validate Status
  if (!issue.status) {
    testResults.failed.push("issue.status is missing");
  } else if (!VALID_ISSUE_STATUSES.includes(issue.status)) {
    testResults.failed.push(`issue.status must be one of ${VALID_ISSUE_STATUSES.join(", ")}, found: ${issue.status}`);
  } else {
    testResults.passed.push(`Issue status is valid: ${issue.status}`);
  }

  // Validate Level
  if (!issue.level) {
    testResults.failed.push("issue.level is missing");
  } else if (!VALID_ISSUE_LEVELS.includes(issue.level)) {
    testResults.failed.push(`issue.level must be one of ${VALID_ISSUE_LEVELS.join(", ")}, found: ${issue.level}`);
  } else {
    testResults.passed.push(`Issue level is valid: ${issue.level}`);
  }

  // Validate Timestamps
  if (!issue.created_at) testResults.failed.push("issue.created_at is missing");
  if (!issue.updated_at) testResults.failed.push("issue.updated_at is missing");
  if (issue.created_at && issue.updated_at) {
    testResults.passed.push("Issue timestamps are present");
  }

  // Validate Expected Times
  if (issue.expected_response_time?.duration) {
    testResults.passed.push(`Expected response time: ${issue.expected_response_time.duration}`);
  }
  if (issue.expected_resolution_time?.duration) {
    testResults.passed.push(`Expected resolution time: ${issue.expected_resolution_time.duration}`);
  }

  // Validate Refs
  validateRefs(issue.refs, testResults);

  // Validate Actors
  validateActors(issue.actors, testResults);

  // Validate Source ID and Complainant ID
  if (!issue.source_id) testResults.failed.push("issue.source_id is missing");
  if (!issue.complainant_id) testResults.failed.push("issue.complainant_id is missing");

  // Validate Respondent IDs (required in on_issue after initial processing)
  if (issue.respondent_ids && Array.isArray(issue.respondent_ids) && issue.respondent_ids.length > 0) {
    testResults.passed.push(`Respondent IDs: ${issue.respondent_ids.join(", ")}`);
  }

  // Validate Resolver IDs if present
  if (issue.resolver_ids && Array.isArray(issue.resolver_ids) && issue.resolver_ids.length > 0) {
    testResults.passed.push(`Resolver IDs: ${issue.resolver_ids.join(", ")}`);
  }

  // Validate Descriptor
  validateIssueDescriptor(issue.descriptor, testResults);

  // Validate Actions
  validateActions(issue.actions, issue.last_action_id, testResults);

  // Validate Resolutions if present (for RESOLUTION_PROPOSED)
  if (issue.resolutions && Array.isArray(issue.resolutions) && issue.resolutions.length > 0) {
    validateResolutions(issue.resolutions, testResults);
  }
}

/**
 * Validates IGM 2.0.0 /issue_status request
 */
export function validateIgm2IssueStatus(
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
 * Validates IGM 2.0.0 /on_issue_status response
 */
export function validateIgm2OnIssueStatus(
  message: any,
  testResults: TestResult
): void {
  // Validate update_target (IGM 2.0.0 specific)
  if (message?.update_target && Array.isArray(message.update_target)) {
    testResults.passed.push(`Update target: ${message.update_target.length} update(s)`);
  }

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

  // Validate Status
  if (!issue.status) {
    testResults.failed.push("issue.status is missing");
  } else if (!VALID_ISSUE_STATUSES.includes(issue.status)) {
    testResults.failed.push(`Invalid issue.status: ${issue.status}. Expected: ${VALID_ISSUE_STATUSES.join(", ")}`);
  } else {
    testResults.passed.push(`Issue status: ${issue.status}`);
  }

  // Validate Level
  if (!issue.level) {
    testResults.failed.push("issue.level is missing");
  } else if (!VALID_ISSUE_LEVELS.includes(issue.level)) {
    testResults.failed.push(`Invalid issue.level: ${issue.level}. Expected: ${VALID_ISSUE_LEVELS.join(", ")}`);
  } else {
    testResults.passed.push(`Issue level: ${issue.level}`);
  }

  // Validate Timestamps
  if (!issue.created_at) testResults.failed.push("issue.created_at is missing");
  if (!issue.updated_at) testResults.failed.push("issue.updated_at is missing");
  if (issue.created_at && issue.updated_at) {
    testResults.passed.push("Issue timestamps are present");
  }

  // Validate Refs
  if (issue.refs && Array.isArray(issue.refs) && issue.refs.length > 0) {
    validateRefs(issue.refs, testResults);
  }

  // Validate Actors
  if (issue.actors && Array.isArray(issue.actors) && issue.actors.length > 0) {
    validateActors(issue.actors, testResults);
  }

  // Validate Actions
  if (issue.actions && Array.isArray(issue.actions) && issue.actions.length > 0) {
    validateActions(issue.actions, issue.last_action_id, testResults);
  }

  // Validate Resolutions if present
  if (issue.resolutions && Array.isArray(issue.resolutions) && issue.resolutions.length > 0) {
    validateResolutions(issue.resolutions, testResults);
  }
}
