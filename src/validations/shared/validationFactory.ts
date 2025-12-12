import { TestResult, Payload } from "../../types/payload";
import {
  createBaseValidationSetup,
  validateHolidays,
  validateLBNPFeatures,
  validateLSPFeatures,
  validatePrepaidPaymentFlow,
  validateCODFlow,
  addDefaultValidationMessage,
  validateTransactionId,
  validateSlaMetricsSearch,
  validateSlaMetricsConfirm,
  validateNpTaxType,
  validateCodifiedStaticTerms,
  validateCustomerContactDetails,
  validatePublicSpecialCapabilities,
  validateSellerCreds,
  validateEpodProofs,
  validateP2H2PRequirements,
} from "./commonValidations";
import { addTransactionId, updateApiMap } from "../../utils/redisUtils";
import {
  validateTATForFulfillments,
  validateShipmentTypes,
} from "./onSearchValidations";
import { validatorConstant } from "./validatorConstant";
import logger from "@ondc/automation-logger";
import {
  GOLD_LOAN_FLOWS,
  PAYMENT_COLLECTED_BY,
  PERSONAL_LOAN_FLOWS,
} from "../../utils/constants";

const fis11Validators = validatorConstant.beckn.ondc.fis.fis11.v200;
const fis12Validators = validatorConstant.beckn.ondc.fis.fis12.v202;
const log11Validators = validatorConstant.beckn.ondc.log.v125;
const trv10Validators = validatorConstant.beckn.ondc.trv.trv10.v210;

/**
 * Wrapper function to validate TAT for on_select, on_init, and on_confirm actions
 */
function validateTAT(message: any, testResults: TestResult): void {
  const catalog = message?.catalog;
  if (catalog?.["bpp/providers"]) {
    const contextTimestamp = new Date();
    catalog["bpp/providers"].forEach((provider: any) => {
      if (provider.fulfillments) {
        validateTATForFulfillments(
          provider.fulfillments,
          contextTimestamp,
          testResults
        );
      }
    });
  }
}

/**
 * Wrapper function to validate shipment types for on_select, on_init, and on_confirm actions
 */
function validateShipmentTypesWrapper(
  message: any,
  testResults: TestResult
): void {
  const catalog = message?.catalog;
  if (catalog?.["bpp/providers"]) {
    catalog["bpp/providers"].forEach((provider: any) => {
      if (provider.fulfillments) {
        validateShipmentTypes(provider.fulfillments, testResults);
      }
    });
  }
}

function validateIntent(
  message: any,
  testResults: TestResult,
  action_id?: string,
  flow_id?: string
): void {
  const intent = message?.intent;
  if (!intent) {
    testResults.failed.push("Intent is missing in search request");
    return;
  }

  if (!intent.category?.descriptor?.code) {
    testResults.failed.push("Intent category descriptor code is missing");
  } else {
    if (action_id === "search_rental") {
      if (intent.category?.descriptor?.code !== "ON_DEMAND_RENTAL") {
        testResults.failed.push(
          "Intent category descriptor code should be ON_DEMAND_RENTAL for on_search_rental"
        );
      }
    } else if (action_id === "search_schedule_rental") {
      if (intent.category?.descriptor?.code !== "SCHEDULED_RENTAL") {
        testResults.failed.push(
          "Intent category descriptor code should be SCHEDULED_RENTAL for on_search_schedule_rental"
        );
      }
    } else if (action_id === "search_trip") {
      if (intent.category?.descriptor?.code !== "ON_DEMAND_TRIP") {
        testResults.failed.push(
          "Intent category descriptor code should be ON_DEMAND_TRIP for on_search_trip"
        );
      }
    } else if (flow_id && GOLD_LOAN_FLOWS.includes(flow_id)) {
      if (intent.category?.descriptor?.code !== "GOLD_LOAN") {
        testResults.failed.push(
          `Intent category descriptor code should be GOLD_LOAN for ${flow_id}`
        );
      } else {
        testResults.passed.push(
          `Valid intent category descriptor code ${intent.category?.descriptor?.code} is present `
        );
      }
    } else if (flow_id && PERSONAL_LOAN_FLOWS.includes(flow_id)) {
      if (intent.category?.descriptor?.code !== "PERSONAL_LOAN") {
        testResults.failed.push(
          `Intent category descriptor code should be PERSONAL_LOAN for ${flow_id}`
        );
      } else {
        testResults.passed.push(
          `Valid intent category descriptor code ${intent.category?.descriptor?.code} is present `
        );
      }
    } else {
      testResults.passed.push(
        `Valid intent category descriptor code ${intent.category?.descriptor?.code} is present `
      );
    }
  }

  if (!intent.payment?.collected_by) {
    testResults.failed.push("Payment collected_by is missing in intent");
  } else if (!PAYMENT_COLLECTED_BY.includes(intent.payment?.collected_by)) {
    testResults.passed.push(
      `Invalid payment collected_by found in intent,collected by should be one of these ${PAYMENT_COLLECTED_BY}`
    );
  } else {
    testResults.passed.push(
      `Payment collected_by ${intent.payment?.collected_by} is present in intent`
    );
  }
}

function validatePaymentCollectedBy(
  message: any,
  testResults: TestResult
): void {
  const payment = message?.intent?.payment;
  if (payment?.collected_by && ["BAP", "BPP"].includes(payment.collected_by)) {
    testResults.passed.push(
      `Payment collected_by has valid value ${payment.collected_by}`
    );
  } else {
    testResults.failed.push("Payment collected_by should be BAP or BPP");
  }
}

function validateTags(message: any, testResults: TestResult): void {
  const tags =
    message?.intent?.tags || message?.order?.tags || message?.catalog?.tags;
  if (tags && Array.isArray(tags)) {
    const bapTerms = tags.find((tag) => tag.descriptor?.code === "BAP_TERMS");
    const bppTerms = tags.find((tag) => tag.descriptor?.code === "BPP_TERMS");

    if (bapTerms) {
      testResults.passed.push("BAP_TERMS tag is present");
    }
    if (bppTerms) {
      testResults.passed.push("BPP_TERMS tag is present");
    }
  }
}

function validateFulfillmentStops(
  message: any,
  testResults: TestResult,
  action_id?: string,
  flowId?: string
): void {
  const fulfillment = message?.intent?.fulfillment;
  if (!fulfillment) {
    testResults.failed.push("Fulfillment is missing in intent");
    return;
  }

  const stops = fulfillment.stops;
  if (!stops || !Array.isArray(stops)) {
    testResults.failed.push("Fulfillment stops array is missing or invalid");
    return;
  }

  if (
    action_id !== "search_rental" &&
    action_id !== "on_search_rental" &&
    flowId !== "Schedule_Rental" &&
    stops.length < 2
  ) {
    testResults.failed.push(
      "Fulfillment stops must have at least START and END stops"
    );
    return;
  }

  // TRV10 supports intermediate stops in search intent
  const validTypes = ["START", "INTERMEDIATE_STOP", "END"];
  let hasStart = false;
  let hasEnd = false;
  let lastStopId: string | undefined = undefined;
  let idsAreUnique = true;
  const seenIds = new Set<string>();

  stops.forEach((stop: any, index: number) => {
    // Validate unique stop id if present
    if (stop.id) {
      if (seenIds.has(stop.id)) {
        idsAreUnique = false;
        testResults.failed.push(`Stop ${index} id '${stop.id}' is duplicated`);
      } else {
        seenIds.add(stop.id);
      }
    }

    // Validate stop type
    if (!stop.type) {
      testResults.failed.push(`Stop ${index} type is missing`);
    } else if (!validTypes.includes(stop.type)) {
      testResults.failed.push(
        `Stop ${index} type must be START, INTERMEDIATE_STOP or END, got ${stop.type}`
      );
    } else {
      if (stop.type === "START") hasStart = true;
      if (stop.type === "END") hasEnd = true;
      testResults.passed.push(`Stop ${index} has valid type: ${stop.type}`);

      // Parent linkage validation for multi-stop chains:
      // - START should not have parent_stop_id
      // - INTERMEDIATE_STOP and END should have parent_stop_id equal to previous stop's id when ids are present
      if (stop.type === "START") {
        if (stop.parent_stop_id) {
          testResults.failed.push(
            `Stop ${index} is START but has parent_stop_id '${stop.parent_stop_id}'`
          );
        }
      } else {
        if (
          stop.parent_stop_id &&
          lastStopId &&
          stop.parent_stop_id !== lastStopId
        ) {
          testResults.failed.push(
            `Stop ${index} parent_stop_id '${stop.parent_stop_id}' does not match previous stop id '${lastStopId}'`
          );
        }
      }
    }

    // Validate location GPS
    if (!stop.location) {
      testResults.failed.push(`Stop ${index} location is missing`);
    } else if (!stop.location.gps && !stop.location.circle.gps) {
      testResults.failed.push(`Stop ${index} location GPS is missing`);
    } else {
      // Validate GPS format (lat,lng)
      const gpsPattern = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/;
      if (gpsPattern.test(stop.location.gps || !stop.location.circle.gps)) {
        testResults.passed.push(`Stop ${index} has valid GPS coordinates`);
      } else {
        testResults.failed.push(
          `Stop ${index} GPS format is invalid. Expected format: lat,lng`
        );
      }
    }

    // Track last stop id for chaining checks
    if (stop.id) {
      lastStopId = stop.id;
    } else {
      // If no explicit id provided, we cannot validate chaining via parent_stop_id reliably
      lastStopId = undefined;
    }
  });

  // if (!hasStart) {
  //   testResults.failed.push(
  //     "Fulfillment stops must include at least one START stop"
  //   );
  // }
  // if (action_id !== "search_rental" && action_id !== "on_search_rental" && action_id !== "on_select_rental" && !hasEnd) {
  //   testResults.failed.push(
  //     "Fulfillment stops must include at least one END stop"
  //   );
  // }
  if (hasStart && hasEnd) {
    testResults.passed.push(
      "Fulfillment stops include both START and END stops"
    );
  }
  if (idsAreUnique) {
    testResults.passed.push("Fulfillment stop ids are unique");
  }
}

function validateFulfillmentStopsInCatalog(
  message: any,
  testResults: TestResult,
  action_id?: string,
  flowId?: string
): void {
  const catalog = message?.catalog;
  if (!catalog) {
    testResults.failed.push("Catalog is missing in on_search response");
    return;
  }

  const providers = catalog.providers;
  if (!providers || !Array.isArray(providers) || providers.length === 0) {
    testResults.failed.push("Catalog providers array is missing or empty");
    return;
  }

  let allProvidersValid = true;
  const validTypes = ["START", "INTERMEDIATE_STOP", "END"];

  providers.forEach((provider: any, providerIndex: number) => {
    const fulfillments = provider?.fulfillments;
    if (
      !fulfillments ||
      !Array.isArray(fulfillments) ||
      fulfillments.length === 0
    ) {
      testResults.failed.push(
        `Provider ${providerIndex} fulfillments array is missing or empty`
      );
      allProvidersValid = false;
      return;
    }

    fulfillments.forEach((fulfillment: any, fulfillmentIndex: number) => {
      const stops = fulfillment?.stops;
      if (!stops || !Array.isArray(stops)) {
        testResults.failed.push(
          `Provider ${providerIndex}, Fulfillment ${fulfillmentIndex}: stops array is missing or invalid`
        );
        allProvidersValid = false;
        return;
      }

      if (
        action_id !== "on_search_rental" &&
        action_id !== "on_search_schedule_rental" &&
        stops.length < 2
      ) {
        testResults.failed.push(
          `Provider ${providerIndex}, Fulfillment ${fulfillmentIndex}: must have at least START and END stops`
        );
        allProvidersValid = false;
        return;
      }

      let hasStart = false;
      let hasEnd = false;

      stops.forEach((stop: any, stopIndex: number) => {
        const stopLabel = `Provider ${providerIndex}, Fulfillment ${fulfillmentIndex}, Stop ${stopIndex}`;

        // Validate stop type
        if (!stop.type) {
          testResults.failed.push(`${stopLabel}: type is missing`);
          allProvidersValid = false;
        } else if (!validTypes.includes(stop.type)) {
          testResults.failed.push(
            `${stopLabel}: type must be START or END, got ${stop.type}`
          );
          allProvidersValid = false;
        } else {
          if (stop.type === "START") hasStart = true;
          if (stop.type === "END") hasEnd = true;
          testResults.passed.push(`${stopLabel}: has valid type ${stop.type}`);
        }

        // Validate location GPS
        if (!stop.location) {
          testResults.failed.push(`${stopLabel}: location is missing`);
          allProvidersValid = false;
        } else if (!stop.location.gps && !stop.location.circle?.gps) {
          testResults.failed.push(`${stopLabel}: location GPS is missing`);
          allProvidersValid = false;
        } else {
          // Validate GPS format (lat,lng)
          const gpsPattern = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/;
          if (gpsPattern.test(stop.location.gps || stop.location.circle.gps)) {
            testResults.passed.push(`${stopLabel}: has valid GPS coordinates`);
          } else {
            testResults.failed.push(
              `${stopLabel}: GPS format is invalid. Expected format: lat,lng`
            );
            allProvidersValid = false;
          }
        }
      });

      if (!hasStart) {
        testResults.failed.push(
          `Provider ${providerIndex}, Fulfillment ${fulfillmentIndex}: must include at least one START stop`
        );
        allProvidersValid = false;
      }
      if (
        action_id !== "on_search_rental" &&
        !hasEnd &&
        action_id !== "on_search_schedule_rental"
      ) {
        testResults.failed.push(
          `Provider ${providerIndex}, Fulfillment ${fulfillmentIndex}: must include at least one END stop`
        );
        allProvidersValid = false;
      }
      if (hasStart && hasEnd) {
        testResults.passed.push(
          `Provider ${providerIndex}, Fulfillment ${fulfillmentIndex}: includes both START and END stops`
        );
      }
    });
  });

  if (allProvidersValid && providers.length > 0) {
    testResults.passed.push(
      "All providers have valid fulfillment stops with START and END"
    );
  }
}

