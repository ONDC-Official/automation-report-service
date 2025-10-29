import { ValidationAction } from "../../types/actions";
import { Payload, TestResult } from "../../types/payload";
import { createDomainValidator } from "../shared/baseValidator";
import { ackOnlySchema } from "../shared/responseSchemas";
import { checkJsonResponse } from "../shared/schemaValidator";

const actionToFileMap: Record<ValidationAction, string | undefined> = {
  search: "search",
  on_search: "OnSearch",
  select: "select",
  on_select: "OnSelect",
  init: "init",
  on_init: "OnInit",
  confirm: "confirm",
  on_confirm: "OnConfirm",
  on_status: "OnStatus",
  cancel: "cancel",
  on_cancel: "OnCancel",
  status: "status",
  on_update: "OnUpdate",
  // trv11 doesn't have track/on_track
  on_track: undefined,
  track: undefined,
  update: undefined,
};

const resolveVersion = (element: Payload) => element?.jsonRequest?.context?.version;

const checkJsonResponseWithSchema = (jsonResponse: any, testResults: TestResult) =>
  checkJsonResponse(jsonResponse, testResults, ackOnlySchema);

export const validate = createDomainValidator(actionToFileMap, resolveVersion, checkJsonResponseWithSchema);
