import { ValidationAction } from "../../types/actions";
import { TestResult, Payload } from "../../types/payload";
import { createDomainValidator } from "../shared/baseValidator";
import { ackResponseSchema } from "../shared/responseSchemas";
import { checkJsonResponse } from "../shared/schemaValidator";

const actionToFileMap: Record<ValidationAction, string | undefined> = {
  search: "search",
  on_search: "OnSearch",
  select: undefined,
  on_select: undefined,
  init: "init",
  on_init: "OnInit",
  confirm: "confirm",
  on_confirm: "OnConfirm",
  update: "update",
  on_update: "OnUpdate",
  status: "status",
  on_status: "OnStatus",
  cancel: "cancel",
  on_cancel: "OnCancel",
  on_track: "OnTrack",
  track: "track",
};

const resolveVersion = (element: Payload) =>
  element?.jsonRequest?.context?.version || element?.jsonRequest?.context?.core_version;

const checkJsonResponseWithSchema = (jsonResponse: any, testResults: TestResult) =>
  checkJsonResponse(jsonResponse, testResults, ackResponseSchema);

export const validate = createDomainValidator(resolveVersion, checkJsonResponseWithSchema);
