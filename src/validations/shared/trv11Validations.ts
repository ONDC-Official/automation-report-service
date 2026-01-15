import { TestResult, Payload } from "../../types/payload";
import assert from "assert";

// Valid values
const VALID_VEHICLE_CATEGORIES = ["METRO", "BUS"];
const VALID_STOP_TYPES = ["START", "END"];
const VALID_COLLECTED_BY = ["BAP", "BPP"];
const GPS_REGEX = /^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/;

export function validateTrv11Intent(
  message: any,
  testResults: TestResult
): void {
  const intent = message?.intent;
  if (!intent) {
    testResults.failed.push("Intent is missing in search request");
    return;
  }

  // Validate Fulfillment
  const fulfillment = intent?.fulfillment;
  if (!fulfillment) {
    testResults.failed.push("Intent fulfillment is missing");
  } else {
    // Validate Vehicle
    const vehicle = fulfillment?.vehicle;
    if (!vehicle?.category) {
      testResults.failed.push("Vehicle category is missing");
    } else if (!VALID_VEHICLE_CATEGORIES.includes(vehicle.category)) {
      testResults.failed.push(
        `Vehicle category should be one of ${VALID_VEHICLE_CATEGORIES.join(", ")}, found: ${vehicle.category}`
      );
    } else {
      testResults.passed.push(`Vehicle category is valid: ${vehicle.category}`);
    }

    // Validate Stops (Optional for Broad Search, Required for Specific Search)
    const stops = fulfillment?.stops;
    if (stops && Array.isArray(stops) && stops.length > 0) {
      stops.forEach((stop: any, index: number) => {
        // Validate Stop Type
        if (!stop.type) {
          testResults.failed.push(`Stop ${index}: type is missing`);
        } else if (!VALID_STOP_TYPES.includes(stop.type)) {
          testResults.failed.push(`Stop ${index}: type should be START or END, found: ${stop.type}`);
        } else {
          testResults.passed.push(`Stop ${index}: type is valid (${stop.type})`);
        }

        // Validate Location (GPS or Descriptor Code)
        const gps = stop?.location?.gps;
        const descriptorCode = stop?.location?.descriptor?.code;

        if (gps) {
          if (!GPS_REGEX.test(gps)) {
            testResults.failed.push(`Stop ${index}: location.gps format is invalid (expected "lat,long"), found: ${gps}`);
          } else {
            testResults.passed.push(`Stop ${index}: location.gps is valid`);
          }
        } else if (descriptorCode) {
           testResults.passed.push(`Stop ${index}: location.descriptor.code is present (${descriptorCode})`);
        } else {
           testResults.failed.push(`Stop ${index}: location must have either gps or descriptor.code`);
        }
      });
      
      // Check for at least one START and one END when stops are present
      const hasStart = stops.some((s: any) => s.type === "START");
      const hasEnd = stops.some((s: any) => s.type === "END");
      if (!hasStart) testResults.failed.push("At least one START stop is required in stops");
      if (!hasEnd) testResults.failed.push("At least one END stop is required in stops");
    } else {
      // Broad Search (No stops)
      testResults.passed.push("Fulfillment stops are not present (Broad Search valid)");
    }
  }

  // Validate Payment
  const payment = intent?.payment;
  if (!payment) {
    testResults.failed.push("Intent payment is missing");
  } else {
    // Validate Collected By
    if (!payment.collected_by) {
      testResults.failed.push("Payment collected_by is missing");
    } else if (!VALID_COLLECTED_BY.includes(payment.collected_by)) {
      testResults.failed.push(
        `Payment collected_by is invalid. Expected one of: ${VALID_COLLECTED_BY.join(", ")}, found: ${payment.collected_by}`
      );
    } else {
      testResults.passed.push(`Payment collected_by is valid: ${payment.collected_by}`);
    }

    // Validate Tags (BFF and Settlement Terms)
    const tags = payment.tags;
    if (!tags || !Array.isArray(tags)) {
      testResults.failed.push("Payment tags are missing");
    } else {
      // Check Buyer Finder Fees
      const bffTag = tags.find((t: any) => t?.descriptor?.code === "BUYER_FINDER_FEES");
      if (!bffTag) {
        testResults.failed.push("BUYER_FINDER_FEES tag is missing in payment");
      } else {
        const percentage = bffTag.list?.find((l: any) => l?.descriptor?.code === "BUYER_FINDER_FEES_PERCENTAGE");
        if (!percentage?.value) {
          testResults.failed.push("BUYER_FINDER_FEES_PERCENTAGE is missing in BUYER_FINDER_FEES tag");
        } else {
          testResults.passed.push(`BUYER_FINDER_FEES_PERCENTAGE is present: ${percentage.value}`);
        }
      }

      // Check Settlement Terms
      const termsTag = tags.find((t: any) => t?.descriptor?.code === "SETTLEMENT_TERMS");
      if (!termsTag) {
        testResults.failed.push("SETTLEMENT_TERMS tag is missing in payment");
      } else {
        const delayInterest = termsTag.list?.find((l: any) => l?.descriptor?.code === "DELAY_INTEREST");
        const staticTerms = termsTag.list?.find((l: any) => l?.descriptor?.code === "STATIC_TERMS");

        if (!delayInterest?.value) testResults.failed.push("DELAY_INTEREST missing in SETTLEMENT_TERMS");
        if (!staticTerms?.value) testResults.failed.push("STATIC_TERMS missing in SETTLEMENT_TERMS");
        
        if (delayInterest?.value && staticTerms?.value) {
           testResults.passed.push("SETTLEMENT_TERMS (DELAY_INTEREST and STATIC_TERMS) are present");
        }
      }
    }
  }
}

// Additional Valid Values for OnSearch
const VALID_FULFILLMENT_TYPES = ["ROUTE", "TRIP"];
const VALID_ON_SEARCH_STOP_TYPES = ["START", "END", "INTERMEDIATE_STOP", "TRANSIT_STOP"];

