import { TestResult } from "../../types/payload";

// ============================================
// IGM Version Detection
// ============================================

/**
 * Detects IGM version (1.0.0 or 2.0.0) based on payload structure.
 * Uses a scoring approach checking multiple field indicators.
 * 
 * IGM 1.0.0 uses: category, sub_category, complainant_info, order_details, 
 *                 issue_actions, issue_type, source, description
 * IGM 2.0.0 uses: level, refs, actors, actions, source_id, 
 *                 complainant_id, descriptor, update_target
 */
export function detectIgmVersion(message: any): '1.0.0' | '2.0.0' {
  const issue = message?.issue;
  
  if (!issue) {
    // Default to 2.0.0 if no issue object
    return '2.0.0';
  }
  
  // IGM 1.0.0 specific fields
  const igm1Indicators = [
    issue.category !== undefined,           // ITEM/FULFILLMENT
    issue.sub_category !== undefined,       // ITM01-04, FLM01-04
    issue.complainant_info !== undefined,   // Person/contact object
    issue.order_details !== undefined,      // Order info
    issue.issue_actions !== undefined,      // complainant_actions/respondent_actions
    issue.issue_type !== undefined,         // ISSUE/GRIEVANCE/DISPUTE
    issue.source?.network_participant_id !== undefined,
    issue.description !== undefined,        // short_desc/long_desc (not descriptor)
  ];
  
  // IGM 2.0.0 specific fields
  const igm2Indicators = [
    issue.level !== undefined,              // ISSUE/GRIEVANCE/DISPUTE
    issue.refs !== undefined && Array.isArray(issue.refs),
    issue.actors !== undefined && Array.isArray(issue.actors),
    issue.actions !== undefined && Array.isArray(issue.actions),
    issue.source_id !== undefined,          // Actor ID
    issue.complainant_id !== undefined,     // Actor ID
    issue.descriptor?.code !== undefined,   // descriptor with code
    message?.update_target !== undefined,   // For on_issue
  ];
  
  const igm1Score = igm1Indicators.filter(Boolean).length;
  const igm2Score = igm2Indicators.filter(Boolean).length;
  
  // Return version with higher score, default to 1.0.0 if tied (more conservative)
  return igm1Score >= igm2Score ? '1.0.0' : '2.0.0';
}

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
// IGM 2.0.0 Issue Status Validation
// ============================================

/**
 * Validates IGM 2.0.0 /issue_status request
 * Note: Payload structure is identical to IGM 1.0.0
 */
export function validateIgm2IssueStatus(
  message: any,
  testResults: TestResult
): void {
  // Issue status request is simple - just needs issue_id
  const issueId = message?.issue_id;
  
  if (!issueId) {
    testResults.failed.push("message.issue_id is missing in issue_status request");
  } else {
    testResults.passed.push(`Issue ID for status check: ${issueId}`);
  }
}

// ============================================
// IGM 2.0.0 On_Issue_Status Validation
// ============================================

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

// ============================================
// IGM 1.0.0 Constants
// ============================================

// Issue Categories (IGM 1.0.0)
export const VALID_IGM1_CATEGORIES = ["ITEM", "FULFILLMENT"];

// Item Sub-categories
export const VALID_IGM1_ITEM_SUBCATEGORIES = [
  "ITM01", "ITM02", "ITM03", "ITM04", "ITM05", "ITM06", "ITM07", "ITM08"
];

// Fulfillment Sub-categories
export const VALID_IGM1_FULFILLMENT_SUBCATEGORIES = [
  "FLM01", "FLM02", "FLM03", "FLM04", "FLM05", "FLM06", "FLM07", "FLM08"
];

// Issue Status (IGM 1.0.0: only OPEN/CLOSED)
export const VALID_IGM1_STATUSES = ["OPEN", "CLOSED"];

// Issue Types (IGM 1.0.0)
export const VALID_IGM1_ISSUE_TYPES = ["ISSUE", "GRIEVANCE", "DISPUTE"];

// Complainant Actions (IGM 1.0.0)
export const VALID_IGM1_COMPLAINANT_ACTIONS = ["OPEN", "ESCALATE", "CLOSE"];

// Respondent Actions (IGM 1.0.0)
export const VALID_IGM1_RESPONDENT_ACTIONS = ["PROCESSING", "CASCADED", "RESOLVED", "NEED-MORE-INFO"];

// Source Types (IGM 1.0.0)
export const VALID_IGM1_SOURCE_TYPES = ["CONSUMER", "SELLER", "INTERFACING NP"];

// Resolution Actions (IGM 1.0.0)
export const VALID_IGM1_RESOLUTION_ACTIONS = [
  "REFUND", "REPLACEMENT", "CANCEL", "NO-ACTION", "RECONCILED", "NOT-RECONCILED"
];

// Respondent Info Types (IGM 1.0.0)
export const VALID_IGM1_RESPONDENT_TYPES = [
  "INTERFACING-NP", "TRANSACTION-COUNTERPARTY-NP", "CASCADED-COUNTERPARTY-NP"
];