// function validateFulfillmentStopsInOrder(
//   message: any,
//   testResults: TestResult,
//   action_id?: string,
//   flowId?: string
// ): void {
//   const order = message?.order;
//   if (!order) {
//     testResults.failed.push("Order is missing in response");
//     return;
//   }
//   if (action_id === "update_quote") {
//     return;
//   }

//   const fulfillments = order.fulfillments;
//   if (
//     !fulfillments ||
//     !Array.isArray(fulfillments) ||
//     fulfillments.length === 0
//   ) {
//     testResults.failed.push("Order fulfillments array is missing or empty");
//     return;
//   }

//   let allFulfillmentsValid = true;
//   const validTypes = ["START", "INTERMEDIATE_STOP", "END"];

//   fulfillments.forEach((fulfillment: any, fulfillmentIndex: number) => {
//     const stops = fulfillment?.stops;
//     if (!stops || !Array.isArray(stops)) {
//       testResults.failed.push(
//         `Fulfillment ${fulfillmentIndex}: stops array is missing or invalid`
//       );
//       allFulfillmentsValid = false;
//       return;
//     }

//     if (stops.length < 1) {
//       testResults.failed.push(
//         `Fulfillment ${fulfillmentIndex}: must have at least START and END stops`
//       );
//       allFulfillmentsValid = false;
//       return;
//     }

//     let hasStart = false;
//     let hasEnd = false;

//     stops.forEach((stop: any, stopIndex: number) => {
//       const stopLabel = `Fulfillment ${fulfillmentIndex}, Stop ${stopIndex}`;

//       // Validate stop type
//       if (!stop.type) {
//         testResults.failed.push(`${stopLabel}: type is missing`);
//         allFulfillmentsValid = false;
//       } else if (!validTypes.includes(stop.type)) {
//         testResults.failed.push(
//           `${stopLabel}: type must be START or END, got ${stop.type}`
//         );
//         allFulfillmentsValid = false;
//       } else {
//         if (stop.type === "START") hasStart = true;
//         if (stop.type === "END") hasEnd = true;
//         testResults.passed.push(`${stopLabel}: has valid type ${stop.type}`);
//       }

//       // Validate location GPS
//       if (flowId !== "OnDemand_Rental" && action_id !== "init" && action_id !== "on_update") {
//         if (!stop.location) {
//           testResults.failed.push(`${stopLabel}: location is missing`);
//           allFulfillmentsValid = false;
//         } else if (!stop.location.gps && !stop.location.circle.gps) {
//           testResults.failed.push(`${stopLabel}: location GPS is missing`);
//           allFulfillmentsValid = false;
//         } else {
//           // Validate GPS format (lat,lng)
//           const gpsPattern = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/;
//           if (
//             gpsPattern.test(
//               stop.location.gps.trim() || stop.location.circle.gps.trim()
//             )
//           ) {
//             testResults.passed.push(`${stopLabel}: has valid GPS coordinates`);
//           } else {
//             testResults.failed.push(
//               `${stopLabel}: GPS format is invalid. Expected format: lat,lng`
//             );
//             allFulfillmentsValid = false;
//           }
//         }
//         if (!hasStart) {
//           testResults.failed.push(
//             `Fulfillment ${fulfillmentIndex}: must include at least one START stop`
//           );
//           allFulfillmentsValid = false;
//         }
//         if (!hasEnd && flowId !== "Schedule_Rental" && action_id !== "on_update" && flowId !== "Schedule_Trip" && flowId !== "OnDemand_Rentalwhen_end_stop_gps_coordinate_is_present") {
//           testResults.failed.push(
//             `Fulfillment ${fulfillmentIndex}: must include at least one END stop`
//           );
//           allFulfillmentsValid = false;
//         }
//         if (hasStart && hasEnd) {
//           testResults.passed.push(
//             `Fulfillment ${fulfillmentIndex}: includes both START and END stops`
//           );
//         }
//       }
//     });
//   });

//   if (allFulfillmentsValid && fulfillments.length > 0) {
//     testResults.passed.push(
//       "All fulfillments have valid stops with START and END"
//     );
//   }
// }

function validateFulfillmentStopsInOrder(
  message: any,
  testResults: TestResult,
  action_id?: string,
  flowId?: string
): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing in response");
    return;
  }

  // Skip validation for update_quote as per business rule
  if (action_id === "update_quote") return;

  const fulfillments = order.fulfillments;
  if (!Array.isArray(fulfillments) || fulfillments.length === 0) {
    testResults.failed.push("Order fulfillments array is missing or empty");
    return;
  }

  let allFulfillmentsValid = true;
  const validTypes = ["START", "INTERMEDIATE_STOP", "END"];

  fulfillments.forEach((fulfillment: any, fIndex: number) => {
    const stops = fulfillment?.stops;

    if (!Array.isArray(stops) || stops.length === 0) {
      testResults.failed.push(
        `Fulfillment ${fIndex}: stops array is missing or empty`
      );
      allFulfillmentsValid = false;
      return;
    }

    let hasStart = false;
    let hasEnd = false;

    stops.forEach((stop: any, sIndex: number) => {
      const label = `Fulfillment ${fIndex}, Stop ${sIndex}`;

      // ---------------------- Validate Stop Type ------------------------
      if (!stop.type || !validTypes.includes(stop.type)) {
        testResults.failed.push(`${label}: invalid or missing stop type`);
        allFulfillmentsValid = false;
      } else {
        testResults.passed.push(`${label}: valid type ${stop.type}`);

        if (stop.type === "START") hasStart = true;
        if (stop.type === "END") hasEnd = true;
      }

      // ---------------------- GPS validation exceptions ------------------
      const skipGPSValidation =
        flowId === "OnDemand_Rental" ||
        action_id === "init" ||
        action_id === "on_update";

      if (skipGPSValidation) return;

      // ---------------------- Validate Location --------------------------
      const gps = stop.location?.gps || stop.location?.circle?.gps;

      if (!gps) {
        testResults.failed.push(`${label}: location GPS is missing`);
        allFulfillmentsValid = false;
        return;
      }

      const gpsPattern = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;

      if (!gpsPattern.test(gps.trim())) {
        testResults.failed.push(
          `${label}: invalid GPS format (expected lat,lng)`
        );
        allFulfillmentsValid = false;
      } else {
        testResults.passed.push(`${label}: valid GPS format`);
      }
    });

    // ---------------------- FINAL STOP VALIDATIONS (after loop) ----------------------
    const endStopExemptFlows = [
      "Schedule_Rental",
      "Schedule_Trip",
      "OnDemand_Rentalwhen_end_stop_gps_coordinate_is_present",
      "No_Acceptance_SoftUpdate",
    ];

    const starttopExemptFlows = [
      "No_Acceptance_SoftUpdate",
      "OnDemand_Update_Stop",
    ];

    const startActionIds = ["update", "on_update"];

    if (
      !hasStart &&
      !starttopExemptFlows.includes(flowId || "") &&
      !startActionIds.includes(action_id || "")
    ) {
      testResults.failed.push(
        `Fulfillment ${fIndex}: must include at least one START stop`
      );
      allFulfillmentsValid = false;
    }

    if (
      !hasEnd &&
      !endStopExemptFlows.includes(flowId || "") &&
      action_id !== "on_update"
    ) {
      testResults.failed.push(
        `Fulfillment ${fIndex}: must include at least one END stop`
      );
      allFulfillmentsValid = false;
    }

    if (hasStart && hasEnd) {
      testResults.passed.push(
        `Fulfillment ${fIndex}: includes both START and END stops`
      );
    }
  });

  if (allFulfillmentsValid) {
    testResults.passed.push(
      "All fulfillments have valid stops with START and END"
    );
  }
}

function validateCatalog(message: any, testResults: TestResult): void {
  const catalog = message?.catalog;
  if (!catalog) {
    testResults.failed.push("Catalog is missing in on_search response");
    return;
  }

  if (!catalog.descriptor?.name) {
    testResults.failed.push("Catalog descriptor name is missing");
  } else {
    testResults.passed.push("Catalog descriptor name is present");
  }

  if (!catalog.providers || !Array.isArray(catalog.providers)) {
    testResults.failed.push("Catalog providers array is missing or invalid");
  } else {
    testResults.passed.push("Catalog providers array is present");
  }
}

function validateProviders(message: any, testResults: TestResult): void {
  const providers = message?.catalog?.providers || message?.order?.provider;
  if (Array.isArray(providers)) {
    providers.forEach((provider, index) => {
      if (!provider.id) {
        testResults.failed.push(`Provider ${index} ID is missing`);
      } else {
        testResults.passed.push(`Provider ${index} ID is present`);
      }

      if (!provider.descriptor?.name) {
        testResults.failed.push(`Provider ${index} descriptor name is missing`);
      } else {
        testResults.passed.push(`Provider ${index} descriptor name is present`);
      }
    });
  } else if (providers) {
    if (!providers.id) {
      testResults.failed.push("Provider ID is missing");
    } else {
      testResults.passed.push("Provider ID is present");
    }
  }
}

function validateProvidersTRV10(message: any, testResults: TestResult): void {
  const providers = message?.catalog?.providers || message?.order?.provider;
  if (Array.isArray(providers)) {
    providers.forEach((provider, index) => {
      if (!provider.id) {
        testResults.failed.push(`Provider ${index} ID is missing`);
      } else {
        testResults.passed.push(`Provider ${index} ID is present`);
      }

      // For TRV10, descriptor name is optional
      if (provider.descriptor?.name) {
        testResults.passed.push(`Provider ${index} descriptor name is present`);
      }
    });
  } else if (providers) {
    if (!providers.id) {
      testResults.failed.push("Provider ID is missing");
    } else {
      testResults.passed.push("Provider ID is present");
    }
  }
}

function validateProvider(
  message: any,
  testResults: TestResult,
  action_id: string,
  usecaseId?: string
): void {
  const provider = message?.order?.provider;
  if (!provider) {
    testResults.failed.push("Provider is missing in order");
    return;
  }

  if (!provider.id) {
    testResults.failed.push("Provider ID is missing");
  } else {
    testResults.passed.push("Provider ID is present");
  }
  if (
    usecaseId !== "GOLD LOAN" &&
    usecaseId !== "PERSONAL LOAN" &&
    action_id !== "select_2" &&
    action_id !== "select" &&
    action_id !== "init" &&
    action_id !== "confirm" &&
    action_id !== "confirm_card_balance_faliure" &&
    action_id !== "confirm_card_balance_success"
  ) {
    if (!provider.descriptor?.name) {
      testResults.failed.push("Provider descriptor name is missing");
    } else {
      testResults.passed.push("Provider descriptor name is present");
    }
  }
}

