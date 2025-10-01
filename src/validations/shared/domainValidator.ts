import { createConfirmValidator, createInitValidator, createOnConfirmValidator, createOnInitValidator, createOnSearchValidator, createOnSelectValidator, createSearchValidator, createSelectValidator } from "./validationFactory";
import { validatorConstant } from "./validatorConstant";

/**
 * Pre-configured validators for common domain patterns
 */
const fis11Validators = validatorConstant.beckn.ondc.fis.fis11.v200;

export const DomainValidators = {
    fis11Search: createSearchValidator(
      fis11Validators.validate_intent,
      fis11Validators.validate_payment_collected_by,
      fis11Validators.validate_tags,
    ),
  
    fis11OnSearch: createOnSearchValidator(
      fis11Validators.validate_catalog,
      fis11Validators.validate_providers,
      fis11Validators.validate_items,
      fis11Validators.validate_fulfillments,
      fis11Validators.validate_payments,
    ),
  
    fis11Select: createSelectValidator(
      fis11Validators.validate_order,
      fis11Validators.validate_provider,
      fis11Validators.validate_items,
      fis11Validators.validate_fulfillments
    ),
  
    fis11OnSelect: createOnSelectValidator(
      fis11Validators.validate_order,
      fis11Validators.validate_quote,
      fis11Validators.validate_provider,
      fis11Validators.validate_items,
      fis11Validators.validate_fulfillments,
    ),
  
    fis11Init: createInitValidator(
      fis11Validators.validate_order,
      fis11Validators.validate_provider,
      fis11Validators.validate_items,
      fis11Validators.validate_fulfillments,
      fis11Validators.validate_payments,
      fis11Validators.validate_billing
    ),
  
    fis11OnInit: createOnInitValidator(
      fis11Validators.validate_order,
      fis11Validators.validate_quote,
      fis11Validators.validate_provider,
      fis11Validators.validate_items,
      fis11Validators.validate_fulfillments,
      fis11Validators.validate_payments,
      fis11Validators.validate_billing
    ),
  
    fis11Confirm: createConfirmValidator(
      fis11Validators.validate_order,
      fis11Validators.validate_quote,
      fis11Validators.validate_provider,
      fis11Validators.validate_items,
      fis11Validators.validate_fulfillments,
      fis11Validators.validate_payments,
      fis11Validators.validate_billing
    ),
  
    fis11OnConfirm: createOnConfirmValidator(
      fis11Validators.validate_order,
      fis11Validators.validate_quote,
      fis11Validators.validate_provider,
      fis11Validators.validate_items,
      fis11Validators.validate_fulfillments,
      fis11Validators.validate_payments,
      fis11Validators.validate_billing,
      fis11Validators.validate_order_status
    ),
  
    ondclogSearch: createSearchValidator(
      "validateHolidays",
      "validateLBNP",
      "validatePrepaidPayment",
      "validateCOD"
    ),
  
  
     ondclogOnSearch: createOnSearchValidator(
      "validateLSP",
      "validateTAT", 
      "validateShipmentTypes"
    ),
  
   
    nic2004Search: createSearchValidator("validateHolidays"),
  
    
    ondclogSelect: createSelectValidator(
      "validateHolidays",
      "validateLBNP",
      "validatePrepaidPayment",
      "validateCOD"
    ),
  
    /**
     * ONDC LOG10/LOG11 on_select validator with comprehensive validations
     */
    ondclogOnSelect: createOnSelectValidator(
      "validateLSP",
      "validateTAT",
      "validateShipmentTypes"
    ),
  
    /**
     * ONDC LOG10/LOG11 init validator with all validations
     */
    ondclogInit: createInitValidator(
      "validateHolidays",
      "validateLBNP",
      "validatePrepaidPayment",
      "validateCOD"
    ),
  
    /**
     * ONDC LOG10/LOG11 on_init validator with comprehensive validations
     */
    ondclogOnInit: createOnInitValidator(
      "validateLSP",
      "validateTAT",
      "validateShipmentTypes"
    ),
  
    // /**
    //  * ONDC LOG10/LOG11 confirm validator with all validations
    //  */
    // ondclogConfirm: createConfirmValidator({
    //   validateHolidays: true,
    //   validateLBNP: true,
    //   validatePrepaidPayment: true,
    //   validateCOD: true,
    // }),
  
    // /**
    //  * ONDC LOG10/LOG11 on_confirm validator with comprehensive validations
    //  */
    // ondclogOnConfirm: createOnConfirmValidator({
    //   validateLSP: true,
    //   validateTAT: true,
    //   validateShipmentTypes: true,
    // }),
  
    // /**
    //  * Generic OnSearch validator with basic validations
    //  */
    // genericOnSearch: createOnSearchValidator({
    //   validateLSP: true,
    // }),
  
    // /**
    //  * Generic validator for actions that don't need specific validations
    //  */
    // generic: createGenericValidator("generic"),
  
    /**
     * Universal validators - can be used across all domains with different parameter configurations
     */
    
    ondclogConfirm: createConfirmValidator(
      "validateHolidays",
      "validateLBNP",
      "validatePrepaidPayment",
    ),
  
    ondclogOnConfirm: createOnConfirmValidator(
      "validateLSP",
      "validateTAT",
      "validateShipmentTypes",
    )
  };