// GRO Types (IGM 1.0.0)
export const VALID_IGM1_GRO_TYPES = [
  "INTERFACING-NP-GRO", "TRANSACTION-COUNTERPARTY-NP-GRO", "CASCADED-COUNTERPARTY-NP-GRO"
];

// ============================================
// IGM 1.0.0 Issue Validation
// ============================================

/**
 * Validates IGM 1.0.0 /issue request
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

  // Validate Issue ID
  if (!issue.id) {
    testResults.failed.push("issue.id is missing");
  } else {
    testResults.passed.push(`Issue ID is present: ${issue.id}`);
  }

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

  // Validate Status
  if (!issue.status) {
    testResults.failed.push("issue.status is missing");
  } else if (!VALID_IGM1_STATUSES.includes(issue.status)) {
    testResults.failed.push(`issue.status must be OPEN or CLOSED, found: ${issue.status}`);
  } else {
    testResults.passed.push(`Issue status: ${issue.status}`);
  }

  // Validate Issue Type
  if (!issue.issue_type) {
    testResults.failed.push("issue.issue_type is missing");
  } else if (!VALID_IGM1_ISSUE_TYPES.includes(issue.issue_type)) {
    testResults.failed.push(`issue.issue_type must be ISSUE, GRIEVANCE, or DISPUTE, found: ${issue.issue_type}`);
  } else {
    testResults.passed.push(`Issue type: ${issue.issue_type}`);
  }

  // Validate Issue Actions
  validateIgm1IssueActions(issue.issue_actions, testResults);

  // Validate Timestamps
  if (!issue.created_at) testResults.failed.push("issue.created_at is missing");
  if (!issue.updated_at) testResults.failed.push("issue.updated_at is missing");
  if (issue.created_at && issue.updated_at) {
    testResults.passed.push("Issue timestamps are present");
  }
}

// ============================================
// IGM 1.0.0 On_Issue Validation
// ============================================

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

// ============================================
// IGM 1.0.0 Issue Status Validation
// ============================================

/**
 * Validates IGM 1.0.0 /issue_status request
 */
export function validateIgm1IssueStatus(
  message: any,
  testResults: TestResult
): void {
  // Issue status request is simple - just needs issue_id
  const issueId = message?.issue_id;
  
  if (!issueId) {
    testResults.failed.push("message.issue_id is missing in issue_status request");
  } else {
    testResults.passed.push(`Issue ID for status check: ${issueId}`);
  }
}

// ============================================
// IGM 1.0.0 On_Issue_Status Validation
// ============================================

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

// ============================================
// IGM 1.0.0 Helper Functions
// ============================================

/**
 * Validates complainant_info object
 */
function validateIgm1ComplainantInfo(info: any, testResults: TestResult): void {
  if (!info) {
    testResults.failed.push("issue.complainant_info is missing");
    return;
  }

  if (!info.person?.name) {
    testResults.failed.push("complainant_info.person.name is missing");
  } else {
    testResults.passed.push(`Complainant name: ${info.person.name}`);
  }

  if (!info.contact?.phone) {
    testResults.failed.push("complainant_info.contact.phone is missing");
  } else {
    testResults.passed.push(`Complainant phone: ${info.contact.phone}`);
  }
}

/**
 * Validates order_details object
 */
function validateIgm1OrderDetails(details: any, category: string, testResults: TestResult): void {
  if (!details) {
    testResults.failed.push("issue.order_details is missing");
    return;
  }

  if (!details.id) {
    testResults.failed.push("order_details.id is missing");
  } else {
    testResults.passed.push(`Order ID: ${details.id}`);
  }

  // Validate items (mandatory for ITEM category)
  if (category === "ITEM") {
    if (!details.items || details.items.length === 0) {
      testResults.failed.push("order_details.items is required for ITEM category");
    } else {
      details.items.forEach((item: any, idx: number) => {
        if (!item.id) testResults.failed.push(`order_details.items[${idx}].id is missing`);
        if (item.quantity === undefined) testResults.failed.push(`order_details.items[${idx}].quantity is missing`);
      });
      testResults.passed.push(`Items: ${details.items.length} item(s)`);
    }
  }

  // Validate fulfillments (mandatory for FULFILLMENT category)
  if (category === "FULFILLMENT") {
    if (!details.fulfillments || details.fulfillments.length === 0) {
      testResults.failed.push("order_details.fulfillments is required for FULFILLMENT category");
    } else {
      details.fulfillments.forEach((ful: any, idx: number) => {
        if (!ful.id) testResults.failed.push(`order_details.fulfillments[${idx}].id is missing`);
      });
      testResults.passed.push(`Fulfillments: ${details.fulfillments.length} fulfillment(s)`);
    }
  }

  if (!details.provider_id) {
    testResults.failed.push("order_details.provider_id is missing");
  } else {
    testResults.passed.push(`Provider ID: ${details.provider_id}`);
  }
}

/**
 * Validates description object
 */
function validateIgm1Description(desc: any, testResults: TestResult): void {
  if (!desc) {
    testResults.failed.push("issue.description is missing");
    return;
  }

  if (!desc.short_desc) {
    testResults.failed.push("description.short_desc is missing");
  } else {
    testResults.passed.push(`Description: ${desc.short_desc}`);
  }
}