function validateProviderTRV10(
  message: any,
  testResults: TestResult,
  action_id: string
): void {
  const provider = message?.order?.provider;
  if (!provider) {
    testResults.failed.push("Provider is missing in order");
    return;
  }

  if (!provider.id) {
    testResults.failed.push("Provider ID is missing");
  } else {
    testResults.passed.push("Provider ID is present");
  }

  // For TRV10, descriptor name is optional for all actions
  if (provider.descriptor?.name) {
    testResults.passed.push("Provider descriptor name is present");
  }
}

function validateItems(
  message: any,
  testResults: TestResult,
  action_id?: string,
  flowId?: string,
  usecaseId?: string
): void {
  const items =
    message?.catalog?.providers?.[0]?.items || message?.order?.items;
  if (!items || !Array.isArray(items)) {
    testResults.failed.push("Items array is missing or invalid");
    return;
  }

  items.forEach((item, index) => {
    if (!item.id) {
      testResults.failed.push(`Item ${index} ID is missing`);
    } else {
      testResults.passed.push(`Item ${index} ID is present`);
    }
    if (
      usecaseId !== "GOLD LOAN" &&
      usecaseId !== "PERSONAL LOAN" 
    ) {
      if (
        action_id !== "select" &&
        action_id !== "select_rental" &&
        action_id !== "select_adjust_loan_amount" &&
        action_id !== "init" &&
        action_id !== "confirm" &&
        action_id !== "confirm_card_balance_faliure" &&
        action_id !== "confirm_card_balance_success"
      ) {
        if (!item.descriptor?.name) {
          testResults.failed.push(`Item ${index} descriptor name is missing`);
        } else {
          testResults.passed.push(`Item ${index} descriptor name is present`);
        }
      }

      if (
        action_id !== "select_rental" &&
        action_id !== "select_adjust_loan_amount" &&
        !item.price?.value
      ) {
        testResults.failed.push(`Item ${index} price value is missing`);
      } else {
        if (item.price?.value) {
          testResults.passed.push(`Item ${index} price value is present`);
        } else if (action_id === "select_adjust_loan_amount") {
          testResults.passed.push(
            `Item ${index} price value is optional for select_adjust_loan_amount action`
          );
        }
      }
    }
  });
}

function validateItemsTRV10(
  message: any,
  testResults: TestResult,
  action_id?: string
): void {
  const items =
    message?.catalog?.providers?.[0]?.items || message?.order?.items;
  if (!items || !Array.isArray(items)) {
    testResults.failed.push("Items array is missing or invalid");
    return;
  }

  items.forEach((item, index) => {
    if (!item.id) {
      testResults.failed.push(`Item ${index} ID is missing`);
    } else {
      testResults.passed.push(`Item ${index} ID is present`);
    }

    if (
      action_id !== "select" &&
      action_id !== "select_rental" &&
      action_id !== "select_preorder_bid" &&
      action_id !== "init" &&
      action_id !== "confirm" &&
      action_id !== "confirm_card_balance_faliure" &&
      action_id !== "confirm_card_balance_success"
    ) {
      if (!item.descriptor?.name) {
        testResults.failed.push(`Item ${index} descriptor name is missing`);
      } else {
        testResults.passed.push(`Item ${index} descriptor name is present`);
      }
    }

    // For TRV10, price.value is optional in select, init, and confirm actions
    if (
      action_id === "select" ||
      action_id === "init" ||
      action_id === "confirm" ||
      action_id !== "select_rental"
    ) {
      if (item.price?.value) {
        testResults.passed.push(`Item ${index} price value is present`);
      }
    } else {
      if (action_id !== "select_rental" && !item.price?.value) {
        testResults.failed.push(`Item ${index} price value is missing`);
      } else {
        testResults.passed.push(`Item ${index} price value is present`);
      }
    }
  });
}

function validateFulfillments(
  message: any,
  testResults: TestResult,
  action_id?: string
): void {
  const fulfillments =
    message?.catalog?.providers?.[0]?.fulfillments ||
    message?.order?.fulfillments;
  if (
    action_id !== "update_quote" &&
    (!fulfillments || !Array.isArray(fulfillments))
  ) {
    testResults.failed.push("Fulfillments array is missing or invalid");
    return;
  }

  fulfillments?.forEach((fulfillment: any, index: any) => {
    if (!fulfillment.id) {
      testResults.failed.push(`Fulfillment ${index} ID is missing`);
    } else {
      testResults.passed.push(`Fulfillment ${index} ID is present`);
    }

    if (!fulfillment.type) {
      testResults.failed.push(`Fulfillment ${index} type is missing`);
    } else {
      testResults.passed.push(`Fulfillment ${index} type is present`);
    }
  });
}

function validateFulfillmentsTRV10(
  message: any,
  testResults: TestResult,
  action_id?: string
): void {
  const fulfillments =
    message?.catalog?.providers?.[0]?.fulfillments ||
    message?.order?.fulfillments;
  if (
    action_id !== "update_quote" &&
    (!fulfillments || !Array.isArray(fulfillments))
  ) {
    testResults.failed.push("Fulfillments array is missing or invalid");
    return;
  }

  fulfillments?.forEach((fulfillment: any, index: any) => {
    if (!fulfillment.id) {
      testResults.failed.push(`Fulfillment ${index} ID is missing`);
    } else {
      testResults.passed.push(`Fulfillment ${index} ID is present`);
    }

    // For TRV10, fulfillment type is optional in select and init actions
    if (
      action_id === "select" ||
      action_id === "select_rental" ||
      action_id === "init" ||
      action_id === "update" ||
      action_id === "update_hard" ||
      action_id === "select_preorder_bid"
    ) {
      if (fulfillment.type) {
        testResults.passed.push(`Fulfillment ${index} type is present`);
      }
    } else {
      if (!fulfillment.type) {
        testResults.failed.push(`Fulfillment ${index} type is missing`);
      } else {
        testResults.passed.push(`Fulfillment ${index} type is present`);
      }
    }
  });
}

function validateFulfillmentsFIS12(
  message: any,
  testResults: TestResult,
  usecaseId?: string
): void {
  const fulfillments =
    message?.catalog?.providers?.[0]?.fulfillments ||
    message?.order?.fulfillments;
  if (!fulfillments || !Array.isArray(fulfillments)) {
    testResults.failed.push("Fulfillments array is missing or invalid");
    return;
  }

  fulfillments.forEach((fulfillment: any, index: number) => {
    // Validate type
    if (usecaseId !== "PERSONAL LOAN") {
    if (!fulfillment.type) {
      testResults.failed.push(`Fulfillment ${index} type is missing`);
    } else {
      testResults.passed.push(
        `Fulfillment ${index} has type: ${fulfillment.type}`
      );
    }}

    if (fulfillment.type !== "LOAN") {
    
    // Validate customer info
    if (!fulfillment.customer) {
      testResults.failed.push(`Fulfillment ${index} customer info is missing`);
    } else {
      const { person, contact } = fulfillment.customer;
      if (!person?.name)
        testResults.failed.push(
          `Fulfillment ${index} customer name is missing`
        );
      if (!contact?.phone && !contact?.email)
        testResults.failed.push(
          `Fulfillment ${index} customer contact is missing`
        );
    }

    // Validate state descriptor
    if (!fulfillment.state?.descriptor?.code) {
      testResults.failed.push(
        `Fulfillment ${index} state descriptor code is missing`
      );
    } else {
      testResults.passed.push(
        `Fulfillment ${index} state code: ${fulfillment.state.descriptor.code}`
      );
    }
  }
  });
}

function validatePaymentsFIS12(message: any, testResults: TestResult): void {
  const payments =
    message?.catalog?.providers?.[0]?.payments || message?.order?.payments;
  if (!payments || !Array.isArray(payments)) {
    testResults.failed.push("Payments array is missing or invalid");
    return;
  }

  payments.forEach((payment: any, index: number) => {
    // Validate basic payment info
    if (!payment.id) testResults.failed.push(`Payment ${index} id is missing`);
    if (!payment.type)
      testResults.failed.push(`Payment ${index} type is missing`);
    if (!payment.status)
      testResults.failed.push(`Payment ${index} status is missing`);

    testResults.passed.push(
      `Payment ${index} has id: ${payment.id}, type: ${payment.type}, status: ${payment.status}`
    );

    // Validate POST_FULFILLMENT payments
    if (payment.type === "POST_FULFILLMENT") {
      if (!payment.params?.amount || !payment.params?.currency) {
        testResults.failed.push(
          `Payment ${index} POST_FULFILLMENT params are invalid`
        );
      } else {
        testResults.passed.push(
          `Payment ${index} POST_FULFILLMENT amount: ${payment.params.amount} ${payment.params.currency}`
        );
      }

      if (!payment.time?.range?.start || !payment.time?.range?.end) {
        testResults.failed.push(
          `Payment ${index} POST_FULFILLMENT time range is invalid`
        );
      }
    }

    // Validate tags if present
    if (payment.tags && Array.isArray(payment.tags)) {
      payment.tags.forEach((tag: any, tIndex: number) => {
        if (!tag.descriptor?.code)
          testResults.failed.push(
            `Payment ${index} tag ${tIndex} code is missing`
          );
      });
    }
  });
}

function validateDocumentsFIS12(message: any, testResults: TestResult): void {
  const documents = message?.order?.documents;
  
  // Always add a message to indicate validation ran
  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    // Documents are optional in some flows, so log as info rather than fail
    testResults.passed.push("Documents validation: Documents array is optional (not present in order)");
    return;
  }
  
  // Documents are present - validate them
  testResults.passed.push(`Documents validation: Found ${documents.length} document(s) to validate`);

  // Expected document types for FIS12 Gold Loan
  const expectedDocumentTypes = [
    "LOAN_AGREEMENT",
    "LOAN_CANCELLATION",
  ];

  const foundDocumentTypes: string[] = [];

  documents.forEach((doc: any, index: number) => {
    // Validate required fields
    if (!doc.descriptor) {
      testResults.failed.push(`Document ${index}: descriptor is missing`);
      return;
    }

    const code = doc.descriptor.code;
    if (!code) {
      testResults.failed.push(`Document ${index}: descriptor.code is missing`);
      return;
    }

    foundDocumentTypes.push(code);

    // Validate mime_type
    if (!doc.mime_type) {
      testResults.failed.push(`Document ${index} (${code}): mime_type is missing`);
    } else {
      // Validate mime_type format (should be like "application/pdf", "text/html", etc.)
      const validMimeTypes = ["application/pdf", "text/html", "application/json"];
      if (!validMimeTypes.includes(doc.mime_type) && !doc.mime_type.includes("/")) {
        testResults.failed.push(
          `Document ${index} (${code}): Invalid mime_type format "${doc.mime_type}"`
        );
      } else {
        testResults.passed.push(
          `Document ${index} (${code}): Valid mime_type "${doc.mime_type}"`
        );
      }
    }

    // Validate URL
    if (!doc.url) {
      testResults.failed.push(`Document ${index} (${code}): url is missing`);
    } else {
      // Validate URL format (should be http/https)
      const urlPattern = /^https?:\/\/.+/i;
      if (!urlPattern.test(doc.url)) {
        testResults.failed.push(
          `Document ${index} (${code}): Invalid URL format "${doc.url}". Must be http:// or https://`
        );
      } else {
        testResults.passed.push(`Document ${index} (${code}): Valid URL "${doc.url}"`);
      }
    }

    // Validate descriptor fields
    if (!doc.descriptor.name) {
      testResults.failed.push(`Document ${index} (${code}): descriptor.name is missing`);
    } else {
      testResults.passed.push(
        `Document ${index} (${code}): descriptor.name is present: "${doc.descriptor.name}"`
      );
    }

    // Optional fields validation
    if (doc.descriptor.short_desc) {
      testResults.passed.push(
        `Document ${index} (${code}): descriptor.short_desc is present`
      );
    }
    if (doc.descriptor.long_desc) {
      testResults.passed.push(
        `Document ${index} (${code}): descriptor.long_desc is present`
      );
    }
  });

  // Check for expected document types (at least LOAN_AGREEMENT should be present)
  if (!foundDocumentTypes.includes("LOAN_AGREEMENT")) {
    testResults.failed.push(
      "Required document type 'LOAN_AGREEMENT' is missing"
    );
  } else {
    testResults.passed.push("Required document type 'LOAN_AGREEMENT' is present");
  }

  // Check for LOAN_CANCELLATION (optional but recommended)
  if (foundDocumentTypes.includes("LOAN_CANCELLATION")) {
    testResults.passed.push("Document type 'LOAN_CANCELLATION' is present");
  } else {
    testResults.passed.push(
      "Document type 'LOAN_CANCELLATION' is optional (not present)"
    );
  }

  // Summary
  testResults.passed.push(
    `Found ${documents.length} document(s) with types: ${foundDocumentTypes.join(", ")}`
  );
}

