import { ValidationAction } from "../../types/actions";
import { TestResult, Payload } from "../../types/payload";
import { logger } from "../../utils/logger";
import { checkJsonResponse } from "./schemaValidator";

type VersionResolver = (element: Payload) => string | undefined;

export function createLogisticsValidator(
  resolveVersion: VersionResolver
) {
  return async (
    element: Payload,
    action: ValidationAction,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> => {
    const version = resolveVersion(element);

    let testResults: TestResult = { response: {}, passed: [], failed: [] };

    try {
      const { jsonResponse } = element;

      if (jsonResponse) {
        checkJsonResponse(jsonResponse, testResults);
      }

      try {
        const imports = await Promise.all([
          import(`./${version}/search`).catch(() => ({})),
          import(`./${version}/OnSearch`).catch(() => ({})),
          import(`./${version}/init`).catch(() => ({})),
          import(`./${version}/OnInit`).catch(() => ({})),
          import(`./${version}/confirm`).catch(() => ({})),
          import(`./${version}/OnConfirm`).catch(() => ({})),
          import(`./${version}/OnStatus`).catch(() => ({})),
          import(`./${version}/cancel`).catch(() => ({})),
          import(`./${version}/OnCancel`).catch(() => ({})),
          import(`./${version}/status`).catch(() => ({})),
          import(`./${version}/update`).catch(() => ({})),
          import(`./${version}/OnUpdate`).catch(() => ({})),
          import(`./${version}/OnTrack`).catch(() => ({})),
          import(`./${version}/track`).catch(() => ({})),
        ]);

        const [
          search,
          onSearch,
          init,
          onInit,
          confirm,
          onConfirm,
          onStatus,
          cancel,
          onCancel,
          status,
          update,
          onUpdate,
          onTrack,
          track,
        ] = imports as any[];

        const runner = async (fn: Function | undefined) => {
          if (!fn) {
            testResults.failed.push(`No matching test function found for ${action}.`);
            return;
          }
          try {
            const result = await fn(element, sessionID, flowId);
            testResults.passed.push(...(result?.passed ?? []));
            testResults.failed.push(...(result?.failed ?? []));
            if (result?.response) testResults.response = result.response;
          } catch (err: any) {
            testResults.failed.push(`Test function error: ${err.message}`);
            logger.error(`Test function error: ${err.stack}`);
          }
        };

        switch (action) {
          case "search":
            await runner(search?.checkSearch);
            break;
          case "on_search":
            await runner(onSearch?.checkOnSearch);
            break;
          case "init":
            await runner(init?.checkInit);
            break;
          case "on_init":
            await runner(onInit?.checkOnInit);
            break;
          case "confirm":
            await runner(confirm?.checkConfirm);
            break;
          case "update":
            await runner(update?.checkUpdate);
            break;
          case "on_confirm":
            await runner(onConfirm?.checkOnConfirm);
            break;
          case "on_status":
            await runner(onStatus?.checkOnStatus);
            break;
          case "cancel":
            await runner(cancel?.checkCancel);
            break;
          case "on_cancel":
            await runner(onCancel?.checkOnCancel);
            break;
          case "status":
            await runner(status?.checkStatus);
            break;
          case "on_update":
            await runner(onUpdate?.checkOnUpdate);
            break;
          case "on_track":
            await runner(onTrack?.checkOnTrack);
            break;
          case "track":
            await runner(track?.checkTrack);
            break;
          default:
            testResults.failed.push(`No matching test function found for ${action}.`);
            break;
        }
      } catch (err: any) {
        testResults.failed.push(`Incorrect version for ${action}`);
        logger.error(`Error importing version-specific tests: ${err.stack}`);
      }

      return testResults;
    } catch (error: any) {
      logger.error(`Error during validation: ${error.message}`);
      return { response: {}, passed: [], failed: [`Error during ${action} test execution`] };
    }
  };
}