export function validateTrv11OnSearch(
  message: any,
  testResults: TestResult
): void {
  const catalog = message?.catalog;
  if (!catalog) {
    testResults.failed.push("Catalog is missing in on_search response");
    return;
  }

  // Validate Providers
  const providers = catalog.providers;
  if (!providers || !Array.isArray(providers) || providers.length === 0) {
    testResults.failed.push("Providers array is missing or empty in catalog");
    return;
  }

  providers.forEach((provider: any, pIndex: number) => {
    if (!provider.id) testResults.failed.push(`Provider ${pIndex}: id is missing`);
    if (!provider.descriptor?.name) testResults.failed.push(`Provider ${pIndex}: descriptor.name is missing`);
    
    // Validate Fulfillments
    const fulfillments = provider.fulfillments;
    if (!fulfillments || !Array.isArray(fulfillments) || fulfillments.length === 0) {
      testResults.failed.push(`Provider ${pIndex}: fulfillments array is missing or empty`);
    } else {
      fulfillments.forEach((fulfillment: any, fIndex: number) => {
        // Validate Type
        if (!fulfillment.type) {
          testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex}: type is missing`);
        } else if (!VALID_FULFILLMENT_TYPES.includes(fulfillment.type)) {
          testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex}: type should be one of ${VALID_FULFILLMENT_TYPES.join(", ")}, found: ${fulfillment.type}`);
        }

        // Validate Stops
        const stops = fulfillment.stops;
        if (!stops || !Array.isArray(stops) || stops.length === 0) {
            testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex}: stops array is missing or empty`);
        } else {
            // Check Stops Logic
            stops.forEach((stop: any, sIndex: number) => {
                // Type check
                if (!stop.type) {
                    testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex} Stop ${sIndex}: type is missing`);
                } else if (!VALID_ON_SEARCH_STOP_TYPES.includes(stop.type)) {
                    testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex} Stop ${sIndex}: type is invalid. Found: ${stop.type}`);
                }

                // Location check (GPS + Descriptor)
                if (!stop.location) {
                    testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex} Stop ${sIndex}: location is missing`);
                } else {
                    const gps = stop.location.gps;
                    const code = stop.location.descriptor?.code;
                    
                    if (!gps && !code) {
                        testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex} Stop ${sIndex}: location must have gps or descriptor.code`);
                    }
                    if (gps && !GPS_REGEX.test(gps)) {
                        testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex} Stop ${sIndex}: gps format invalid`);
                    }
                }
            });
            
            const hasStart = stops.some((s: any) => s.type === "START");
            const hasEnd = stops.some((s: any) => s.type === "END");
             if (!hasStart) testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex}: Missing START stop`);
             if (!hasEnd) testResults.failed.push(`Provider ${pIndex} Fulfillment ${fIndex}: Missing END stop`);
        }
      });
    }

    // Validate Items (Optional for Route/Catalog flow)
    const items = provider.items;
    if (items && Array.isArray(items) && items.length > 0) {
        items.forEach((item: any, iIndex: number) => {
            if (!item.id) testResults.failed.push(`Provider ${pIndex} Item ${iIndex}: id is missing`);
            if (!item.price) {
                testResults.failed.push(`Provider ${pIndex} Item ${iIndex}: price is missing`);
            } else {
                if (item.price.currency !== "INR") testResults.failed.push(`Provider ${pIndex} Item ${iIndex}: price.currency should be INR`);
                if (!item.price.value) testResults.failed.push(`Provider ${pIndex} Item ${iIndex}: price.value is missing`);
            }
            if(!item.fulfillment_ids || item.fulfillment_ids.length === 0){
                 testResults.failed.push(`Provider ${pIndex} Item ${iIndex}: fulfillment_ids missing`);
            }
        });
        testResults.passed.push(`Provider ${pIndex}: items validated (${items.length} items)`);
    } else {
         testResults.passed.push(`Provider ${pIndex}: No items present (Acceptable for Route Catalog)`);
    }
  });
}

// Valid fulfillment types for OnSelect
const VALID_ON_SELECT_FULFILLMENT_TYPES = ["TRIP", "TICKET"];

/**
 * Validates TRV11 Select request
 */
export function validateTrv11Select(
  message: any,
  testResults: TestResult
): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing in select request");
    return;
  }

  // Validate Provider
  if (!order.provider?.id) {
    testResults.failed.push("Provider ID is missing in select request");
  } else {
    testResults.passed.push(`Provider ID is present: ${order.provider.id}`);
  }

  // Validate Items
  const items = order.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("Items array is missing or empty in select request");
  } else {
    items.forEach((item: any, index: number) => {
      if (!item.id) {
        testResults.failed.push(`Item ${index}: id is missing`);
      } else {
        testResults.passed.push(`Item ${index}: id is present (${item.id})`);
      }

      // Validate quantity
      const selectedCount = item.quantity?.selected?.count;
      if (selectedCount === undefined || selectedCount === null) {
        testResults.failed.push(`Item ${index}: quantity.selected.count is missing`);
      } else if (typeof selectedCount !== "number" || selectedCount < 1) {
        testResults.failed.push(`Item ${index}: quantity.selected.count must be a positive number`);
      } else {
        testResults.passed.push(`Item ${index}: quantity.selected.count is valid (${selectedCount})`);
      }
    });
  }
}

/**
 * Validates TRV11 OnSelect response
 */
export function validateTrv11OnSelect(
  message: any,
  testResults: TestResult
): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing in on_select response");
    return;
  }

  // Validate Provider
  if (!order.provider?.id) {
    testResults.failed.push("Provider ID is missing");
  } else {
    testResults.passed.push(`Provider ID is present: ${order.provider.id}`);
  }

  // Validate Items
  const items = order.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("Items array is missing or empty");
  } else {
    items.forEach((item: any, index: number) => {
      if (!item.id) testResults.failed.push(`Item ${index}: id is missing`);
      if (!item.price?.value) testResults.failed.push(`Item ${index}: price.value is missing`);
      if (!item.price?.currency) testResults.failed.push(`Item ${index}: price.currency is missing`);
      if (!item.quantity?.selected?.count) testResults.failed.push(`Item ${index}: quantity.selected.count is missing`);
      if (!item.fulfillment_ids || item.fulfillment_ids.length === 0) {
        testResults.failed.push(`Item ${index}: fulfillment_ids is missing`);
      }
    });
    testResults.passed.push(`Items validated (${items.length} items)`);
  }

  // Validate Fulfillments
  const fulfillments = order.fulfillments;
  if (!fulfillments || !Array.isArray(fulfillments) || fulfillments.length === 0) {
    testResults.failed.push("Fulfillments array is missing or empty");
  } else {
    fulfillments.forEach((fulfillment: any, fIndex: number) => {
      if (!fulfillment.id) testResults.failed.push(`Fulfillment ${fIndex}: id is missing`);
      if (!fulfillment.type) {
        testResults.failed.push(`Fulfillment ${fIndex}: type is missing`);
      } else if (!VALID_ON_SELECT_FULFILLMENT_TYPES.includes(fulfillment.type)) {
        testResults.failed.push(`Fulfillment ${fIndex}: type must be one of ${VALID_ON_SELECT_FULFILLMENT_TYPES.join(", ")}, found: ${fulfillment.type}`);
      }

      // For TRIP fulfillment, validate stops
      if (fulfillment.type === "TRIP") {
        const stops = fulfillment.stops;
        if (!stops || stops.length === 0) {
          testResults.failed.push(`Fulfillment ${fIndex} (TRIP): stops are missing`);
        } else {
          const hasStart = stops.some((s: any) => s.type === "START");
          const hasEnd = stops.some((s: any) => s.type === "END");
          if (!hasStart) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing START stop`);
          if (!hasEnd) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing END stop`);
        }
      }

      // For TICKET fulfillment, validate tags with PARENT_ID
      if (fulfillment.type === "TICKET") {
        const infoTag = fulfillment.tags?.find((t: any) => t?.descriptor?.code === "INFO");
        if (!infoTag) {
          testResults.failed.push(`Fulfillment ${fIndex} (TICKET): INFO tag is missing`);
        } else {
          const parentId = infoTag.list?.find((l: any) => l?.descriptor?.code === "PARENT_ID");
          if (!parentId?.value) {
            testResults.failed.push(`Fulfillment ${fIndex} (TICKET): PARENT_ID is missing in INFO tag`);
          }
        }
      }
    });
    testResults.passed.push(`Fulfillments validated (${fulfillments.length} fulfillments)`);
  }

  // Validate Quote
  const quote = order.quote;
  if (!quote) {
    testResults.failed.push("Quote is missing");
  } else {
    if (!quote.price?.value) testResults.failed.push("Quote price.value is missing");
    if (!quote.price?.currency) testResults.failed.push("Quote price.currency is missing");
    if (!quote.breakup || !Array.isArray(quote.breakup) || quote.breakup.length === 0) {
      testResults.failed.push("Quote breakup is missing or empty");
    } else {
      testResults.passed.push(`Quote breakup validated (${quote.breakup.length} items)`);
    }
  }

  // Validate Cancellation Terms (optional but if present, check structure)
  const cancellationTerms = order.cancellation_terms;
  if (cancellationTerms && Array.isArray(cancellationTerms) && cancellationTerms.length > 0) {
    testResults.passed.push("Cancellation terms are present");
  }
}

// Valid payment statuses and types for TRV11
const VALID_PAYMENT_STATUSES = ["PAID", "NOT-PAID"];
const VALID_PAYMENT_TYPES = ["PRE-ORDER", "ON-FULFILLMENT", "POST-FULFILLMENT"];

/**
 * Validates TRV11 Init request
 */
export function validateTrv11Init(
  message: any,
  testResults: TestResult
): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing in init request");
    return;
  }

  // Validate Provider
  if (!order.provider?.id) {
    testResults.failed.push("Provider ID is missing in init request");
  } else {
    testResults.passed.push(`Provider ID is present: ${order.provider.id}`);
  }

  // Validate Items
  const items = order.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("Items array is missing or empty in init request");
  } else {
    items.forEach((item: any, index: number) => {
      if (!item.id) testResults.failed.push(`Item ${index}: id is missing`);
      if (!item.quantity?.selected?.count) testResults.failed.push(`Item ${index}: quantity.selected.count is missing`);
    });
    testResults.passed.push(`Items validated (${items.length} items)`);
  }

  // Validate Billing
  const billing = order.billing;
  if (!billing) {
    testResults.failed.push("Billing is missing in init request");
  } else {
    if (!billing.name) testResults.failed.push("Billing name is missing");
    if (!billing.email) testResults.failed.push("Billing email is missing");
    if (!billing.phone) testResults.failed.push("Billing phone is missing");
    if (billing.name && billing.phone) {
      testResults.passed.push("Billing info is valid");
    }
  }

  // Validate Payments
  const payments = order.payments;
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    testResults.failed.push("Payments array is missing or empty");
  } else {
    payments.forEach((payment: any, pIndex: number) => {
      if (!payment.collected_by) {
        testResults.failed.push(`Payment ${pIndex}: collected_by is missing`);
      } else if (!VALID_COLLECTED_BY.includes(payment.collected_by)) {
        testResults.failed.push(`Payment ${pIndex}: collected_by must be BAP or BPP`);
      }

      if (!payment.status) {
        testResults.failed.push(`Payment ${pIndex}: status is missing`);
      } else if (!VALID_PAYMENT_STATUSES.includes(payment.status)) {
        testResults.failed.push(`Payment ${pIndex}: status must be one of ${VALID_PAYMENT_STATUSES.join(", ")}`);
      }

      if (!payment.type) {
        testResults.failed.push(`Payment ${pIndex}: type is missing`);
      } else if (!VALID_PAYMENT_TYPES.includes(payment.type)) {
        testResults.failed.push(`Payment ${pIndex}: type must be one of ${VALID_PAYMENT_TYPES.join(", ")}`);
      }

      // Validate Payment Tags
      const tags = payment.tags;
      if (!tags || !Array.isArray(tags)) {
        testResults.failed.push(`Payment ${pIndex}: tags are missing`);
      } else {
        const bffTag = tags.find((t: any) => t?.descriptor?.code === "BUYER_FINDER_FEES");
        if (!bffTag) testResults.failed.push(`Payment ${pIndex}: BUYER_FINDER_FEES tag is missing`);
        
        const settlementsTag = tags.find((t: any) => t?.descriptor?.code === "SETTLEMENT_TERMS");
        if (!settlementsTag) testResults.failed.push(`Payment ${pIndex}: SETTLEMENT_TERMS tag is missing`);
      }
    });
    testResults.passed.push(`Payments validated (${payments.length} payments)`);
  }
}

/**
 * Validates TRV11 OnInit response
 */
export function validateTrv11OnInit(
  message: any,
  testResults: TestResult
): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing in on_init response");
    return;
  }

  // Validate Provider
  if (!order.provider?.id) {
    testResults.failed.push("Provider ID is missing");
  } else {
    testResults.passed.push(`Provider ID is present: ${order.provider.id}`);
  }

  // Validate Items
  const items = order.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("Items array is missing or empty");
  } else {
    items.forEach((item: any, index: number) => {
      if (!item.id) testResults.failed.push(`Item ${index}: id is missing`);
      if (!item.price?.value) testResults.failed.push(`Item ${index}: price.value is missing`);
      if (!item.quantity?.selected?.count) testResults.failed.push(`Item ${index}: quantity.selected.count is missing`);
      if (!item.fulfillment_ids || item.fulfillment_ids.length === 0) {
        testResults.failed.push(`Item ${index}: fulfillment_ids is missing`);
      }
    });
    testResults.passed.push(`Items validated (${items.length} items)`);
  }

  // Validate Fulfillments
  const fulfillments = order.fulfillments;
  if (!fulfillments || !Array.isArray(fulfillments) || fulfillments.length === 0) {
    testResults.failed.push("Fulfillments array is missing or empty");
  } else {
    fulfillments.forEach((fulfillment: any, fIndex: number) => {
      if (!fulfillment.id) testResults.failed.push(`Fulfillment ${fIndex}: id is missing`);
      if (!fulfillment.type) testResults.failed.push(`Fulfillment ${fIndex}: type is missing`);

      // For TRIP fulfillment, validate stops
      if (fulfillment.type === "TRIP") {
        const stops = fulfillment.stops;
        if (!stops || stops.length === 0) {
          testResults.failed.push(`Fulfillment ${fIndex} (TRIP): stops are missing`);
        } else {
          const hasStart = stops.some((s: any) => s.type === "START");
          const hasEnd = stops.some((s: any) => s.type === "END");
          if (!hasStart) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing START stop`);
          if (!hasEnd) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing END stop`);
        }
      }

      // For TICKET fulfillment, validate INFO tag with PARENT_ID
      if (fulfillment.type === "TICKET") {
        const infoTag = fulfillment.tags?.find((t: any) => t?.descriptor?.code === "INFO");
        if (!infoTag) {
          testResults.failed.push(`Fulfillment ${fIndex} (TICKET): INFO tag is missing`);
        } else {
          const parentId = infoTag.list?.find((l: any) => l?.descriptor?.code === "PARENT_ID");
          if (!parentId?.value) {
            testResults.failed.push(`Fulfillment ${fIndex} (TICKET): PARENT_ID is missing in INFO tag`);
          }
        }
      }
    });
    testResults.passed.push(`Fulfillments validated (${fulfillments.length} fulfillments)`);
  }

  // Validate Billing
  const billing = order.billing;
  if (!billing) {
    testResults.failed.push("Billing is missing");
  } else {
    if (!billing.name) testResults.failed.push("Billing name is missing");
    if (!billing.phone) testResults.failed.push("Billing phone is missing");
    if (billing.name && billing.phone) {
      testResults.passed.push("Billing info is valid");
    }
  }

  // Validate Quote
  const quote = order.quote;
  if (!quote) {
    testResults.failed.push("Quote is missing");
  } else {
    if (!quote.price?.value) testResults.failed.push("Quote price.value is missing");
    if (!quote.price?.currency) testResults.failed.push("Quote price.currency is missing");
    if (!quote.breakup || !Array.isArray(quote.breakup) || quote.breakup.length === 0) {
      testResults.failed.push("Quote breakup is missing or empty");
    } else {
      testResults.passed.push(`Quote breakup validated (${quote.breakup.length} items)`);
    }
  }

  // Validate Payments
  const payments = order.payments;
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    testResults.failed.push("Payments array is missing or empty");
  } else {
    payments.forEach((payment: any, pIndex: number) => {
      if (!payment.id) testResults.failed.push(`Payment ${pIndex}: id is missing`);
      if (!payment.collected_by) testResults.failed.push(`Payment ${pIndex}: collected_by is missing`);
      if (!payment.status) testResults.failed.push(`Payment ${pIndex}: status is missing`);
      if (!payment.type) testResults.failed.push(`Payment ${pIndex}: type is missing`);

      // Validate bank params if collected_by is BAP
      if (payment.collected_by === "BAP" && payment.params) {
        if (!payment.params.bank_code) testResults.failed.push(`Payment ${pIndex}: bank_code is missing in params`);
        if (!payment.params.bank_account_number) testResults.failed.push(`Payment ${pIndex}: bank_account_number is missing in params`);
      }

      // Validate Payment Tags
      const tags = payment.tags;
      if (tags && Array.isArray(tags)) {
        const bffTag = tags.find((t: any) => t?.descriptor?.code === "BUYER_FINDER_FEES");
        if (!bffTag) testResults.failed.push(`Payment ${pIndex}: BUYER_FINDER_FEES tag is missing`);
        
        const settlementsTag = tags.find((t: any) => t?.descriptor?.code === "SETTLEMENT_TERMS");
        if (!settlementsTag) testResults.failed.push(`Payment ${pIndex}: SETTLEMENT_TERMS tag is missing`);
      }
    });
    testResults.passed.push(`Payments validated (${payments.length} payments)`);
  }

  // Validate Cancellation Terms (optional)
  const cancellationTerms = order.cancellation_terms;
  if (cancellationTerms && Array.isArray(cancellationTerms) && cancellationTerms.length > 0) {
    testResults.passed.push("Cancellation terms are present");
  }
}

// Valid order statuses for TRV11
const VALID_ORDER_STATUSES = ["ACTIVE", "COMPLETE", "CANCELLED"];

/**
 * Validates TRV11 Confirm request
 */
export function validateTrv11Confirm(
  message: any,
  testResults: TestResult
): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing in confirm request");
    return;
  }

  // Validate Provider
  if (!order.provider?.id) {
    testResults.failed.push("Provider ID is missing in confirm request");
  } else {
    testResults.passed.push(`Provider ID is present: ${order.provider.id}`);
  }

  // Validate Items
  const items = order.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("Items array is missing or empty in confirm request");
  } else {
    items.forEach((item: any, index: number) => {
      if (!item.id) testResults.failed.push(`Item ${index}: id is missing`);
      if (!item.quantity?.selected?.count) testResults.failed.push(`Item ${index}: quantity.selected.count is missing`);
    });
    testResults.passed.push(`Items validated (${items.length} items)`);
  }

  // Validate Billing
  const billing = order.billing;
  if (!billing) {
    testResults.failed.push("Billing is missing in confirm request");
  } else {
    if (!billing.name) testResults.failed.push("Billing name is missing");
    if (!billing.phone) testResults.failed.push("Billing phone is missing");
    if (billing.name && billing.phone) {
      testResults.passed.push("Billing info is valid");
    }
  }

  // Validate Payments (should be PAID in confirm)
  const payments = order.payments;
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    testResults.failed.push("Payments array is missing or empty");
  } else {
    payments.forEach((payment: any, pIndex: number) => {
      if (!payment.id) testResults.failed.push(`Payment ${pIndex}: id is missing`);
      if (!payment.collected_by) testResults.failed.push(`Payment ${pIndex}: collected_by is missing`);
      
      // Status should be PAID in confirm
      if (!payment.status) {
        testResults.failed.push(`Payment ${pIndex}: status is missing`);
      } else if (payment.status !== "PAID") {
        testResults.failed.push(`Payment ${pIndex}: status should be PAID in confirm, found: ${payment.status}`);
      } else {
        testResults.passed.push(`Payment ${pIndex}: status is PAID`);
      }

      if (!payment.type) testResults.failed.push(`Payment ${pIndex}: type is missing`);

      // Validate payment params (transaction details)
      const params = payment.params;
      if (!params) {
        testResults.failed.push(`Payment ${pIndex}: params is missing`);
      } else {
        if (!params.transaction_id) testResults.failed.push(`Payment ${pIndex}: params.transaction_id is missing`);
        if (!params.currency) testResults.failed.push(`Payment ${pIndex}: params.currency is missing`);
        if (!params.amount) testResults.failed.push(`Payment ${pIndex}: params.amount is missing`);
        if (params.transaction_id && params.amount) {
          testResults.passed.push(`Payment ${pIndex}: transaction params are valid`);
        }
      }

      // Validate Payment Tags
      const tags = payment.tags;
      if (tags && Array.isArray(tags)) {
        const bffTag = tags.find((t: any) => t?.descriptor?.code === "BUYER_FINDER_FEES");
        if (!bffTag) testResults.failed.push(`Payment ${pIndex}: BUYER_FINDER_FEES tag is missing`);
        
        const settlementsTag = tags.find((t: any) => t?.descriptor?.code === "SETTLEMENT_TERMS");
        if (!settlementsTag) testResults.failed.push(`Payment ${pIndex}: SETTLEMENT_TERMS tag is missing`);
      }
    });
    testResults.passed.push(`Payments validated (${payments.length} payments)`);
  }
}

/**
 * Validates TRV11 OnConfirm response
 */
export function validateTrv11OnConfirm(
  message: any,
  testResults: TestResult
): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing in on_confirm response");
    return;
  }

  // Validate Order ID (required in on_confirm)
  if (!order.id) {
    testResults.failed.push("Order ID is missing");
  } else {
    testResults.passed.push(`Order ID is present: ${order.id}`);
  }

  // Validate Order Status
  if (!order.status) {
    testResults.failed.push("Order status is missing");
  } else if (!VALID_ORDER_STATUSES.includes(order.status)) {
    testResults.failed.push(`Order status must be one of ${VALID_ORDER_STATUSES.join(", ")}, found: ${order.status}`);
  } else {
    testResults.passed.push(`Order status is valid: ${order.status}`);
  }

  // Validate Provider
  if (!order.provider?.id) {
    testResults.failed.push("Provider ID is missing");
  } else {
    testResults.passed.push(`Provider ID is present: ${order.provider.id}`);
  }

  // Validate Items
  const items = order.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("Items array is missing or empty");
  } else {
    items.forEach((item: any, index: number) => {
      if (!item.id) testResults.failed.push(`Item ${index}: id is missing`);
      if (!item.price?.value) testResults.failed.push(`Item ${index}: price.value is missing`);
      if (!item.quantity?.selected?.count) testResults.failed.push(`Item ${index}: quantity.selected.count is missing`);
      if (!item.fulfillment_ids || item.fulfillment_ids.length === 0) {
        testResults.failed.push(`Item ${index}: fulfillment_ids is missing`);
      }
    });
    testResults.passed.push(`Items validated (${items.length} items)`);
  }

  // Validate Fulfillments
  const fulfillments = order.fulfillments;
  if (!fulfillments || !Array.isArray(fulfillments) || fulfillments.length === 0) {
    testResults.failed.push("Fulfillments array is missing or empty");
  } else {
    fulfillments.forEach((fulfillment: any, fIndex: number) => {
      if (!fulfillment.id) testResults.failed.push(`Fulfillment ${fIndex}: id is missing`);
      if (!fulfillment.type) testResults.failed.push(`Fulfillment ${fIndex}: type is missing`);

      // For TRIP fulfillment, validate stops
      if (fulfillment.type === "TRIP") {
        const stops = fulfillment.stops;
        if (!stops || stops.length === 0) {
          testResults.failed.push(`Fulfillment ${fIndex} (TRIP): stops are missing`);
        } else {
          const hasStart = stops.some((s: any) => s.type === "START");
          const hasEnd = stops.some((s: any) => s.type === "END");
          if (!hasStart) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing START stop`);
          if (!hasEnd) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing END stop`);
        }
      }

      // For TICKET fulfillment, validate authorization (QR code)
      if (fulfillment.type === "TICKET") {
        const infoTag = fulfillment.tags?.find((t: any) => t?.descriptor?.code === "INFO");
        if (!infoTag) {
          testResults.failed.push(`Fulfillment ${fIndex} (TICKET): INFO tag is missing`);
        }

        // Check for authorization in stops
        const stops = fulfillment.stops;
        if (stops && stops.length > 0) {
          const startStop = stops.find((s: any) => s.type === "START");
          if (startStop?.authorization) {
            const auth = startStop.authorization;
            if (!auth.type) testResults.failed.push(`Fulfillment ${fIndex} (TICKET): authorization.type is missing`);
            if (!auth.token) testResults.failed.push(`Fulfillment ${fIndex} (TICKET): authorization.token is missing`);
            if (!auth.status) testResults.failed.push(`Fulfillment ${fIndex} (TICKET): authorization.status is missing`);
            if (auth.type && auth.token) {
              testResults.passed.push(`Fulfillment ${fIndex} (TICKET): authorization is valid (${auth.type})`);
            }
          }
        }

        // Check for TICKET_INFO tag
        const ticketInfoTag = fulfillment.tags?.find((t: any) => t?.descriptor?.code === "TICKET_INFO");
        if (ticketInfoTag) {
          testResults.passed.push(`Fulfillment ${fIndex} (TICKET): TICKET_INFO tag is present`);
        }
      }
    });
    testResults.passed.push(`Fulfillments validated (${fulfillments.length} fulfillments)`);
  }

  // Validate Billing
  const billing = order.billing;
  if (!billing) {
    testResults.failed.push("Billing is missing");
  } else {
    if (!billing.name) testResults.failed.push("Billing name is missing");
    if (!billing.phone) testResults.failed.push("Billing phone is missing");
    if (billing.name && billing.phone) {
      testResults.passed.push("Billing info is valid");
    }
  }

  // Validate Quote
  const quote = order.quote;
  if (!quote) {
    testResults.failed.push("Quote is missing");
  } else {
    if (!quote.price?.value) testResults.failed.push("Quote price.value is missing");
    if (!quote.price?.currency) testResults.failed.push("Quote price.currency is missing");
    if (!quote.breakup || !Array.isArray(quote.breakup) || quote.breakup.length === 0) {
      testResults.failed.push("Quote breakup is missing or empty");
    } else {
      testResults.passed.push(`Quote breakup validated (${quote.breakup.length} items)`);
    }
  }

  // Validate Payments
  const payments = order.payments;
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    testResults.failed.push("Payments array is missing or empty");
  } else {
    payments.forEach((payment: any, pIndex: number) => {
      if (!payment.id) testResults.failed.push(`Payment ${pIndex}: id is missing`);
      if (!payment.collected_by) testResults.failed.push(`Payment ${pIndex}: collected_by is missing`);
      if (!payment.status) testResults.failed.push(`Payment ${pIndex}: status is missing`);
      if (!payment.type) testResults.failed.push(`Payment ${pIndex}: type is missing`);

      // Validate payment params
      const params = payment.params;
      if (params) {
        if (!params.transaction_id) testResults.failed.push(`Payment ${pIndex}: params.transaction_id is missing`);
        if (params.transaction_id) {
          testResults.passed.push(`Payment ${pIndex}: transaction_id is present`);
        }
      }
    });
    testResults.passed.push(`Payments validated (${payments.length} payments)`);
  }

  // Validate timestamps
  if (!order.created_at) testResults.failed.push("Order created_at is missing");
  if (!order.updated_at) testResults.failed.push("Order updated_at is missing");
  if (order.created_at && order.updated_at) {
    testResults.passed.push("Order timestamps are present");
  }

  // Validate Cancellation Terms (optional)
  const cancellationTerms = order.cancellation_terms;
  if (cancellationTerms && Array.isArray(cancellationTerms) && cancellationTerms.length > 0) {
    testResults.passed.push("Cancellation terms are present");
  }
}

/**
 * Validates TRV11 Status request
 */
export function validateTrv11Status(
  message: any,
  testResults: TestResult
): void {
  // Status request only requires order_id
  const orderId = message?.order_id;
  if (!orderId) {
    testResults.failed.push("order_id is missing in status request");
  } else {
    testResults.passed.push(`order_id is present: ${orderId}`);
  }
}

/**
 * Validates TRV11 OnStatus response
 */
export function validateTrv11OnStatus(
  message: any,
  testResults: TestResult
): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing in on_status response");
    return;
  }

  // Validate Order ID
  if (!order.id) {
    testResults.failed.push("Order ID is missing");
  } else {
    testResults.passed.push(`Order ID is present: ${order.id}`);
  }

  // Validate Order Status
  if (!order.status) {
    testResults.failed.push("Order status is missing");
  } else if (!VALID_ORDER_STATUSES.includes(order.status)) {
    testResults.failed.push(`Order status must be one of ${VALID_ORDER_STATUSES.join(", ")}, found: ${order.status}`);
  } else {
    testResults.passed.push(`Order status is valid: ${order.status}`);
  }

  // Validate Provider
  if (!order.provider?.id) {
    testResults.failed.push("Provider ID is missing");
  } else {
    testResults.passed.push(`Provider ID is present: ${order.provider.id}`);
  }

  // Validate Items
  const items = order.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("Items array is missing or empty");
  } else {
    items.forEach((item: any, index: number) => {
      if (!item.id) testResults.failed.push(`Item ${index}: id is missing`);
      if (!item.price?.value) testResults.failed.push(`Item ${index}: price.value is missing`);
      if (!item.quantity?.selected?.count) testResults.failed.push(`Item ${index}: quantity.selected.count is missing`);
      if (!item.fulfillment_ids || item.fulfillment_ids.length === 0) {
        testResults.failed.push(`Item ${index}: fulfillment_ids is missing`);
      }
    });
    testResults.passed.push(`Items validated (${items.length} items)`);
  }

  // Validate Fulfillments
  const fulfillments = order.fulfillments;
  if (!fulfillments || !Array.isArray(fulfillments) || fulfillments.length === 0) {
    testResults.failed.push("Fulfillments array is missing or empty");
  } else {
    fulfillments.forEach((fulfillment: any, fIndex: number) => {
      if (!fulfillment.id) testResults.failed.push(`Fulfillment ${fIndex}: id is missing`);
      if (!fulfillment.type) testResults.failed.push(`Fulfillment ${fIndex}: type is missing`);

      // For TRIP fulfillment, validate stops
      if (fulfillment.type === "TRIP") {
        const stops = fulfillment.stops;
        if (!stops || stops.length === 0) {
          testResults.failed.push(`Fulfillment ${fIndex} (TRIP): stops are missing`);
        } else {
          const hasStart = stops.some((s: any) => s.type === "START");
          const hasEnd = stops.some((s: any) => s.type === "END");
          if (!hasStart) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing START stop`);
          if (!hasEnd) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing END stop`);
        }
      }

      // For TICKET fulfillment, validate authorization
      if (fulfillment.type === "TICKET") {
        const infoTag = fulfillment.tags?.find((t: any) => t?.descriptor?.code === "INFO");
        if (!infoTag) {
          testResults.failed.push(`Fulfillment ${fIndex} (TICKET): INFO tag is missing`);
        }

        // Check for authorization in stops
        const stops = fulfillment.stops;
        if (stops && stops.length > 0) {
          const startStop = stops.find((s: any) => s.type === "START");
          if (startStop?.authorization) {
            const auth = startStop.authorization;
            if (!auth.type) testResults.failed.push(`Fulfillment ${fIndex} (TICKET): authorization.type is missing`);
            if (!auth.token) testResults.failed.push(`Fulfillment ${fIndex} (TICKET): authorization.token is missing`);
            if (!auth.status) testResults.failed.push(`Fulfillment ${fIndex} (TICKET): authorization.status is missing`);
            if (auth.type && auth.token && auth.status) {
              testResults.passed.push(`Fulfillment ${fIndex} (TICKET): authorization is valid (${auth.type}, ${auth.status})`);
            }
          }
        }
      }
    });
    testResults.passed.push(`Fulfillments validated (${fulfillments.length} fulfillments)`);
  }

  // Validate Billing
  const billing = order.billing;
  if (!billing) {
    testResults.failed.push("Billing is missing");
  } else {
    if (!billing.name) testResults.failed.push("Billing name is missing");
    if (!billing.phone) testResults.failed.push("Billing phone is missing");
    if (billing.name && billing.phone) {
      testResults.passed.push("Billing info is valid");
    }
  }

  // Validate Quote
  const quote = order.quote;
  if (!quote) {
    testResults.failed.push("Quote is missing");
  } else {
    if (!quote.price?.value) testResults.failed.push("Quote price.value is missing");
    if (!quote.price?.currency) testResults.failed.push("Quote price.currency is missing");
    if (!quote.breakup || !Array.isArray(quote.breakup) || quote.breakup.length === 0) {
      testResults.failed.push("Quote breakup is missing or empty");
    } else {
      testResults.passed.push(`Quote breakup validated (${quote.breakup.length} items)`);
    }
  }

  // Validate Payments
  const payments = order.payments;
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    testResults.failed.push("Payments array is missing or empty");
  } else {
    payments.forEach((payment: any, pIndex: number) => {
      if (!payment.id) testResults.failed.push(`Payment ${pIndex}: id is missing`);
      if (!payment.collected_by) testResults.failed.push(`Payment ${pIndex}: collected_by is missing`);
      if (!payment.status) testResults.failed.push(`Payment ${pIndex}: status is missing`);
      if (!payment.type) testResults.failed.push(`Payment ${pIndex}: type is missing`);
    });
    testResults.passed.push(`Payments validated (${payments.length} payments)`);
  }

  // Validate timestamps
  if (!order.created_at) testResults.failed.push("Order created_at is missing");
  if (!order.updated_at) testResults.failed.push("Order updated_at is missing");
  if (order.created_at && order.updated_at) {
    testResults.passed.push("Order timestamps are present");
  }

  // Validate Cancellation Terms (optional)
  const cancellationTerms = order.cancellation_terms;
  if (cancellationTerms && Array.isArray(cancellationTerms) && cancellationTerms.length > 0) {
    testResults.passed.push("Cancellation terms are present");
  }
}

// Valid cancel descriptor codes for TRV11
const VALID_CANCEL_CODES = ["SOFT_CANCEL", "CONFIRM_CANCEL"];
// Valid cancel statuses (for on_cancel response)
const VALID_CANCEL_STATUSES = ["SOFT_CANCEL", "CANCELLED"];

/**
 * Validates TRV11 Cancel request
 */
export function validateTrv11Cancel(
  message: any,
  testResults: TestResult
): void {
  // Validate order_id
  const orderId = message?.order_id;
  if (!orderId) {
    testResults.failed.push("order_id is missing in cancel request");
  } else {
    testResults.passed.push(`order_id is present: ${orderId}`);
  }

  // Validate cancellation_reason_id
  const reasonId = message?.cancellation_reason_id;
  if (!reasonId) {
    testResults.failed.push("cancellation_reason_id is missing");
  } else {
    testResults.passed.push(`cancellation_reason_id is present: ${reasonId}`);
  }

  // Validate descriptor with cancel type
  const descriptor = message?.descriptor;
  if (!descriptor) {
    testResults.failed.push("descriptor is missing in cancel request");
  } else {
    if (!descriptor.code) {
      testResults.failed.push("descriptor.code is missing");
    } else if (!VALID_CANCEL_CODES.includes(descriptor.code)) {
      testResults.failed.push(`descriptor.code must be one of ${VALID_CANCEL_CODES.join(", ")}, found: ${descriptor.code}`);
    } else {
      testResults.passed.push(`Cancel type is valid: ${descriptor.code}`);
    }
  }
}

/**
 * Validates TRV11 OnCancel response
 */
export function validateTrv11OnCancel(
  message: any,
  testResults: TestResult
): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing in on_cancel response");
    return;
  }

  // Validate Order ID
  if (!order.id) {
    testResults.failed.push("Order ID is missing");
  } else {
    testResults.passed.push(`Order ID is present: ${order.id}`);
  }

  // Validate Order Status (should be SOFT_CANCEL or CANCELLED)
  if (!order.status) {
    testResults.failed.push("Order status is missing");
  } else if (!VALID_CANCEL_STATUSES.includes(order.status)) {
    testResults.failed.push(`Order status must be one of ${VALID_CANCEL_STATUSES.join(", ")}, found: ${order.status}`);
  } else {
    testResults.passed.push(`Order status is valid: ${order.status}`);
  }

  // Validate Provider
  if (!order.provider?.id) {
    testResults.failed.push("Provider ID is missing");
  } else {
    testResults.passed.push(`Provider ID is present: ${order.provider.id}`);
  }

  // Validate Items
  const items = order.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    testResults.failed.push("Items array is missing or empty");
  } else {
    items.forEach((item: any, index: number) => {
      if (!item.id) testResults.failed.push(`Item ${index}: id is missing`);
      if (!item.price?.value) testResults.failed.push(`Item ${index}: price.value is missing`);
      if (!item.quantity?.selected?.count) testResults.failed.push(`Item ${index}: quantity.selected.count is missing`);
    });
    testResults.passed.push(`Items validated (${items.length} items)`);
  }

  // Validate Fulfillments
  const fulfillments = order.fulfillments;
  if (!fulfillments || !Array.isArray(fulfillments) || fulfillments.length === 0) {
    testResults.failed.push("Fulfillments array is missing or empty");
  } else {
    fulfillments.forEach((fulfillment: any, fIndex: number) => {
      if (!fulfillment.id) testResults.failed.push(`Fulfillment ${fIndex}: id is missing`);
      if (!fulfillment.type) testResults.failed.push(`Fulfillment ${fIndex}: type is missing`);

      // For TRIP fulfillment, validate stops
      if (fulfillment.type === "TRIP") {
        const stops = fulfillment.stops;
        if (!stops || stops.length === 0) {
          testResults.failed.push(`Fulfillment ${fIndex} (TRIP): stops are missing`);
        } else {
          const hasStart = stops.some((s: any) => s.type === "START");
          const hasEnd = stops.some((s: any) => s.type === "END");
          if (!hasStart) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing START stop`);
          if (!hasEnd) testResults.failed.push(`Fulfillment ${fIndex} (TRIP): Missing END stop`);
        }
      }

      // For TICKET fulfillment, validate INFO tag
      if (fulfillment.type === "TICKET") {
        const infoTag = fulfillment.tags?.find((t: any) => t?.descriptor?.code === "INFO");
        if (!infoTag) {
          testResults.failed.push(`Fulfillment ${fIndex} (TICKET): INFO tag is missing`);
        }
      }
    });
    testResults.passed.push(`Fulfillments validated (${fulfillments.length} fulfillments)`);
  }

  // Validate Billing
  const billing = order.billing;
  if (!billing) {
    testResults.failed.push("Billing is missing");
  } else {
    if (!billing.name) testResults.failed.push("Billing name is missing");
    if (!billing.phone) testResults.failed.push("Billing phone is missing");
    if (billing.name && billing.phone) {
      testResults.passed.push("Billing info is valid");
    }
  }

  // Validate Quote (should include REFUND and CANCELLATION_CHARGES in breakup)
  const quote = order.quote;
  if (!quote) {
    testResults.failed.push("Quote is missing");
  } else {
    if (!quote.price?.value) testResults.failed.push("Quote price.value is missing");
    if (!quote.price?.currency) testResults.failed.push("Quote price.currency is missing");
    if (!quote.breakup || !Array.isArray(quote.breakup) || quote.breakup.length === 0) {
      testResults.failed.push("Quote breakup is missing or empty");
    } else {
      // Check for REFUND in breakup
      const hasRefund = quote.breakup.some((b: any) => b.title === "REFUND");
      if (hasRefund) {
        testResults.passed.push("Quote breakup includes REFUND");
      }
      // Check for CANCELLATION_CHARGES in breakup
      const hasCancellationCharges = quote.breakup.some((b: any) => b.title === "CANCELLATION_CHARGES");
      if (hasCancellationCharges) {
        testResults.passed.push("Quote breakup includes CANCELLATION_CHARGES");
      }
      testResults.passed.push(`Quote breakup validated (${quote.breakup.length} items)`);
    }
  }

  // Validate Payments
  const payments = order.payments;
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    testResults.failed.push("Payments array is missing or empty");
  } else {
    payments.forEach((payment: any, pIndex: number) => {
      if (!payment.id) testResults.failed.push(`Payment ${pIndex}: id is missing`);
      if (!payment.collected_by) testResults.failed.push(`Payment ${pIndex}: collected_by is missing`);
      if (!payment.status) testResults.failed.push(`Payment ${pIndex}: status is missing`);
      if (!payment.type) testResults.failed.push(`Payment ${pIndex}: type is missing`);
    });
    testResults.passed.push(`Payments validated (${payments.length} payments)`);
  }

  // Validate Cancellation object
  const cancellation = order.cancellation;
  if (!cancellation) {
    testResults.failed.push("Cancellation object is missing");
  } else {
    if (!cancellation.cancelled_by) {
      testResults.failed.push("cancellation.cancelled_by is missing");
    } else {
      testResults.passed.push(`Cancelled by: ${cancellation.cancelled_by}`);
    }

    if (!cancellation.reason?.descriptor?.code) {
      testResults.failed.push("cancellation.reason.descriptor.code is missing");
    } else {
      testResults.passed.push(`Cancellation reason code: ${cancellation.reason.descriptor.code}`);
    }
  }

  // Validate timestamps
  if (!order.created_at) testResults.failed.push("Order created_at is missing");
  if (!order.updated_at) testResults.failed.push("Order updated_at is missing");
  if (order.created_at && order.updated_at) {
    testResults.passed.push("Order timestamps are present");
  }

  // Validate Cancellation Terms (optional)
  const cancellationTerms = order.cancellation_terms;
  if (cancellationTerms && Array.isArray(cancellationTerms) && cancellationTerms.length > 0) {
    testResults.passed.push("Cancellation terms are present");
  }
}