function validateFulfillmentStateOnUpdateFIS12(
  message: any,
  testResults: TestResult,
  action_id: string,
  flowId: string
): void {
  // Only validate for Gold Loan Foreclosure flow
  if (flowId !== "Gold_Loan_Foreclosure") {
    return;
  }

  const fulfillments = message?.order?.fulfillments;
  if (!fulfillments || !Array.isArray(fulfillments) || fulfillments.length === 0) {
    testResults.failed.push(
      "Fulfillments array is missing or empty in order for fulfillment state validation"
    );
    return;
  }

  // Expected state codes based on action_id
  let expectedState: string | null = null;
  if (action_id === "on_update") {
    expectedState = "DISBURSED";
  } else if (action_id === "on_update_unsolicited") {
    expectedState = "COMPLETE";
  }

  if (!expectedState) {
    testResults.passed.push(
      `Fulfillment state validation skipped (action_id: ${action_id}, only validates 'on_update' and 'on_update_unsolicited')`
    );
    return;
  }

  fulfillments.forEach((fulfillment: any, index: number) => {
    const stateCode = fulfillment?.state?.descriptor?.code;

    if (!stateCode) {
      testResults.failed.push(
        `Fulfillment ${index}: state.descriptor.code is missing (expected: ${expectedState} for action ${action_id})`
      );
      return;
    }

    if (stateCode !== expectedState) {
      testResults.failed.push(
        `Fulfillment ${index}: Invalid state code "${stateCode}". Expected "${expectedState}" for action "${action_id}" in Gold_Loan_Foreclosure flow`
      );
    } else {
      testResults.passed.push(
        `Fulfillment ${index}: Valid state code "${stateCode}" for action "${action_id}" in Gold_Loan_Foreclosure flow`
      );
    }
  });
}

function validateUpdatePaymentsFIS12(
  message: any,
  testResults: TestResult
): void {
  const { update_target: updateTarget, order } = message ?? {};

  // Only validate if update_target is "payments"
  if (updateTarget !== "payments") {
    testResults.passed.push(
      `Update target is "${updateTarget}", skipping payment-specific validation`
    );
    return;
  }

  if (!order) {
    testResults.failed.push("Order is missing in update request");
    return;
  }

  const payments = order.payments;
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    testResults.failed.push(
      "Payments array is missing or empty in update request"
    );
    return;
  }

  testResults.passed.push(
    `Found ${payments.length} payment(s) in update request`
  );

  payments.forEach((payment: any, index: number) => {
    // Validate time.label for foreclosure
    if (payment.time) {
      if (!payment.time.label) {
        testResults.failed.push(
          `Payment ${index}: time.label is missing`
        );
      } else {
        const validLabels = ["FORECLOSURE","MISSED_EMI_PAYMENT", "INSTALLMENT", "PRE_PART_PAYMENT"];
        if (!validLabels.includes(payment.time.label)) {
          testResults.failed.push(
            `Payment ${index}: Invalid time.label "${payment.time.label}". Expected one of: ${validLabels.join(", ")}`
          );
        } else {
          testResults.passed.push(
            `Payment ${index}: Valid time.label "${payment.time.label}"`
          );
        }

        // For FORECLOSURE, validate time.range if present
        if (payment.time.label === "FORECLOSURE") {
          if (payment.time.range) {
            if (!payment.time.range.start || !payment.time.range.end) {
              testResults.failed.push(
                `Payment ${index} (FORECLOSURE): time.range.start or time.range.end is missing`
              );
            } else {
              testResults.passed.push(
                `Payment ${index} (FORECLOSURE): time.range is valid`
              );
            }
          } else {
            testResults.passed.push(
              `Payment ${index} (FORECLOSURE): time.range is optional (not present)`
            );
          }
        }
      }
    } else {
      testResults.passed.push(
        `Payment ${index}: time field is optional (not present)`
      );
    }

    // Validate payment params if present (for foreclosure amount)
    if (payment.params) {
      if (payment.params.amount && payment.params.currency) {
        testResults.passed.push(
          `Payment ${index}: params.amount (${payment.params.amount}) and params.currency (${payment.params.currency}) are present`
        );
      } else {
        if (!payment.params.amount) {
          testResults.failed.push(
            `Payment ${index}: params.amount is missing when params is present`
          );
        }
        if (!payment.params.currency) {
          testResults.failed.push(
            `Payment ${index}: params.currency is missing when params is present`
          );
        }
      }
    }

    // Validate payment status if present
    if (payment.status) {
      const validStatuses = ["NOT-PAID", "PAID", "PENDING"];
      if (!validStatuses.includes(payment.status)) {
        testResults.failed.push(
          `Payment ${index}: Invalid status "${payment.status}". Expected one of: ${validStatuses.join(", ")}`
        );
      } else {
        testResults.passed.push(
          `Payment ${index}: Valid status "${payment.status}"`
        );
      }
    }

    // Validate payment type if present
    if (payment.type) {
      const validTypes = ["ON_ORDER", "POST_FULFILLMENT"];
      if (!validTypes.includes(payment.type)) {
        testResults.failed.push(
          `Payment ${index}: Invalid type "${payment.type}". Expected one of: ${validTypes.join(", ")}`
        );
      } else {
        testResults.passed.push(
          `Payment ${index}: Valid type "${payment.type}"`
        );
      }
    }
  });
}

function validateCategoriesFIS12(message: any, testResults: TestResult): void {
  const categories: any[] = message.catalog.providers[0].categories;
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    testResults.failed.push("Categories array is missing or empty");
    return;
  }

  const validCategoryMap: Record<string, string> = {
    GOLD_LOAN: "Gold Loan",
    BUREAU_LOAN: "Bureau Loan",
    AA_LOAN: "Account Aggregator Loan",
    PERSONAL_LOAN: "Personal Loan",
    AA_PERSONAL_LOAN: "Account Aggregator Personal Loan",
  };

  categories.forEach((cat) => {
    const code = cat?.descriptor?.code;
    const name = cat?.descriptor?.name;

    if (!code || !name) {
      testResults.failed.push("Category descriptor code or name is missing");
      return;
    }

    if (!validCategoryMap[code]) {
      testResults.failed.push(`Invalid category code: ${code}`);
      return;
    }

    if (validCategoryMap[code] !== name) {
      testResults.failed.push(
        `Category name mismatch for code ${code}. Expected ${validCategoryMap[code]} but found ${name}`
      );
      return;
    }

    testResults.passed.push(`Valid category: ${code} - ${name}`);
  });
}

/**
 * FIS12 Gold Loan - validate LOAN_INFO tags on on_init/on_status
 * Ensures mandatory loan info attributes are present and well-formed.
 */
function validateGoldLoanOnInitFIS12(
  message: any,
  testResults: TestResult
): void {
  const items = message?.order?.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("order.items array is missing or empty");
    return;
  }

  const requiredLoanInfoCodes = [
    "INTEREST_RATE",
    "TERM",
    "INTEREST_RATE_TYPE",
    "LTV_RATIO",
    "ANNUAL_PERCENTAGE_RATE",
    "REPAYMENT_FREQUENCY",
    "NUMBER_OF_INSTALLMENTS_OF_REPAYMENT",
    "INSTALLMENT_AMOUNT",
    "TNC_LINK",
    "COOL_OFF_PERIOD",
    "KFS_LINK",
  ];

  const optionalLoanInfoCodes = [
    "APPLICATION_FEE",
    "FORECLOSURE_FEE",
    "INTEREST_RATE_CONVERSION_CHARGE",
    "DELAY_PENALTY_FEE",
    "OTHER_PENALTY_FEE",
  ];

  items.forEach((item: any, index: number) => {
    // Only validate items that look like Gold Loan products
    const isGoldLoan =
      item?.descriptor?.code === "LOAN" &&
      typeof item?.descriptor?.name === "string" &&
      item.descriptor.name.toLowerCase().includes("gold loan");

    if (!isGoldLoan) {
      return;
    }

    const loanInfoTag = (item.tags || []).find(
      (t: any) => t?.descriptor?.code === "LOAN_INFO"
    );

    if (!loanInfoTag) {
      testResults.failed.push(
        `Item ${item.id || index}: LOAN_INFO tag is missing for Gold Loan item`
      );
      return;
    }

    const list = Array.isArray(loanInfoTag.list) ? loanInfoTag.list : [];
    const codeMap = new Map<string, any>();
    list.forEach((entry: any) => {
      const code = entry?.descriptor?.code;
      if (code) codeMap.set(code, entry);
    });

    // Check mandatory codes
    requiredLoanInfoCodes.forEach((code) => {
      if (!codeMap.has(code)) {
        testResults.failed.push(
          `Item ${item.id}: LOAN_INFO.${code} is missing (mandatory)`
        );
      } else {
        const value = codeMap.get(code)?.value;
        if (value === undefined || value === null || value === "") {
          testResults.failed.push(
            `Item ${item.id}: LOAN_INFO.${code} value is empty (mandatory)`
          );
        } else {
          testResults.passed.push(
            `Item ${item.id}: LOAN_INFO.${code} is present with value "${value}"`
          );
        }
      }
    });

    // Basic format checks for a few important fields
    const percentFields = ["INTEREST_RATE", "LTV_RATIO", "ANNUAL_PERCENTAGE_RATE"];
    percentFields.forEach((code) => {
      const entry = codeMap.get(code);
      if (entry?.value && typeof entry.value === "string") {
        if (!entry.value.trim().endsWith("%")) {
          testResults.failed.push(
            `Item ${item.id}: LOAN_INFO.${code} should be a percentage string (e.g. "12%"), found "${entry.value}"`
          );
        }
      }
    });

    const coolOff = codeMap.get("COOL_OFF_PERIOD")?.value;
    if (coolOff && typeof coolOff === "string") {
      if (!coolOff.startsWith("P")) {
        testResults.failed.push(
          `Item ${item.id}: LOAN_INFO.COOL_OFF_PERIOD should be ISO 8601 duration (e.g. "PT30D"), found "${coolOff}"`
        );
      } else {
        testResults.passed.push(
          `Item ${item.id}: LOAN_INFO.COOL_OFF_PERIOD is present with value "${coolOff}"`
        );
      }
    }

    const urlFields = ["TNC_LINK", "KFS_LINK"];
    urlFields.forEach((code) => {
      const entry = codeMap.get(code);
      if (entry?.value && typeof entry.value === "string") {
        if (!/^https?:\/\//i.test(entry.value.trim())) {
          testResults.failed.push(
            `Item ${item.id}: LOAN_INFO.${code} should be a valid URL, found "${entry.value}"`
          );
        } else {
          testResults.passed.push(
            `Item ${item.id}: LOAN_INFO.${code} URL looks valid`
          );
        }
      }
    });

    // Optional codes: just acknowledge if present
    optionalLoanInfoCodes.forEach((code) => {
      if (codeMap.has(code)) {
        const value = codeMap.get(code)?.value;
        testResults.passed.push(
          `Item ${item.id}: LOAN_INFO.${code} is present with value "${value}"`
        );
      }
    });
  });
}