/**
 * Validates source object
 */
function validateIgm1Source(source: any, testResults: TestResult): void {
  if (!source) {
    testResults.failed.push("issue.source is missing");
    return;
  }

  if (!source.network_participant_id) {
    testResults.failed.push("source.network_participant_id is missing");
  }

  if (!source.type) {
    testResults.failed.push("source.type is missing");
  } else if (!VALID_IGM1_SOURCE_TYPES.includes(source.type)) {
    testResults.failed.push(`source.type must be CONSUMER, SELLER, or INTERFACING NP, found: ${source.type}`);
  } else {
    testResults.passed.push(`Source type: ${source.type}`);
  }
}

/**
 * Validates issue_actions object
 */
function validateIgm1IssueActions(actions: any, testResults: TestResult): void {
  if (!actions) {
    testResults.failed.push("issue.issue_actions is missing");
    return;
  }

  // Validate complainant_actions
  if (actions.complainant_actions && Array.isArray(actions.complainant_actions)) {
    actions.complainant_actions.forEach((action: any, idx: number) => {
      if (!action.complainant_action) {
        testResults.failed.push(`complainant_actions[${idx}]: complainant_action is missing`);
      } else if (!VALID_IGM1_COMPLAINANT_ACTIONS.includes(action.complainant_action)) {
        testResults.failed.push(`complainant_actions[${idx}]: invalid action: ${action.complainant_action}`);
      }
      if (!action.updated_at) testResults.failed.push(`complainant_actions[${idx}]: updated_at is missing`);
      if (!action.updated_by) testResults.failed.push(`complainant_actions[${idx}]: updated_by is missing`);
    });
    testResults.passed.push(`Complainant actions: ${actions.complainant_actions.length} action(s)`);
  }

  // Validate respondent_actions
  if (actions.respondent_actions && Array.isArray(actions.respondent_actions)) {
    actions.respondent_actions.forEach((action: any, idx: number) => {
      if (!action.respondent_action) {
        testResults.failed.push(`respondent_actions[${idx}]: respondent_action is missing`);
      } else if (!VALID_IGM1_RESPONDENT_ACTIONS.includes(action.respondent_action)) {
        testResults.failed.push(`respondent_actions[${idx}]: invalid action: ${action.respondent_action}`);
      }
      if (!action.updated_at) testResults.failed.push(`respondent_actions[${idx}]: updated_at is missing`);
      if (!action.updated_by) testResults.failed.push(`respondent_actions[${idx}]: updated_by is missing`);
    });
    testResults.passed.push(`Respondent actions: ${actions.respondent_actions.length} action(s)`);
  }
}

/**
 * Validates resolution_provider object
 */
function validateIgm1ResolutionProvider(provider: any, testResults: TestResult): void {
  if (!provider.respondent_info) {
    testResults.failed.push("resolution_provider.respondent_info is missing");
    return;
  }

  const info = provider.respondent_info;

  if (!info.type) {
    testResults.failed.push("respondent_info.type is missing");
  } else if (!VALID_IGM1_RESPONDENT_TYPES.includes(info.type)) {
    testResults.failed.push(`respondent_info.type is invalid: ${info.type}`);
  } else {
    testResults.passed.push(`Resolution provider type: ${info.type}`);
  }

  if (!info.organization) {
    testResults.failed.push("respondent_info.organization is missing");
  }

  // Validate GROs if present
  if (info.resolution_support?.gros && Array.isArray(info.resolution_support.gros)) {
    info.resolution_support.gros.forEach((gro: any, idx: number) => {
      if (!gro.person?.name) testResults.failed.push(`gros[${idx}]: person.name is missing`);
      if (!gro.gro_type) {
        testResults.failed.push(`gros[${idx}]: gro_type is missing`);
      } else if (!VALID_IGM1_GRO_TYPES.includes(gro.gro_type)) {
        testResults.failed.push(`gros[${idx}]: invalid gro_type: ${gro.gro_type}`);
      }
    });
    testResults.passed.push(`GROs validated: ${info.resolution_support.gros.length}`);
  }
}

/**
 * Validates resolution object
 */
function validateIgm1Resolution(resolution: any, testResults: TestResult): void {
  if (!resolution.short_desc && !resolution.action_triggered) {
    testResults.failed.push("resolution must have short_desc or action_triggered");
    return;
  }

  if (resolution.action_triggered) {
    if (!VALID_IGM1_RESOLUTION_ACTIONS.includes(resolution.action_triggered)) {
      testResults.failed.push(`resolution.action_triggered is invalid: ${resolution.action_triggered}`);
    } else {
      testResults.passed.push(`Resolution action: ${resolution.action_triggered}`);
    }

    // refund_amount is required when action_triggered is REFUND
    if (resolution.action_triggered === "REFUND") {
      if (!resolution.refund_amount) {
        testResults.failed.push("resolution.refund_amount is required for REFUND action");
      } else {
        testResults.passed.push(`Refund amount: ${resolution.refund_amount}`);
      }
    }
  }
}
