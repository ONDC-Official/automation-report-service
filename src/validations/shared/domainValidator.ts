
import { 
  createConfirmValidator, 
  createInitValidator, 
  createOnConfirmValidator, 
  createOnInitValidator, 
  createOnSearchValidator, 
  createOnSelectValidator, 
  createSearchValidator, 
  createSelectValidator 
} from "./validationFactory";
import { validatorConstant } from "./validatorConstant";

/**
 * Pre-configured validators for common domain patterns
 */
const fis11Validators = validatorConstant.beckn.ondc.fis.fis11.v200;
const log11Validators = validatorConstant.beckn.ondc.log.v125;

export const DomainValidators = {
    fis11Search: createSearchValidator(
      fis11Validators.intent.validate_intent,
      fis11Validators.payment.validate_payment_collected_by,
      fis11Validators.tags.validate_tags,
    ),
  
    fis11OnSearch: createOnSearchValidator(
      fis11Validators.catalog.validate_catalog,
      fis11Validators.providers.validate_providers,
      fis11Validators.items.validate_items,
      fis11Validators.fulfillments.validate_fulfillments,
      fis11Validators.payments.validate_payments,
    ),
  
    fis11Select: createSelectValidator(
      fis11Validators.order.validate_order,
      fis11Validators.provider.validate_provider,
      fis11Validators.items.validate_items,
      fis11Validators.fulfillments.validate_fulfillments
    ),
  
    fis11OnSelect: createOnSelectValidator(
      fis11Validators.order.validate_order,
      fis11Validators.quote.validate_quote,
      fis11Validators.provider.validate_provider,
      fis11Validators.items.validate_items,
      fis11Validators.fulfillments.validate_fulfillments,
    ),
  
    fis11Init: createInitValidator(
      fis11Validators.order.validate_order,
      fis11Validators.provider.validate_provider,
      fis11Validators.items.validate_items,
      fis11Validators.fulfillments.validate_fulfillments,
      fis11Validators.payments.validate_payments,
      fis11Validators.billing.validate_billing
    ),
  
    fis11OnInit: createOnInitValidator(
      fis11Validators.order.validate_order,
      fis11Validators.quote.validate_quote,
      fis11Validators.provider.validate_provider,
      fis11Validators.items.validate_items,
      fis11Validators.fulfillments.validate_fulfillments,
      fis11Validators.payments.validate_payments,
      fis11Validators.billing.validate_billing
    ),
  
    fis11Confirm: createConfirmValidator(
      fis11Validators.order.validate_order,
      fis11Validators.quote.validate_quote,
      fis11Validators.provider.validate_provider,
      fis11Validators.items.validate_items,
      fis11Validators.fulfillments.validate_fulfillments,
      fis11Validators.payments.validate_payments,
      fis11Validators.billing.validate_billing
    ),
  
    fis11OnConfirm: createOnConfirmValidator(
      fis11Validators.order.validate_order,
      fis11Validators.quote.validate_quote,
      fis11Validators.provider.validate_provider,
      fis11Validators.items.validate_items,
      fis11Validators.fulfillments.validate_fulfillments,
      fis11Validators.payments.validate_payments,
      fis11Validators.billing.validate_billing,
      fis11Validators.order_status.validate_order_status
    ),

    fis11OnConfirmSuccess: createOnConfirmValidator(
      fis11Validators.order.validate_order,
      fis11Validators.quote.validate_quote,
      fis11Validators.provider.validate_provider,
      fis11Validators.items.validate_items,
      fis11Validators.fulfillments.validate_fulfillments,
      fis11Validators.billing.validate_billing,
      fis11Validators.order_status.validate_order_status
    ),
  
    ondclogSearch: createSearchValidator(
     log11Validators.holidays.validate_holidays,
      log11Validators.lbnp.validate_lbnp,
      log11Validators.prepaid_payment.validate_prepaid_payment,
      log11Validators.cod.validate_cod
    ),
  
  
     ondclogOnSearch: createOnSearchValidator(
      log11Validators.lsp.validate_lsp,
      log11Validators.tat.validate_tat, 
      log11Validators.shipment_types.validate_shipment_types
    ),
  
   
    nic2004Search: createSearchValidator(log11Validators.holidays.validate_holidays),
  
    
    ondclogSelect: createSelectValidator(
      log11Validators.holidays.validate_holidays,
      log11Validators.lbnp.validate_lbnp,
      log11Validators.prepaid_payment.validate_prepaid_payment,
      log11Validators.cod.validate_cod
    ),
  
    /**
     * ONDC LOG10/LOG11 on_select validator with comprehensive validations
     */
    ondclogOnSelect: createOnSelectValidator(
      log11Validators.lsp.validate_lsp,
      log11Validators.tat.validate_tat,
      log11Validators.shipment_types.validate_shipment_types
    ),
  
    /**
     * ONDC LOG10/LOG11 init validator with all validations
     */
    ondclogInit: createInitValidator(
      log11Validators.holidays.validate_holidays,
      log11Validators.lbnp.validate_lbnp,
      log11Validators.prepaid_payment.validate_prepaid_payment,
      log11Validators.cod.validate_cod
    ),
  
    /**
     * ONDC LOG10/LOG11 on_init validator with comprehensive validations
     */
    ondclogOnInit: createOnInitValidator(
      log11Validators.lsp.validate_lsp,
      log11Validators.tat.validate_tat,
      log11Validators.shipment_types.validate_shipment_types
    ),
  
    ondclogConfirm: createConfirmValidator(
      log11Validators.holidays.validate_holidays,
      log11Validators.lbnp.validate_lbnp,
      log11Validators.prepaid_payment.validate_prepaid_payment,
    ),
  
    ondclogOnConfirm: createOnConfirmValidator(
      log11Validators.lsp.validate_lsp,
      log11Validators.tat.validate_tat, 
      log11Validators.shipment_types.validate_shipment_types

    )
  };