function validateOnSearchItemsFIS12(
  message: any,
  testResults: TestResult
): void {
  const items = message.catalog.providers[0].items;
  const categories = message.catalog.providers[0].categories;

  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("Items array is missing or empty");
    return;
  }

  const validCategoryIds = new Set(categories.map((c: any) => c.id));
  
  // Create a map of category codes by category id
  const categoryCodeMap = new Map<string, string>();
  categories.forEach((cat: any) => {
    if (cat?.id && cat?.descriptor?.code) {
      categoryCodeMap.set(cat.id, cat.descriptor.code);
    }
  });

  items.forEach((item) => {
    if (!item.id) {
      testResults.failed.push("Item id is missing");
      return;
    }

    if (!item.descriptor?.code || !item.descriptor?.name) {
      testResults.failed.push(`Item descriptor missing in item: ${item.id}`);
      return;
    }

    // Validate descriptor code - accept both "LOAN" and "PERSONAL_LOAN" or "GOLD_LOAN"
    const validDescriptorCodes = ["LOAN", "PERSONAL_LOAN", "GOLD_LOAN"];
    if (!validDescriptorCodes.includes(item.descriptor.code)) {
      testResults.failed.push(
        `Item ${item.id}: descriptor.code should be one of ["LOAN", "PERSONAL_LOAN", "GOLD_LOAN"], but found "${item.descriptor.code}"`
      );
    } else {
      testResults.passed.push(`Item ${item.id}: Valid descriptor.code "${item.descriptor.code}"`);
    }

    // Validate category_ids array
    if (!item.category_ids || item.category_ids.length === 0) {
      testResults.failed.push(`Item ${item.id} has no category_ids`);
      return;
    }

    // Check if item has GOLD_LOAN or PERSONAL_LOAN category
    let hasGoldLoanCategory = false;
    let hasPersonalLoanCategory = false;
    let hasBureauLoanCategory = false;
    let hasAALoanCategory = false;
    let hasAAPersonalLoanCategory = false;

    item.category_ids.forEach((catId: string) => {
      if (!validCategoryIds.has(catId)) {
        testResults.failed.push(
          `Item ${item.id} refers to invalid category id: ${catId}`
        );
      } else {
        const categoryCode = categoryCodeMap.get(catId);
        if (categoryCode === "GOLD_LOAN") {
          hasGoldLoanCategory = true;
        } else if (categoryCode === "PERSONAL_LOAN") {
          hasPersonalLoanCategory = true;
        } else if (categoryCode === "BUREAU_LOAN") {
          hasBureauLoanCategory = true;
        } else if (categoryCode === "AA_LOAN") {
          hasAALoanCategory = true;
        } else if (categoryCode === "AA_PERSONAL_LOAN") {
          hasAAPersonalLoanCategory = true;
        }
      }
    });

    // Validate item name matches category type
    const itemName = item.descriptor?.name?.toLowerCase() || "";
    if (hasGoldLoanCategory) {
      if (!itemName.includes("gold loan") && !itemName.includes("gold")) {
        testResults.failed.push(
          `Item ${item.id}: Has GOLD_LOAN category but descriptor.name "${item.descriptor.name}" doesn't match Gold Loan pattern`
        );
      } else {
        testResults.passed.push(
          `Item ${item.id}: Valid Gold Loan item with matching descriptor.name`
        );
      }
    } else if (hasPersonalLoanCategory) {
      if (!itemName.includes("personal loan") && !itemName.includes("personal")) {
        testResults.failed.push(
          `Item ${item.id}: Has PERSONAL_LOAN category but descriptor.name "${item.descriptor.name}" doesn't match Personal Loan pattern`
        );
      } else {
        testResults.passed.push(
          `Item ${item.id}: Valid Personal Loan item with matching descriptor.name`
        );
      }
      
      // Validate AA_PERSONAL_LOAN items
      if (hasAAPersonalLoanCategory) {
        // Items with AA_PERSONAL_LOAN must also have PERSONAL_LOAN category (already validated above)
        testResults.passed.push(
          `Item ${item.id}: Valid AA Personal Loan item with both PERSONAL_LOAN and AA_PERSONAL_LOAN categories`
        );
        
        // Items with AA_PERSONAL_LOAN should indicate "with AA" in the name
        if (!itemName.includes("with aa") && !itemName.includes("with account aggregator")) {
          testResults.failed.push(
            `Item ${item.id}: Has AA_PERSONAL_LOAN category but descriptor.name "${item.descriptor.name}" should indicate "with AA" or "with Account Aggregator"`
          );
        } else {
          testResults.passed.push(
            `Item ${item.id}: Valid AA Personal Loan item with appropriate name indicating AA`
          );
        }
      }
    }

    // Validate category combinations
    if (hasGoldLoanCategory && hasPersonalLoanCategory) {
      testResults.failed.push(
        `Item ${item.id}: Cannot have both GOLD_LOAN and PERSONAL_LOAN categories`
      );
    }

    if (hasGoldLoanCategory && hasAAPersonalLoanCategory) {
      testResults.failed.push(
        `Item ${item.id}: Cannot have both GOLD_LOAN and AA_PERSONAL_LOAN categories`
      );
    }

    if (hasPersonalLoanCategory && hasAALoanCategory) {
      testResults.failed.push(
        `Item ${item.id}: PERSONAL_LOAN should use AA_PERSONAL_LOAN, not AA_LOAN`
      );
    }

    if (hasGoldLoanCategory && hasAAPersonalLoanCategory) {
      testResults.failed.push(
        `Item ${item.id}: GOLD_LOAN should use AA_LOAN, not AA_PERSONAL_LOAN`
      );
    }

    // Validate AA_PERSONAL_LOAN requires PERSONAL_LOAN category
    if (hasAAPersonalLoanCategory && !hasPersonalLoanCategory) {
      testResults.failed.push(
        `Item ${item.id}: Has AA_PERSONAL_LOAN category but missing PERSONAL_LOAN category. AA_PERSONAL_LOAN items must also have PERSONAL_LOAN category.`
      );
    }

    testResults.passed.push(`Valid item structure: ${item.id}`);
  });
}

async function validateXinputFIS12(
  message: any,
  testResults: TestResult,
  sessionID?: string,
  transactionId?: string,
  flowId?:string,
  action_id?:string
): Promise<void> {
  const items = message?.catalog?.providers?.[0]?.items?.length
    ? message.catalog.providers[0].items
    : message?.order?.items || [];

  const categories = message?.catalog?.providers?.[0]?.categories || [];
  
  // Create a map of category codes by category id
  const categoryCodeMap = new Map<string, string>();
  categories.forEach((cat: any) => {
    if (cat?.id && cat?.descriptor?.code) {
      categoryCodeMap.set(cat.id, cat.descriptor.code);
    }
  });

  const allowedHeadings = [
    "KYC",
    "KYC_OFFLINE",
    "JOURNEY_OFFLINE",
    "SET_LOAN_AMOUNT",
    "PERSONAL_INFORMATION",
    "Personal Information",
    "Set Loan Amount",
    "Know your Customer",
    "Account Information",
    "Emandate",
    "Loan Agreement"
  ];

  const formUrls: string[] = [];

  items.forEach((item: any) => {
    // Check if item is GOLD_LOAN or PERSONAL_LOAN
    let isGoldLoan = false;
    let isPersonalLoan = false;
    
    if (item.category_ids && Array.isArray(item.category_ids)) {
      item.category_ids.forEach((catId: string) => {
        const categoryCode = categoryCodeMap.get(catId);
        if (categoryCode === "GOLD_LOAN") {
          isGoldLoan = true;
        } else if (categoryCode === "PERSONAL_LOAN") {
          isPersonalLoan = true;
        }
      });
    }

    if (!item.xinput) {
      testResults.failed.push(`Item ${item.id}: xinput is missing`);
      return;
    }

    const head = item.xinput.head;
    if (!head && flowId !== "Personal_Loan_With_AA_And_Monitoring_Consent" && action_id !== "on_select_1_personal_loan") {
      testResults.failed.push(`Item ${item.id}: xinput.head is missing`);
      return;
    }

    if (
      !head.headings ||
      !Array.isArray(head.headings) ||
      head.headings.length === 0
    ) {
      testResults.failed.push(
        `Item ${item.id}: xinput.head.headings is missing or empty`
      );
      return;
    }

    head.headings.forEach((h: string) => {
      if (!allowedHeadings.includes(h)) {
        testResults.failed.push(
          `Item ${
            item.id
          }: Invalid xinput heading "${h}". Allowed: ${allowedHeadings.join(
            ", "
          )}`
        );
      } else {
        testResults.passed.push(`Item ${item.id}: Valid xinput heading "${h}"`);
      }
    });

    // Optional extra xinput validations
    if (!item.xinput.form) {
      testResults.failed.push(`Item ${item.id}: xinput.form is missing`);
    } else if (
      !item.xinput.form.id ||
      !item.xinput.form.mime_type ||
      !item.xinput.form.url
    ) {
      testResults.failed.push(
        `Item ${item.id}: xinput.form fields are incomplete`
      );
    } else {
      // For GOLD_LOAN and PERSONAL_LOAN items, validate required and mime_type
      if (isGoldLoan || isPersonalLoan) {
        if (item.xinput.required !== true) {
          testResults.failed.push(
            `Item ${item.id}: xinput.required must be true for ${isGoldLoan ? "GOLD_LOAN" : "PERSONAL_LOAN"} items`
          );
        } else {
          testResults.passed.push(
            `Item ${item.id}: xinput.required is true for ${isGoldLoan ? "GOLD_LOAN" : "PERSONAL_LOAN"} item`
          );
        }

        if (item.xinput.form.mime_type !== "text/html") {
          testResults.failed.push(
            `Item ${item.id}: xinput.form.mime_type must be "text/html" for ${isGoldLoan ? "GOLD_LOAN" : "PERSONAL_LOAN"} items, but found "${item.xinput.form.mime_type}"`
          );
        } else {
          testResults.passed.push(
            `Item ${item.id}: xinput.form.mime_type is "text/html" for ${isGoldLoan ? "GOLD_LOAN" : "PERSONAL_LOAN"} item`
          );
        }
      }

      // Save form URL to Redis for HTML_FORM validation
      if (item.xinput.form.url && sessionID && transactionId) {
        formUrls.push(item.xinput.form.url);
        testResults.passed.push(
          `Item ${item.id}: Form URL found and will be saved for HTML_FORM validation`
        );
      }
    }

    if (typeof item.xinput.required !== "boolean") {
      testResults.failed.push(
        `Item ${item.id}: xinput.required must be boolean`
      );
    }
  });

  // Save form URLs to Redis if we have session and transaction info
  if (formUrls.length > 0 && sessionID && transactionId) {
    try {
      const { saveData } = await import("../../utils/redisUtils");
      await saveData(sessionID, transactionId, "formUrls", { urls: formUrls });
      logger.info(`Saved ${formUrls.length} form URL(s) to Redis for HTML_FORM validation`);
    } catch (error: any) {
      logger.error("Error saving form URLs to Redis", error);
    }
  }
}

