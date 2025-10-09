import { TestResult, Payload } from "../../types/payload";
import { logger } from "../../utils/logger";
import _ from "lodash";

// Simple retail validation utilities without cache dependencies
export const isObjectEmpty = (obj: any): boolean => {
  return obj === null || obj === undefined || Object.keys(obj).length === 0;
};

export const checkBppIdOrBapId = (id: string): boolean => {
  try {
    new URL(id);
    return true; // It's a URL, which is invalid
  } catch {
    return false; // Not a URL, which is valid
  }
};

export const checkGpsPrecision = (gps: string): boolean => {
  if (!gps) return false;
  const coordinates = gps.split(',');
  if (coordinates.length !== 2) return false;
  
  const [lat, lng] = coordinates;
  const latDecimalPlaces = lat.split('.')[1]?.length || 0;
  const lngDecimalPlaces = lng.split('.')[1]?.length || 0;
  
  return latDecimalPlaces >= 6 && lngDecimalPlaces >= 6;
};

export const validateRetailContext = (context: any, action: string): { valid: boolean; ERRORS: any } => {
  const errors: any = {};
  
  if (!context) {
    return { valid: false, ERRORS: { context: "Context is missing" } };
  }

  // Check required context fields
  const requiredFields = ['domain', 'action', 'version', 'message_id', 'transaction_id', 'bap_id', 'bpp_id', 'timestamp'];
  for (const field of requiredFields) {
    if (!context[field]) {
      errors[field] = `${field} is required in context`;
    }
  }

  // Validate action matches expected
  if (context.action && context.action !== action) {
    errors.action = `Action should be ${action}`;
  }

  // Validate domain format
  if (context.domain && !context.domain.startsWith('ONDC:RET')) {
    errors.domain = "Domain should start with 'ONDC:RET'";
  }

  return {
    valid: Object.keys(errors).length === 0,
    ERRORS: errors
  };
};

