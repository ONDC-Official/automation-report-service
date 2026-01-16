import { TestResult } from "../../types/payload";

// ============================================
// IGM 2.0.0 Constants
// ============================================

// Valid issue statuses
export const VALID_ISSUE_STATUSES = ["OPEN", "PROCESSING", "RESOLVED", "CLOSED"];

// Valid issue levels
export const VALID_ISSUE_LEVELS = ["ISSUE", "GRIEVANCE"];

// Valid action codes
export const VALID_ACTION_CODES = [
  "OPEN",
  "PROCESSING",
  "INFO_REQUESTED",
  "INFO_PROVIDED",
  "RESOLUTION_PROPOSED",
  "RESOLUTION_ACCEPTED",
  "RESOLUTION_REJECTED",
  "ESCALATED",
  "RESOLVED",
  "CLOSE"
];

// Valid actor types
export const VALID_ACTOR_TYPES = [
  "CONSUMER",
  "INTERFACING_NP",
  "COUNTERPARTY_NP",
  "COUNTERPARTY_NP_GRO",
  "CASCADED_COUNTERPARTY_NP",
  "CASCADED_COUNTERPARTY_NP_GRO"
];

// Valid reference types
export const VALID_REF_TYPES = ["ORDER", "PROVIDER", "FULFILLMENT", "ITEM", "TRANSACTION"];

// Valid resolution codes
export const VALID_RESOLUTION_CODES = ["REFUND", "REPLACEMENT", "PARENT", "NO_ACTION", "COUPON"];

// ============================================
// IGM 2.0.0 Issue Validation
// ============================================

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

// ============================================
// IGM 2.0.0 On_Issue Validation
// ============================================

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

// ============================================
// Helper Functions
// ============================================

/**
 * Validates refs array
 */
function validateRefs(refs: any[], testResults: TestResult): void {
  if (!refs || !Array.isArray(refs) || refs.length === 0) {
    testResults.failed.push("issue.refs is missing or empty");
    return;
  }

  // Check for required ORDER ref
  const hasOrderRef = refs.some(r => r.ref_type === "ORDER");
  if (!hasOrderRef) {
    testResults.failed.push("issue.refs must contain at least one ORDER reference");
  } else {
    testResults.passed.push("ORDER reference found in refs");
  }

  refs.forEach((ref: any, index: number) => {
    if (!ref.ref_id) {
      testResults.failed.push(`refs[${index}]: ref_id is missing`);
    }
    if (!ref.ref_type) {
      testResults.failed.push(`refs[${index}]: ref_type is missing`);
    } else if (!VALID_REF_TYPES.includes(ref.ref_type)) {
      testResults.failed.push(`refs[${index}]: invalid ref_type: ${ref.ref_type}`);
    }
  });

  testResults.passed.push(`Refs validated (${refs.length} references)`);
}

/**
 * Validates actors array
 */
function validateActors(actors: any[], testResults: TestResult): void {
  if (!actors || !Array.isArray(actors) || actors.length === 0) {
    testResults.failed.push("issue.actors is missing or empty");
    return;
  }

  // Check for required actor types
  const hasConsumer = actors.some(a => a.type === "CONSUMER");
  const hasInterfacingNP = actors.some(a => a.type === "INTERFACING_NP");

  if (!hasConsumer) {
    testResults.failed.push("issue.actors must contain a CONSUMER actor");
  }
  if (!hasInterfacingNP) {
    testResults.failed.push("issue.actors must contain an INTERFACING_NP actor");
  }

  actors.forEach((actor: any, index: number) => {
    if (!actor.id) testResults.failed.push(`actors[${index}]: id is missing`);
    if (!actor.type) {
      testResults.failed.push(`actors[${index}]: type is missing`);
    } else if (!VALID_ACTOR_TYPES.includes(actor.type)) {
      testResults.failed.push(`actors[${index}]: invalid type: ${actor.type}`);
    }
    
    // Validate actor info
    if (!actor.info) {
      testResults.failed.push(`actors[${index}]: info is missing`);
    } else {
      if (!actor.info.org?.name) testResults.failed.push(`actors[${index}]: info.org.name is missing`);
      if (!actor.info.contact?.phone && !actor.info.contact?.email) {
        testResults.failed.push(`actors[${index}]: info.contact (phone or email) is missing`);
      }
    }
  });

  testResults.passed.push(`Actors validated (${actors.length} actors)`);
}

/**
 * Validates issue descriptor
 */
function validateIssueDescriptor(descriptor: any, testResults: TestResult): void {
  if (!descriptor) {
    testResults.failed.push("issue.descriptor is missing");
    return;
  }

  if (!descriptor.code) {
    testResults.failed.push("issue.descriptor.code is missing");
  } else {
    testResults.passed.push(`Issue category code: ${descriptor.code}`);
  }

  if (!descriptor.short_desc) {
    testResults.failed.push("issue.descriptor.short_desc is missing");
  }
}

/**
 * Validates actions array
 */
function validateActions(actions: any[], lastActionId: string, testResults: TestResult): void {
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    testResults.failed.push("issue.actions is missing or empty");
    return;
  }

  actions.forEach((action: any, index: number) => {
    if (!action.id) testResults.failed.push(`actions[${index}]: id is missing`);
    if (!action.descriptor?.code) {
      testResults.failed.push(`actions[${index}]: descriptor.code is missing`);
    } else if (!VALID_ACTION_CODES.includes(action.descriptor.code)) {
      testResults.failed.push(`actions[${index}]: invalid action code: ${action.descriptor.code}`);
    }
    if (!action.updated_at) testResults.failed.push(`actions[${index}]: updated_at is missing`);
    if (!action.action_by) testResults.failed.push(`actions[${index}]: action_by is missing`);
  });

  // Validate last_action_id matches last action
  if (lastActionId) {
    const lastAction = actions[actions.length - 1];
    if (lastAction && lastAction.id !== lastActionId) {
      testResults.failed.push(`last_action_id (${lastActionId}) does not match last action id (${lastAction.id})`);
    } else if (lastAction) {
      testResults.passed.push(`last_action_id correctly matches: ${lastActionId}`);
    }
  }

  testResults.passed.push(`Actions validated (${actions.length} actions)`);
}

/**
 * Validates resolutions array
 */
function validateResolutions(resolutions: any[], testResults: TestResult): void {
  resolutions.forEach((resolution: any, index: number) => {
    if (!resolution.id) testResults.failed.push(`resolutions[${index}]: id is missing`);
    if (!resolution.descriptor?.code) {
      testResults.failed.push(`resolutions[${index}]: descriptor.code is missing`);
    } else if (!VALID_RESOLUTION_CODES.includes(resolution.descriptor.code)) {
      testResults.failed.push(`resolutions[${index}]: invalid resolution code: ${resolution.descriptor.code}`);
    }
    if (!resolution.proposed_by && resolution.descriptor?.code !== "PARENT") {
      testResults.failed.push(`resolutions[${index}]: proposed_by is missing`);
    }
  });

  testResults.passed.push(`Resolutions validated (${resolutions.length} resolutions)`);
}