function validateXInputStatusFIS12(
  message: any,
  testResults: TestResult,
  usecaseId?: string
): void {
  const items: any = message.order.items;
  const allowedStatuses = [
    "PENDING",
    "APPROVED",
    "REJECTED",
    "EXPIRED",
    "SUCCESS",
  ];

  items.forEach((item: any) => {
    if (!item.xinput) {
      testResults.failed.push(`Item ${item.id}: xinput is missing`);
      return;
    }

    // Validate xinput.form exists and has required fields
    if (!item.xinput.form) {
      testResults.failed.push(`Item ${item.id}: xinput.form is missing`);
    } else {
      if (!item.xinput.form.id) {
        testResults.failed.push(`Item ${item.id}: xinput.form.id is missing`);
      } else {
        testResults.passed.push(
          `Item ${item.id}: xinput.form.id is present: "${item.xinput.form.id}"`
        );
      }
    }

    const formResponse = item.xinput.form_response;
    if (!formResponse) {
      testResults.failed.push(
        `Item ${item.id}: xinput.form_response is missing`
      );
      return;
    }

    const { status, submission_id } = formResponse;

    // Validate status
    if (!status) {
      testResults.failed.push(
        `Item ${item.id}: xinput.form_response.status is missing`
      );
    } else if (!allowedStatuses.includes(status)) {
      testResults.failed.push(
        `Item ${
          item.id
        }: Invalid xinput.form_response.status "${status}". Allowed: ${allowedStatuses.join(
          ", "
        )}`
      );
    } else {
      testResults.passed.push(
        `Item ${item.id}: Valid xinput.form_response.status "${status}"`
      );
    }

    // Validate submission_id
    if (!submission_id) {
      testResults.failed.push(
        `Item ${item.id}: xinput.form_response.submission_id is missing`
      );
    } else {
      testResults.passed.push(
        `Item ${item.id}: xinput.form_response.submission_id is present: "${submission_id}"`
      );
    }

    // Validate form.id matches form_response (if both exist)
    if (item.xinput.form?.id && formResponse.submission_id) {
      // Check if submission_id starts with form.id (common pattern: F01_SUBMISSION_ID)
      const formId = item.xinput.form.id;
      if (submission_id.startsWith(formId)) {
        testResults.passed.push(
          `Item ${item.id}: form_response.submission_id "${submission_id}" matches form.id "${formId}" pattern`
        );
      } else {
        // This is a warning, not an error, as the pattern may vary
        testResults.passed.push(
          `Item ${item.id}: form_response.submission_id "${submission_id}" (form.id: "${formId}")`
        );
      }
    }

    // Usecase-specific validations
    if (usecaseId) {
      const normalizedUsecaseId = usecaseId.toUpperCase().trim();
      
      // PERSONAL LOAN specific validations
      if (normalizedUsecaseId === "PERSONAL LOAN" || normalizedUsecaseId === "PERSONAL_LOAN") {
        // Validate form.id for Personal Loan flows
        if (item.xinput.form?.id) {
          const formId = item.xinput.form.id;
          // Personal Loan Information Form should have form.id "F01"
          // if (formId === "F01") {
          //   testResults.passed.push(
          //     `Item ${item.id}: Valid form.id "F01" for Personal Loan Information Form`
          //   );
          // } else {
          //   testResults.failed.push(
          //     `Item ${item.id}: Expected form.id "F01" for Personal Loan, but found "${formId}"`
          //   );
          // }
        }

        // Validate form_response status for Personal Loan select actions
        if (formResponse.status) {
          // For select actions after form submission, status should be "SUCCESS"
          if (formResponse.status === "SUCCESS") {
            testResults.passed.push(
              `Item ${item.id}: Valid form_response.status "SUCCESS" for Personal Loan select action`
            );
          } else {
            testResults.failed.push(
              `Item ${item.id}: Expected form_response.status "SUCCESS" for Personal Loan select action, but found "${formResponse.status}"`
            );
          }
        }

        // Validate submission_id format for Personal Loan
        if (!formResponse.submission_id) {
          testResults.failed.push(
            `Item ${item.id}: submission_id is missing`
          );
        } else {
          testResults.passed.push(
            `Item ${item.id}: submission_id is present: "${formResponse.submission_id}"`
          );
        }
      }
      
      // GOLD LOAN specific validations
      else if (normalizedUsecaseId === "GOLD LOAN" || normalizedUsecaseId === "GOLD_LOAN") {
        // Validate form.id for Gold Loan flows
        if (item.xinput.form?.id) {
          const formId = item.xinput.form.id;
          // Gold Loan forms may have different form IDs (e.g., "F01", "F02", etc.)
          if (formId && formId.startsWith("F")) {
            testResults.passed.push(
              `Item ${item.id}: Valid form.id "${formId}" for Gold Loan`
            );
          } else {
            testResults.failed.push(
              `Item ${item.id}: Invalid form.id "${formId}" for Gold Loan. Expected format starting with "F"`
            );
          }
        }

        // Validate form_response status for Gold Loan select actions
        if (formResponse.status) {
          if (formResponse.status === "SUCCESS") {
            testResults.passed.push(
              `Item ${item.id}: Valid form_response.status "SUCCESS" for Gold Loan select action`
            );
          } else {
            testResults.failed.push(
              `Item ${item.id}: Expected form_response.status "SUCCESS" for Gold Loan select action, but found "${formResponse.status}"`
            );
          }
        }
      }
      
      // Log usecase validation
      testResults.passed.push(
        `Item ${item.id}: Validated with usecaseId "${usecaseId}"`
      );
    }
  });
}

function validatePayments(message: any, testResults: TestResult): void {
  const payments =
    message?.catalog?.providers?.[0]?.payments || message?.order?.payments;
  if (!payments || !Array.isArray(payments)) {
    testResults.failed.push("Payments array is missing or invalid");
    return;
  }

  payments.forEach((payment, index) => {
    if (!payment.collected_by) {
      testResults.failed.push(`Payment ${index} collected_by is missing`);
    } else if (
      payment?.collected_by &&
      ["BAP", "BPP"].includes(payment.collected_by)
    ) {
      testResults.passed.push(
        `Payment collected_by has valid value ${payment.collected_by}`
      );
    } else {
      testResults.passed.push(
        `Payment ${index} collected_by should be one of BAP or BPP`
      );
    }

    if (
      payment.type &&
      !["PRE_ORDER", "ON_ORDER", "POST_FULFILLMENT"].includes(payment.type)
    ) {
      testResults.failed.push(`Payment ${index} type has invalid value`);
    } else if (payment.type) {
      testResults.passed.push(`Payment ${index} type has valid value`);
    }
  });
}

function validatePaymentsTRV10(message: any, testResults: TestResult): void {
  const payments =
    message?.catalog?.providers?.[0]?.payments || message?.order?.payments;
  if (!payments || !Array.isArray(payments)) {
    testResults.failed.push("Payments array is missing or invalid");
    return;
  }

  payments.forEach((payment, index) => {
    if (!payment.collected_by) {
      testResults.failed.push(`Payment ${index} collected_by is missing`);
    } else {
      testResults.passed.push(`Payment ${index} collected_by is present`);
    }

    // For TRV10, payment type can be PRE_ORDER, ON_ORDER, POST_FULFILLMENT, or ON-FULFILLMENT
    if (payment.type) {
      const validTypes = [
        "PRE_ORDER",
        "ON_ORDER",
        "POST_FULFILLMENT",
        "ON-FULFILLMENT",
      ];
      if (validTypes.includes(payment.type)) {
        testResults.passed.push(`Payment ${index} type has valid value`);
      } else {
        testResults.failed.push(`Payment ${index} type has invalid value`);
      }
    }
  });
}

function validateOrder(message: any, testResults: TestResult): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing");
    return;
  }

  if (!order.provider?.id) {
    testResults.failed.push("Order provider ID is missing");
  } else {
    testResults.passed.push("Order provider ID is present");
  }
}

function validateQuote(message: any, testResults: TestResult,action_id: string,flowId: string): void {
  const quote = message?.order?.quote;
  if (flowId !== "Personal_Loan_Without_AA_And_Monitoring_Consent" && action_id === "on_select_1_personal_loan") {
    return;
  }
  else if (!quote) {
    testResults.failed.push("Quote is missing in order");
    return;
  }
  else{
    testResults.passed.push("Quote is present in order");
  }
  if (!quote.id) {
    testResults.failed.push("Quote ID is missing");
  } else {
    testResults.passed.push("Quote ID is present");
  }

  if (!quote.price?.value) {
    testResults.failed.push("Quote price value is missing");
  } else {
    testResults.passed.push("Quote price value is present");
  }
}

function validateQuoteTRV10(message: any, testResults: TestResult,action_id?: string,flowId?: string): void {
  const quote = message?.order?.quote;
  if (!quote && flowId !== "Personal_Loan_With_AA_And_Monitoring_Consent" && action_id !== "on_select_1_personal_loan") {
    testResults.failed.push("Quote is missing in order");
    return;
  }
  else{
    testResults.passed.push("Quote is present in order");
  }
  // For TRV10, quote.id is optional
  if (quote.id) {
    testResults.passed.push("Quote ID is present");
  }

  if (!quote.price?.value) {
    testResults.failed.push("Quote price value is missing");
  } else {
    testResults.passed.push("Quote price value is present");
  }
}

function validateBilling(message: any, testResults: TestResult): void {
  const billing = message?.order?.billing;
  if (!billing) {
    testResults.failed.push("Billing information is missing");
    return;
  }

  if (!billing.name) {
    testResults.failed.push("Billing name is missing");
  } else {
    testResults.passed.push("Billing name is present");
  }
}

function validateBillingTRV10(message: any, testResults: TestResult): void {
  const billing = message?.order?.billing;
  // For TRV10, billing is optional
  if (billing) {
    if (billing.name) {
      testResults.passed.push("Billing name is present");
    }
  }
}

function validateOrderStatus(
  message: any,
  testResults: TestResult,
  action_id: string
): void {
  const order = message?.order;
  if (order?.status) {
    const validStatuses = [
      "ACTIVE",
      "COMPLETE",
      "CANCELLED",
      "INACTIVE",
      "SOFT_CANCEL",
      "CONFIRM_CANCEL",
      "SOFT_UPDATE",
      "UPDATED",
    ];
    if (validStatuses.includes(order.status)) {
      if (action_id === "on_status_solicited") {
        if (order.status !== "COMPLETE") {
          testResults.failed.push(
            "Order status should be COMPLETE for on_status_solicited"
          );
        } else {
          testResults.passed.push(
            "Order status is COMPLETE for on_status_solicited"
          );
        }
      }
      testResults.passed.push("Order status has valid value");
    } else {
      testResults.failed.push("Order status has invalid value");
    }
  }
}

export function validateCancel(
  message: any,
  testResults: TestResult,
  action_id: string
): void {
  // Validate order_id
  if (!message?.order_id) {
    testResults.failed.push("Order ID is missing in cancel message");
  } else {
    testResults.passed.push("Order ID is present in cancel message");
  }

  // Validate cancellation_reason_id
  if (!message?.cancellation_reason_id) {
    testResults.failed.push("Cancellation reason ID is missing");
  } else {
    const validReasonCodes = [
      "000",
      "001",
      "002",
      "003",
      "004",
      "005",
      "011",
      "012",
      "013",
      "014",
    ];
    if (validReasonCodes.includes(message.cancellation_reason_id)) {
      testResults.passed.push("Cancellation reason ID has valid value");
    } else {
      testResults.failed.push("Cancellation reason ID has invalid value");
    }
  }

  // Validate descriptor
  const descriptor = message?.descriptor;
  if (!descriptor) {
    testResults.failed.push("Cancellation descriptor is missing");
  } else {
    if (!descriptor.code) {
      testResults.failed.push("Cancellation descriptor code is missing");
    } else {
      // For cancel action, code should be SOFT_CANCEL
      // For cancel_hard action, code should be CONFIRM_CANCEL
      if (action_id === "cancel") {
        if (descriptor.code === "SOFT_CANCEL") {
          testResults.passed.push(
            "Cancellation descriptor code is SOFT_CANCEL for cancel action"
          );
        } else {
          testResults.failed.push(
            `Cancellation descriptor code should be SOFT_CANCEL for cancel action, got ${descriptor.code}`
          );
        }
      } else if (action_id === "cancel_hard") {
        if (descriptor.code === "CONFIRM_CANCEL") {
          testResults.passed.push(
            "Cancellation descriptor code is CONFIRM_CANCEL for cancel_hard action"
          );
        } else {
          testResults.failed.push(
            `Cancellation descriptor code should be CONFIRM_CANCEL for cancel_hard action, got ${descriptor.code}`
          );
        }
      } else {
        // For other action_ids, just validate it's one of the valid codes
        const validCodes = ["SOFT_CANCEL", "CONFIRM_CANCEL"];
        if (validCodes.includes(descriptor.code)) {
          testResults.passed.push(
            "Cancellation descriptor code has valid value"
          );
        } else {
          testResults.failed.push(
            "Cancellation descriptor code has invalid value"
          );
        }
      }
    }

    if (descriptor.name) {
      testResults.passed.push("Cancellation descriptor name is present");
    }
  }
}

function validateCancellation(
  message: any,
  testResults: TestResult,
  action_id?: string
): void {
  const order = message?.order;
  if (!order) {
    return;
  }

  // Validate order status based on action_id
  if (action_id === "on_cancel_ride_cancel") {
    // For on_cancel_ride_cancel, status should be SOFT_CANCEL
    if (order.status !== "SOFT_CANCEL") {
      testResults.failed.push(
        "Order status should be SOFT_CANCEL in on_cancel_ride_cancel"
      );
    } else {
      testResults.passed.push(
        "Order status is SOFT_CANCEL in on_cancel_ride_cancel"
      );
    }
  } else if (action_id === "on_cancel_hard") {
    // For on_cancel_hard, status should be CANCELLED
    if (order.status !== "CANCELLED") {
      testResults.failed.push(
        "Order status should be CANCELLED in on_cancel_hard"
      );
    } else {
      testResults.passed.push("Order status is CANCELLED in on_cancel_hard");
    }
  } else if (action_id === "on_cancel") {
    if (order.status !== "SOFT_CANCEL") {
      testResults.failed.push(
        "Order status should be SOFT_CANCEL in on_cancel"
      );
    } else {
      testResults.passed.push("Order status is SOFT_CANCEL in on_cancel");
    }
  } else {
    // For default on_cancel, status should be CANCELLED
    if (order.status !== "CANCELLED") {
      testResults.failed.push("Order status should be CANCELLED in on_cancel");
    } else {
      testResults.passed.push("Order status is CANCELLED in on_cancel");
    }
  }

  // Validate cancellation object
  const cancellation = order.cancellation;
  if (!cancellation) {
    testResults.failed.push("Cancellation information is missing in order");
    return;
  }

  // Validate cancelled_by
  if (!cancellation.cancelled_by) {
    testResults.failed.push("Cancellation cancelled_by is missing");
  } else {
    const validCancelledBy = ["CONSUMER", "PROVIDER"];
    if (validCancelledBy.includes(cancellation.cancelled_by)) {
      testResults.passed.push("Cancellation cancelled_by has valid value");
    } else {
      testResults.failed.push("Cancellation cancelled_by has invalid value");
    }
  }

  // Validate cancellation reason
  const reason = cancellation.reason;
  if (!reason) {
    testResults.failed.push("Cancellation reason is missing");
  } else {
    if (!reason.descriptor?.code) {
      testResults.failed.push("Cancellation reason descriptor code is missing");
    } else {
      const validReasonCodes = [
        "000",
        "001",
        "002",
        "003",
        "004",
        "005",
        "011",
        "012",
        "013",
        "014",
      ];
      if (validReasonCodes.includes(reason.descriptor.code)) {
        testResults.passed.push("Cancellation reason code has valid value");
      } else {
        testResults.failed.push("Cancellation reason code has invalid value");
      }
    }
  }
}

