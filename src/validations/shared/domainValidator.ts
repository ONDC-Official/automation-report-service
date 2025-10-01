import { createConfirmValidator, createInitValidator, createOnConfirmValidator, createOnInitValidator, createOnSearchValidator, createOnSelectValidator, createSearchValidator, createSelectValidator } from "./validationFactory";
import { validatorConstant } from "./validatorConstant";

/**
 * Pre-configured validators for common domain patterns
 */
const fis11Validators = validatorConstant.beckn.ondc.fis.fis11.v200;
const log11Validators = validatorConstant.beckn.ondc.log.v125;


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
     log11Validators.validate_holidays,
      log11Validators.validate_lbnp,
      log11Validators.validate_prepaid_payment,
      log11Validators.validate_cod
    ),
  
  
     ondclogOnSearch: createOnSearchValidator(
      log11Validators.validate_lsp,
      log11Validators.validate_tat, 
      log11Validators.validate_shipment_types
    ),
  
   
    nic2004Search: createSearchValidator(log11Validators.validate_holidays),
  
    
    ondclogSelect: createSelectValidator(
      log11Validators.validate_holidays,
      log11Validators.validate_lbnp,
      log11Validators.validate_prepaid_payment,
      log11Validators.validate_cod
    ),
  
    /**
     * ONDC LOG10/LOG11 on_select validator with comprehensive validations
     */
    ondclogOnSelect: createOnSelectValidator(
      log11Validators.validate_lsp,
      log11Validators.validate_tat,
      log11Validators.validate_shipment_types
    ),
  
    /**
     * ONDC LOG10/LOG11 init validator with all validations
     */
    ondclogInit: createInitValidator(
      log11Validators.validate_holidays,
      log11Validators.validate_lbnp,
      log11Validators.validate_prepaid_payment,
      log11Validators.validate_cod
    ),
  
    /**
     * ONDC LOG10/LOG11 on_init validator with comprehensive validations
     */
    ondclogOnInit: createOnInitValidator(
      log11Validators.validate_lsp,
      log11Validators.validate_tat,
      log11Validators.validate_shipment_types
    ),
  
    ondclogConfirm: createConfirmValidator(
      log11Validators.validate_holidays,
      log11Validators.validate_lbnp,
      log11Validators.validate_prepaid_payment,
    ),
  
    ondclogOnConfirm: createOnConfirmValidator(
      log11Validators.validate_lsp,
      log11Validators.validate_tat, 
      log11Validators.validate_shipment_types

    )
  };