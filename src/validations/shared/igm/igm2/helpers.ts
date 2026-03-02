import { TestResult } from "../../../../types/payload";
import {
  VALID_ACTION_CODES,
  VALID_ACTOR_TYPES,
  VALID_REF_TYPES,
  VALID_RESOLUTION_CODES
} from "../constants";

/**
 * Validates refs array
 */
export function validateRefs(refs: any[], testResults: TestResult): void {
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
export function validateActors(actors: any[], testResults: TestResult): void {
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
export function validateIssueDescriptor(descriptor: any, testResults: TestResult): void {
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
export function validateActions(actions: any[], lastActionId: string, testResults: TestResult): void {
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
export function validateResolutions(resolutions: any[], testResults: TestResult): void {
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