export function validateTrackOrderId(
  message: any,
  testResults: TestResult
): void {
  const orderId = message?.order_id;
  if (!orderId) {
    testResults.failed.push("Order ID is missing in track message");
  } else {
    testResults.passed.push("Order ID is present in track message");
  }
}

export function validateStatusOrderId(
  message: any,
  testResults: TestResult
): void {
  const orderId = message?.order_id;
  if (!orderId) {
    testResults.failed.push("Order ID is missing in status message");
  } else {
    testResults.passed.push("Order/Ref ID is present in status message");
  }
}

export function validateStatusRefId(
  message: any,
  testResults: TestResult
): void {
  const refId = message?.ref_id;
  if (!refId) {
    testResults.failed.push("Ref ID is missing in status message");
  } else {
    testResults.passed.push("Ref ID is present in status message");
  }
}

export function validateErrorResponse(
  jsonRequest: any,
  testResults: TestResult,
  action_id: string
): void {
  const error = jsonRequest?.error;
  const message = jsonRequest?.message;

  // For error response scenarios, validate error object
  if (action_id === "on_confirm_driver_not_found") {
    if (!error) {
      testResults.failed.push(
        "Error object is missing in on_confirm_driver_not_found response"
      );
      return;
    }

    // Validate error code
    if (!error.code) {
      testResults.failed.push("Error code is missing");
    } else {
      // For driver not found, expected error code is 90203
      if (error.code === "90203") {
        testResults.passed.push(
          "Error code is correct for driver not found scenario"
        );
      } else {
        testResults.passed.push(`Error code is present: ${error.code}`);
      }
    }

    // Validate error message
    if (!error.message) {
      testResults.failed.push("Error message is missing");
    } else {
      testResults.passed.push(`Error message is present: ${error.message}`);
    }

    // Validate that message field should not be present in error response
    if (message) {
      testResults.failed.push(
        "Message field should not be present in error response"
      );
    } else {
      testResults.passed.push(
        "Message field is correctly absent in error response"
      );
    }
  }
}

export function validateTracking(
  message: any,
  context: any,
  testResults: TestResult
): void {
  const tracking = message?.tracking;
  if (!tracking) {
    testResults.failed.push("Tracking information is missing");
    return;
  }

  // Validate tracking status
  if (tracking.status) {
    const validStatuses = ["active", "inactive"];
    if (validStatuses.includes(tracking.status.toLowerCase())) {
      testResults.passed.push("Tracking status has valid value");
    } else {
      testResults.failed.push("Tracking status has invalid value");
    }
  }

  // Validate tracking location
  const location = tracking.location;
  if (location) {
    if (!location.gps) {
      testResults.failed.push("Tracking location GPS is missing");
    } else {
      // Validate GPS format (latitude, longitude)
      const gpsPattern = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/;
      if (gpsPattern.test(location.gps)) {
        testResults.passed.push("Tracking location GPS has valid format");
      } else {
        testResults.failed.push("Tracking location GPS has invalid format");
      }
    }

    // Validate timestamps
    const contextTimestamp = context?.timestamp
      ? new Date(context.timestamp)
      : null;
    const updatedAt = location.updated_at
      ? new Date(location.updated_at)
      : null;
    const locationTimestamp = location.time?.timestamp
      ? new Date(location.time.timestamp)
      : null;

    if (updatedAt && contextTimestamp) {
      if (updatedAt <= contextTimestamp) {
        testResults.passed.push(
          "Tracking location updated_at is not future dated w.r.t context timestamp"
        );
      } else {
        testResults.failed.push(
          "Tracking location updated_at is future dated w.r.t context timestamp"
        );
      }
    }

    // Validate location.time.timestamp if present
    if (locationTimestamp && contextTimestamp) {
      if (locationTimestamp <= contextTimestamp) {
        testResults.passed.push(
          "Tracking location timestamp is not future dated w.r.t context timestamp"
        );
      } else {
        testResults.failed.push(
          "Tracking location timestamp is future dated w.r.t context timestamp"
        );
      }
    }

    // Validate relationship between location timestamp and updated_at if both are present
    if (locationTimestamp && updatedAt) {
      if (locationTimestamp <= updatedAt) {
        testResults.passed.push(
          "Tracking location timestamp is not future dated w.r.t updated_at"
        );
      } else {
        testResults.failed.push(
          "Tracking location timestamp is future dated w.r.t updated_at"
        );
      }
    }
  } else {
    testResults.failed.push("Tracking location is missing");
  }
}

export function getFileName(action: string): string {
  if (action.includes("_")) {
    // Example: ON_SEARCH → OnSearch.ts
    return action
      .split("_") // ["ON", "SEARCH"]
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("");
  } else {
    // Example: SEARCH → search.ts
    return action.toLowerCase();
  }
}

/**
 * Creates a search validation function with configurable validations
 */
export function createSearchValidator(...config: string[]) {
  return async function checkSearch(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    // Store transaction ID (only in search action - first action in flow)
    const transactionId = context?.transaction_id;
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
        await addTransactionId(sessionID, flowId, transactionId);
      } catch (error: any) {
        testResults.failed.push(
          `Transaction ID storage failed: ${error.message}`
        );
      }
    } else {
      testResults.failed.push("Transaction ID is missing in context");
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.holidays.validate_holidays:
            validateHolidays(message, context, action, testResults);
            break;
          case log11Validators.lbnp.validate_lbnp:
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case log11Validators.prepaid_payment.validate_prepaid_payment:
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case log11Validators.cod.validate_cod:
            validateCODFlow(flowId, message, testResults);
            break;
          case log11Validators.sla_metrics.validate_sla_metrics:
            validateSlaMetricsSearch(
              sessionID,
              transactionId,
              flowId,
              message,
              testResults,
              action
            );
            break;

          // Financial services validations
          case fis11Validators.intent.validate_intent:
            validateIntent(message, testResults, action_id, flowId);
            break;
          case fis11Validators.payment.validate_payment_collected_by:
            validatePaymentCollectedBy(message, testResults);
            break;
          case fis11Validators.tags.validate_tags:
            validateTags(message, testResults);
            break;

          // TRV10 validations
          case trv10Validators.fulfillment_stops.validate_fulfillment_stops:
            validateFulfillmentStops(message, testResults, action_id, flowId);
            break;
          default:
            break;
        }
      }
    }
    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * TRV10-specific: validate update request envelope
 */
export function validateUpdateRequestTRV10(
  message: any,
  testResults: TestResult,
  action_id: string
): void {
  const { update_target: updateTarget, order } = message ?? {};

  // Validation rules for update_target based on action_id
  const validUpdateTargets = [
    "order.quote.breakup",
    "order.fulfillments",
    "payments",
    "fulfillment",
  ];

  if (!updateTarget) {
    testResults.failed.push("update_target is missing");
  } else if (!validUpdateTargets.includes(updateTarget)) {
    testResults.failed.push(
      `update_target must be '${validUpdateTargets}', got '${updateTarget}'`
    );
  } else {
    testResults.passed.push("update_target is valid");
  }

  // Order checks
  if (!order) {
    testResults.failed.push("Order is missing in update");
    return;
  }

  if (!order.id) {
    testResults.failed.push("Order id is missing in update");
  } else {
    testResults.passed.push("Order id is present in update");
  }

  // Order status check — allow SOFT_UPDATE
  if (order.status) {
    const statusMessage =
      order.status === "SOFT_UPDATE"
        ? "Order status is SOFT_UPDATE for update request"
        : `Order status is present: ${order.status}`;
    testResults.passed.push(statusMessage);
  }
}

/**
 * Creates an update validation function with configurable validations
 */
