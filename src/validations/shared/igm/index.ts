export { detectIgmVersion } from "./versionDetection";
export * from "./constants";

// IGM 1.0.0
export {
  validateIgm1Issue,
  validateIgm1OnIssue,
  validateIgm1IssueStatus,
  validateIgm1OnIssueStatus,
  validateIgm1ComplainantInfo,
  validateIgm1OrderDetails,
  validateIgm1Description,
  validateIgm1Source,
  validateIgm1IssueActions,
  validateIgm1ResolutionProvider,
  validateIgm1Resolution
} from "./igm1";

// IGM 2.0.0
export {
  validateIgm2Issue,
  validateIgm2OnIssue,
  validateIgm2IssueStatus,
  validateIgm2OnIssueStatus,
  validateRefs,
  validateActors,
  validateIssueDescriptor,
  validateActions,
  validateResolutions
} from "./igm2";