// Simple search validation
export const validateRetailSearch = async (
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<any> => {
  const errors: any = {};
  const data = element.jsonRequest;

  try {
    if (!data || isObjectEmpty(data)) {
      return { search: "JSON cannot be empty" };
    }

    const { message, context } = data;
    if (!message || !context || !message.intent || isObjectEmpty(message) || isObjectEmpty(message.intent)) {
      return { missingFields: "/context, /message, /intent or /message/intent is missing or empty" };
    }

    // Context validation
    const contextRes = validateRetailContext(context, "search");
    if (!contextRes.valid) {
      Object.assign(errors, contextRes.ERRORS);
    }

    // Validate BAP/BPP IDs are not URLs
    if (checkBppIdOrBapId(context.bap_id)) {
      errors.bap_id = "context/bap_id should not be a URL";
    }
    if (checkBppIdOrBapId(context.bpp_id)) {
      errors.bpp_id = "context/bpp_id should not be a URL";
    }

    // Validate intent structure
    if (message.intent.fulfillment?.end?.location?.gps) {
      if (!checkGpsPrecision(message.intent.fulfillment.end.location.gps)) {
        errors.gps_precision = "GPS coordinates must be specified with at least six decimal places of precision";
      }
    }

    // Validate buyer app finder fee
    if (message.intent.payment?.["@ondc/org/buyer_app_finder_fee_amount"]) {
      const buyerFF = parseFloat(message.intent.payment["@ondc/org/buyer_app_finder_fee_amount"]);
      if (isNaN(buyerFF)) {
        errors.buyer_finder_fee = "Invalid buyer app finder fee amount";
      }
    }

    // Validate item and category exclusivity
    if (message.intent.item && message.intent.category) {
      errors.intent_conflict = "/message/intent cannot have both properties item and category";
    }

    logger.info(`Search validation completed for session ${sessionID}`);
  } catch (error: any) {
    logger.error(`Error in search validation: ${error.message}`);
    errors.validation_error = error.message;
  }

  return errors;
};

// Simple on_search validation
export const validateRetailOnSearch = async (
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<any> => {
  const errors: any = {};
  const data = element.jsonRequest;

  try {
    if (!data || isObjectEmpty(data)) {
      return { on_search: "JSON cannot be empty" };
    }

    const { message, context } = data;
    if (!message || !context || !message.catalog || isObjectEmpty(message) || isObjectEmpty(message.catalog)) {
      return { missingFields: "/context, /message, /catalog or /message/catalog is missing or empty" };
    }

    // Context validation
    const contextRes = validateRetailContext(context, "on_search");
    if (!contextRes.valid) {
      Object.assign(errors, contextRes.ERRORS);
    }

    // Validate catalog structure
    const catalog = message.catalog;
    if (!catalog["bpp/providers"] || !Array.isArray(catalog["bpp/providers"]) || catalog["bpp/providers"].length === 0) {
      errors.providers = "Catalog should have at least one provider";
    } else {
      catalog["bpp/providers"].forEach((provider: any, providerIndex: number) => {
        if (!provider.id) {
          errors[`provider_${providerIndex}_id`] = "Provider ID is required";
        }

        if (!provider.descriptor?.name) {
          errors[`provider_${providerIndex}_name`] = "Provider name is required";
        }

        if (!provider.locations || !Array.isArray(provider.locations) || provider.locations.length === 0) {
          errors[`provider_${providerIndex}_locations`] = "Provider should have at least one location";
        }

        if (provider.items && Array.isArray(provider.items)) {
          provider.items.forEach((item: any, itemIndex: number) => {
            if (!item.id) {
              errors[`provider_${providerIndex}_item_${itemIndex}_id`] = "Item ID is required";
            }

            if (!item.price?.value) {
              errors[`provider_${providerIndex}_item_${itemIndex}_price`] = "Item price is required";
            }

            if (!item.category_id) {
              errors[`provider_${providerIndex}_item_${itemIndex}_category`] = "Item category is required";
            }
          });
        }
      });
    }

    logger.info(`On Search validation completed for session ${sessionID}`);
  } catch (error: any) {
    logger.error(`Error in on_search validation: ${error.message}`);
    errors.validation_error = error.message;
  }

  return errors;
};

// Generic order validation for select, init, confirm
export const validateRetailOrder = async (
  element: Payload,
  sessionID: string,
  flowId: string,
  action: string
): Promise<any> => {
  const errors: any = {};
  const data = element.jsonRequest;

  try {
    if (!data || isObjectEmpty(data)) {
      return { [action]: "JSON cannot be empty" };
    }

    const { message, context } = data;
    if (!message || !context || !message.order || isObjectEmpty(message) || isObjectEmpty(message.order)) {
      return { missingFields: "/context, /message, /order or /message/order is missing or empty" };
    }

    // Context validation
    const contextRes = validateRetailContext(context, action);
    if (!contextRes.valid) {
      Object.assign(errors, contextRes.ERRORS);
    }

    const order = message.order;

    // Validate provider
    if (!order.provider?.id) {
      errors.provider_id = "Provider ID is required";
    }

    // Validate items
    if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
      errors.items = "Items array is required and should not be empty";
    } else {
      order.items.forEach((item: any, index: number) => {
        if (!item.id) {
          errors[`items[${index}].id`] = "Item ID is required";
        }
        if (action !== 'on_search' && !item.quantity?.count) {
          errors[`items[${index}].quantity`] = "Item quantity is required";
        }
      });
    }

    // Validate fulfillments
    if (!order.fulfillments || !Array.isArray(order.fulfillments) || order.fulfillments.length === 0) {
      errors.fulfillments = "Fulfillments array is required and should not be empty";
    }

    // Action-specific validations
    if (action === 'confirm') {
      if (order.state !== "Created") {
        errors.order_state = "Order state should be 'Created' in confirm";
      }

      if (!order.created_at || !order.updated_at) {
        errors.order_timestamps = "Order created_at and updated_at are required in confirm";
      }

      if (order.payment && order.quote) {
        const paymentAmount = parseFloat(order.payment.params?.amount);
        const quoteAmount = parseFloat(order.quote.price?.value);
        
        if (Math.abs(paymentAmount - quoteAmount) > 0.01) {
          errors.payment_quote_mismatch = "Payment amount should match quote price";
        }
      }
    }

    logger.info(`${action} validation completed for session ${sessionID}`);
  } catch (error: any) {
    logger.error(`Error in ${action} validation: ${error.message}`);
    errors.validation_error = error.message;
  }

  return errors;
};

// Track validation
export const validateRetailTrack = async (
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<any> => {
  const errors: any = {};
  const data = element.jsonRequest;

  try {
    if (!data || isObjectEmpty(data)) {
      return { track: "JSON cannot be empty" };
    }

    const { message, context } = data;
    if (!message || !context || isObjectEmpty(message)) {
      return { missingFields: "/context, /message is missing or empty" };
    }

    // Context validation
    const contextRes = validateRetailContext(context, "track");
    if (!contextRes.valid) {
      Object.assign(errors, contextRes.ERRORS);
    }

    // Validate order_id in message
    if (!message.order_id) {
      errors.order_id = "Order ID is required in track message";
    }

    logger.info(`Track validation completed for session ${sessionID}`);
  } catch (error: any) {
    logger.error(`Error in track validation: ${error.message}`);
    errors.validation_error = error.message;
  }

  return errors;
};

// Status validation
export const validateRetailStatus = async (
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<any> => {
  const errors: any = {};
  const data = element.jsonRequest;

  try {
    if (!data || isObjectEmpty(data)) {
      return { status: "JSON cannot be empty" };
    }

    const { message, context } = data;
    if (!message || !context || isObjectEmpty(message)) {
      return { missingFields: "/context, /message is missing or empty" };
    }

    // Context validation
    const contextRes = validateRetailContext(context, "status");
    if (!contextRes.valid) {
      Object.assign(errors, contextRes.ERRORS);
    }

    // Validate order_id in message
    if (!message.order_id) {
      errors.order_id = "Order ID is required in status message";
    }

    logger.info(`Status validation completed for session ${sessionID}`);
  } catch (error: any) {
    logger.error(`Error in status validation: ${error.message}`);
    errors.validation_error = error.message;
  }

  return errors;
};

// Create retail validator factory
export const createRetailValidator = (
  validatorFunction: Function
) => {
  return async (
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> => {
    try {
      const validationResult = await validatorFunction(element, sessionID, flowId);
      
      if (validationResult && Object.keys(validationResult).length > 0) {
        return {
          response: {},
          passed: [],
          failed: Object.keys(validationResult).map(key => `${key}: ${validationResult[key]}`)
        };
      } else {
        return {
          response: {},
          passed: ["All validations passed"],
          failed: []
        };
      }
    } catch (error: any) {
      logger.error(`Retail validation error: ${error.message}`);
      return {
        response: {},
        passed: [],
        failed: [`Validation process failed: ${error.message}`]
      };
    }
  };
};