export function createUpdateValidator(...config: string[]) {
  return async function checkUpdate(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    // Always validate update envelope first
    validateUpdateRequestTRV10(message, testResults, action_id);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Financial services validations (reused)
          case trv10Validators.fulfillments_trv10.validate_fulfillments_trv10:
            validateFulfillmentsTRV10(message, testResults, action_id);
            break;
          // TRV10 validations
          case trv10Validators.fulfillment_stops_order
            .validate_fulfillment_stops_order:
            validateFulfillmentStopsInOrder(
              message,
              testResults,
              action_id,
              flowId
            );
            break;

          // FIS12 validations
          case fis12Validators.update.validate_update_payments:
            validateUpdatePaymentsFIS12(message, testResults);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates an OnSearch validation function with configurable validations
 */
export function createOnSearchValidator(...config: string[]) {
  return async function checkOnSearch(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);
    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);

    // Update API map for tracking
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;
          case log11Validators.cod.validate_cod:
            validateCODFlow(flowId, message, testResults);
            break;

          case log11Validators.tax_type_rcm.validate_np_tax_type_rcm:
            validateNpTaxType(flowId, message, testResults, action);
            break;

          case log11Validators.codified_static_terms
            .validate_codified_static_terms:
            validateCodifiedStaticTerms(
              action_id,
              message,
              sessionID,
              transactionId,
              testResults,
              action
            );
            break;

          case log11Validators.public_special_capabilities
            .validate_public_special_capabilities:
            validatePublicSpecialCapabilities(
              flowId,
              message,
              sessionID,
              transactionId,
              testResults
            );

          // Financial services validations
          case fis11Validators.catalog.validate_catalog:
            validateCatalog(message, testResults);
            break;
          case fis11Validators.providers.validate_providers:
            validateProviders(message, testResults);
            break;
          case trv10Validators.providers_trv10.validate_providers_trv10:
            validateProvidersTRV10(message, testResults);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults, action_id);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;

          // TRV10 validations
          case trv10Validators.fulfillment_stops_catalog
            .validate_fulfillment_stops_catalog:
            validateFulfillmentStopsInCatalog(message, testResults, action_id);
            break;

          //FIS12
          case fis12Validators.catalog.providers.categories:
            validateCategoriesFIS12(message, testResults);
            break;
          case fis12Validators.items.validate_onsearch_items:
            validateOnSearchItemsFIS12(message, testResults);
            break;
          case fis12Validators.items.validate_xinput:
            await validateXinputFIS12(message, testResults, sessionID, transactionId,flowId,action_id);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates a select validation function with configurable validations
 */
export function createSelectValidator(...config: string[]) {
  return async function checkSelect(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
    usecaseId?: string
  ): Promise<TestResult> {
    logger.info(`Inside ${action_id || 'select'} validations`, { usecaseId });
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.holidays.validate_holidays:
            validateHolidays(message, context, action, testResults);
            break;
          case log11Validators.lbnp.validate_lbnp:
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case log11Validators.prepaid_payment.validate_prepaid_payment:
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case log11Validators.cod.validate_cod:
            validateCODFlow(flowId, message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults, action_id,usecaseId);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId, usecaseId);
            break;
          /**
           * FIS12-specific validations
           * Note: DomainValidators.fis12OnStatus already wires
           * fis12Validators.fulfillments.validate_fulfillments into the
           * on_status flow. Without this case, that config entry is a no-op.
           */
          case fis12Validators.fulfillments.validate_fulfillments:
            validateFulfillmentsFIS12(message, testResults,usecaseId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;

          // TRV10 validations
          case trv10Validators.items_trv10.validate_items_trv10:
            validateItemsTRV10(message, testResults, action_id);
            break;
          case trv10Validators.fulfillments_trv10.validate_fulfillments_trv10:
            validateFulfillmentsTRV10(message, testResults, action_id);
            break;

          case fis12Validators.items.select_validate_xinput:
            validateXInputStatusFIS12(message, testResults, usecaseId);
            break;
          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an on_select validation function with configurable validations
 */
export function createOnSelectValidator(...config: string[]) {
  return async function checkOnSelect(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
    usecaseId?: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.quote.validate_quote:
            validateQuote(message, testResults,action_id,flowId);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults, action_id, usecaseId);
            break;

          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId,usecaseId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;

          // TRV10 validations
          case trv10Validators.providers_trv10.validate_providers_trv10:
            validateProvidersTRV10(message, testResults);
            break;
          case trv10Validators.provider_trv10.validate_provider_trv10:
            validateProviderTRV10(message, testResults, action_id);
            break;
          case trv10Validators.quote_trv10.validate_quote_trv10:
            validateQuoteTRV10(message, testResults,action_id,flowId);
            break;
          case trv10Validators.fulfillment_stops_order
            .validate_fulfillment_stops_order:
            validateFulfillmentStopsInOrder(
              message,
              testResults,
              action_id,
              flowId
            );
            break;

          // case fis12Validators.items.validate_xinput:
          //   await validateXinputFIS12(message, testResults, sessionID, transactionId,flowId,action_id);
          //   break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates an init validation function with configurable validations
 */
export function createInitValidator(...config: string[]) {
  return async function checkInit(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
    usecaseId?: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.holidays.validate_holidays:
            validateHolidays(message, context, action, testResults);
            break;
          case log11Validators.lbnp.validate_lbnp:
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case log11Validators.prepaid_payment.validate_prepaid_payment:
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case log11Validators.cod.validate_cod:
            validateCODFlow(flowId, message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults, action_id, usecaseId);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId,usecaseId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;

          // FIS12 Gold Loan-specific validations
          case fis12Validators.items.loan_info_oninit:
            validateGoldLoanOnInitFIS12(message, testResults);
            break;

          // FIS12 validations
          case fis12Validators.items.select_validate_xinput:
            // Validate xinput.form_response status & submission_id for FIS12 flows
            validateXInputStatusFIS12(message, testResults);
            break;

          // TRV10 validations
          case trv10Validators.provider_trv10.validate_provider_trv10:
            validateProviderTRV10(message, testResults, action_id);
            break;
          case trv10Validators.items_trv10.validate_items_trv10:
            validateItemsTRV10(message, testResults, action_id);
            break;
          case trv10Validators.fulfillments_trv10.validate_fulfillments_trv10:
            validateFulfillmentsTRV10(message, testResults, action_id);
            break;
          case trv10Validators.payments_trv10.validate_payments_trv10:
            validatePaymentsTRV10(message, testResults);
            break;
          case trv10Validators.billing_trv10.validate_billing_trv10:
            validateBillingTRV10(message, testResults);
            break;
          case trv10Validators.fulfillment_stops_order
            .validate_fulfillment_stops_order:
            validateFulfillmentStopsInOrder(
              message,
              testResults,
              action_id,
              flowId
            );
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates a confirm validation function with configurable validations
 */
export function createConfirmValidator(...config: string[]) {
  return async function checkConfirm(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
    usecaseId?: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.holidays.validate_holidays:
            validateHolidays(message, context, action, testResults);
            break;
          case log11Validators.lbnp.validate_lbnp:
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case log11Validators.prepaid_payment.validate_prepaid_payment:
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case log11Validators.cod.validate_cod:
            validateCODFlow(flowId, message, testResults);
            break;

          case log11Validators.sla_metrics.validate_sla_metrics:
            validateSlaMetricsConfirm(
              sessionID,
              transactionId,
              action_id,
              message,
              testResults,
              action
            );
            break;

          case log11Validators.exchange_customer_contact_details
            .validate_customer_contact_details:
            validateCustomerContactDetails(
              action_id,
              message,
              sessionID,
              transactionId,
              testResults
            );
            break;

          case log11Validators.seller_creds.validate_seller_creds:
            validateSellerCreds(
              flowId,
              message,
              sessionID,
              transactionId,
              testResults
            );
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults, action_id, usecaseId);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId,usecaseId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;

          // TRV10 validations
          case trv10Validators.provider_trv10.validate_provider_trv10:
            validateProviderTRV10(message, testResults, action_id);
            break;
          case trv10Validators.items_trv10.validate_items_trv10:
            validateItemsTRV10(message, testResults, action_id);
            break;
          case trv10Validators.payments_trv10.validate_payments_trv10:
            validatePaymentsTRV10(message, testResults);
            break;
          case trv10Validators.billing_trv10.validate_billing_trv10:
            validateBillingTRV10(message, testResults);
            break;

          default:
            break;
        }
      }
    }
    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an on_init validation function with configurable validations
 */
export function createOnInitValidator(...config: string[]) {
  return async function checkOnInit(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
    usecaseId?: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    logger.info(`Inside on_init validations`, { usecaseId });

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.quote.validate_quote:
            validateQuote(message, testResults,action_id,flowId);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults, action_id, usecaseId);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId,usecaseId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;

          // TRV10 validations
          case trv10Validators.provider_trv10.validate_provider_trv10:
            validateProviderTRV10(message, testResults, action_id);
            break;
          case trv10Validators.quote_trv10.validate_quote_trv10:
            validateQuoteTRV10(message, testResults);
            break;
          case trv10Validators.payments_trv10.validate_payments_trv10:
            validatePaymentsTRV10(message, testResults);
            break;
          case trv10Validators.billing_trv10.validate_billing_trv10:
            validateBillingTRV10(message, testResults);
            break;
          case trv10Validators.fulfillment_stops_order
            .validate_fulfillment_stops_order:
            validateFulfillmentStopsInOrder(
              message,
              testResults,
              action_id,
              flowId
            );
            break;

          // FIS12 validations
          case fis12Validators.fulfillments.validate_fulfillments:
            validateFulfillmentsFIS12(message, testResults,usecaseId);
            break;
          case fis12Validators.documents.validate_documents:
            validateDocumentsFIS12(message, testResults);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates an on_confirm validation function with configurable validations
 */
export function createOnConfirmValidator(...config: string[]) {
  return async function checkOnConfirm(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
    usecaseId?: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);
    const transactionId = context?.transaction_id;

    // Validate transactivalidateP2H2PRequirementson ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          case fis12Validators.fulfillments.validate_fulfillments:
            validateFulfillmentsFIS12(message, testResults,usecaseId);
            break;
          case fis12Validators.payments.validate_payments:
            validatePaymentsFIS12(message, testResults);
            break;
          case fis12Validators.catalog.providers.categories:
            validateCategoriesFIS12(message, testResults);
            break;
          case fis12Validators.documents.validate_documents:
            validateDocumentsFIS12(message, testResults);
            break;

          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;
          case log11Validators.sla_metrics.validate_sla_metrics:
            validateSlaMetricsConfirm(
              sessionID,
              transactionId,
              action_id,
              message,
              testResults,
              action
            );
            break;

          case log11Validators.tax_type_rcm.validate_np_tax_type_rcm:
            validateNpTaxType(flowId, message, testResults, action);
            break;

          case log11Validators.codified_static_terms
            .validate_codified_static_terms:
            validateCodifiedStaticTerms(
              flowId,
              message,
              sessionID,
              transactionId,
              testResults,
              action
            );
            break;

          case log11Validators.exchange_customer_contact_details
            .validate_customer_contact_details:
            validateCustomerContactDetails(
              action_id,
              message,
              sessionID,
              transactionId,
              testResults
            );
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.quote.validate_quote:
            validateQuote(message, testResults,action_id,flowId);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults, action_id, usecaseId);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId,usecaseId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;
          case fis11Validators.order_status.validate_order_status:
            validateOrderStatus(message, testResults, action_id);
            break;

          // TRV10 validations
          case trv10Validators.provider_trv10.validate_provider_trv10:
            validateProviderTRV10(message, testResults, action_id);
            break;
          case trv10Validators.quote_trv10.validate_quote_trv10:
            validateQuoteTRV10(message, testResults,action_id,flowId);
            break;
          case trv10Validators.payments_trv10.validate_payments_trv10:
            validatePaymentsTRV10(message, testResults);
            break;
          case trv10Validators.billing_trv10.validate_billing_trv10:
            validateBillingTRV10(message, testResults);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates an on_status validation function with configurable validations
 */
export function createOnStatusValidator(...config: string[]) {
  return async function checkOnStatus(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
    usecaseId?: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);
    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.quote.validate_quote:
            validateQuote(message, testResults,action_id,flowId);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults, action_id, usecaseId);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId,usecaseId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;
          case fis11Validators.order_status.validate_order_status:
            validateOrderStatus(message, testResults, action_id);
            break;

          // TRV10 validations
          case trv10Validators.provider_trv10.validate_provider_trv10:
            validateProviderTRV10(message, testResults, action_id);
            break;
          case trv10Validators.quote_trv10.validate_quote_trv10:
            validateQuoteTRV10(message, testResults);
            break;
          case trv10Validators.payments_trv10.validate_payments_trv10:
            validatePaymentsTRV10(message, testResults);
            break;
          case trv10Validators.billing_trv10.validate_billing_trv10:
            validateBillingTRV10(message, testResults);
            break;
          case trv10Validators.fulfillment_stops_order
            .validate_fulfillment_stops_order:
            validateFulfillmentStopsInOrder(
              message,
              testResults,
              action_id,
              flowId
            );
            break;

          // FIS12 validations
          case fis12Validators.fulfillments.validate_fulfillments:
            validateFulfillmentsFIS12(message, testResults,usecaseId);
            break;
          case fis12Validators.payments.validate_payments:
            validatePaymentsFIS12(message, testResults);
            break;
          case fis12Validators.documents.validate_documents:
            validateDocumentsFIS12(message, testResults);
            break;
          case fis12Validators.update.validate_fulfillment_state:
            validateFulfillmentStateOnUpdateFIS12(message, testResults, action_id, flowId);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates an on_cancel validation function with configurable validations
 */
export function createOnCancelValidator(...config: string[]) {
  return async function checkOnCancel(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
    usecaseId?: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);
    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    // Always validate cancellation for on_cancel
    validateCancellation(message, testResults, action_id);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.quote.validate_quote:
            validateQuote(message, testResults,action_id,flowId);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults, action_id, usecaseId);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId,usecaseId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;
          case fis11Validators.order_status.validate_order_status:
            validateOrderStatus(message, testResults, action_id);
            break;

          // TRV10 validations
          case trv10Validators.provider_trv10.validate_provider_trv10:
            validateProviderTRV10(message, testResults, action_id);
            break;
          case trv10Validators.quote_trv10.validate_quote_trv10:
            validateQuoteTRV10(message, testResults);
            break;
          case trv10Validators.payments_trv10.validate_payments_trv10:
            validatePaymentsTRV10(message, testResults);
            break;
          case trv10Validators.billing_trv10.validate_billing_trv10:
            validateBillingTRV10(message, testResults);
            break;
          case trv10Validators.fulfillment_stops_order
            .validate_fulfillment_stops_order:
            validateFulfillmentStopsInOrder(
              message,
              testResults,
              action_id,
              flowId
            );
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

export function createOnUpdateValidator(...config: string[]) {
  return async function checkOnUpdate(
    element: Payload,
    sessionID: string,
    flowId: string,
    action_id: string,
    usecaseId?: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);
    const transactionId = context?.transaction_id;

    // Validate transactivalidateP2H2PRequirementson ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;
          case log11Validators.awb_shipping_label.validate_awb_shipping_label:
            validateP2H2PRequirements(context, message, testResults, action);

          case log11Validators.e_pod.validate_e_pod:
            validateEpodProofs(flowId, message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.quote.validate_quote:
            validateQuote(message, testResults,action_id,flowId);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults, action_id, usecaseId);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults, action_id, flowId,usecaseId);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;
          case fis11Validators.order_status.validate_order_status:
            validateOrderStatus(message, testResults, action_id);
            break;

          // TRV10 validations
          case trv10Validators.provider_trv10.validate_provider_trv10:
            validateProviderTRV10(message, testResults, action_id);
            break;
          case trv10Validators.quote_trv10.validate_quote_trv10:
            validateQuoteTRV10(message, testResults);
            break;
          case trv10Validators.payments_trv10.validate_payments_trv10:
            validatePaymentsTRV10(message, testResults);
            break;
          case trv10Validators.billing_trv10.validate_billing_trv10:
            validateBillingTRV10(message, testResults);
            break;
          case trv10Validators.fulfillment_stops_order
            .validate_fulfillment_stops_order:
            validateFulfillmentStopsInOrder(
              message,
              testResults,
              action_id,
              flowId
            );
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}
