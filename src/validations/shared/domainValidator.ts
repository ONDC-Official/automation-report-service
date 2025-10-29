
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
const logValidators = validatorConstant.beckn.ondc.log.v125;

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
      logValidators.holidays.validate_holidays,
      logValidators.lbnp.validate_lbnp,
      logValidators.prepaid_payment.validate_prepaid_payment,
      logValidators.cod.validate_cod,
      logValidators.sla_metrics.validate_sla_metrics
    ),

  
  
     ondclogOnSearch: createOnSearchValidator(
      logValidators.lsp.validate_lsp,
      logValidators.tat.validate_tat, 
      logValidators.shipment_types.validate_shipment_types,
      logValidators.cod.validate_cod,
      logValidators.tax_type_rcm.validate_np_tax_type_rcm,
      logValidators.codified_static_terms.validate_codified_static_terms,
      logValidators.public_special_capabilities.validate_public_special_capabilities
    ),
  
   
    nic2004Search: createSearchValidator(logValidators.holidays.validate_holidays),
  
    
    ondclogSelect: createSelectValidator(
      logValidators.holidays.validate_holidays,
      logValidators.lbnp.validate_lbnp,
      logValidators.prepaid_payment.validate_prepaid_payment,
      logValidators.cod.validate_cod
    ),
  
    /**
     * ONDC LOG10/LOG11 on_select validator with comprehensive validations
     */
    ondclogOnSelect: createOnSelectValidator(
      logValidators.lsp.validate_lsp,
      logValidators.tat.validate_tat,
      logValidators.shipment_types.validate_shipment_types
    ),
  
    /**
     * ONDC LOG10/LOG11 init validator with all validations
     */
    ondclogInit: createInitValidator(
      logValidators.holidays.validate_holidays,
      logValidators.lbnp.validate_lbnp,
      logValidators.prepaid_payment.validate_prepaid_payment,
      logValidators.cod.validate_cod
    ),
  
    /**
     * ONDC LOG10/LOG11 on_init validator with comprehensive validations
     */
    ondclogOnInit: createOnInitValidator(
      logValidators.lsp.validate_lsp,
      logValidators.tat.validate_tat,
      logValidators.shipment_types.validate_shipment_types
    ),
  
    ondclogConfirm: createConfirmValidator(
      logValidators.holidays.validate_holidays,
      logValidators.lbnp.validate_lbnp,
      logValidators.prepaid_payment.validate_prepaid_payment,
      logValidators.sla_metrics.validate_sla_metrics,
      logValidators.exchange_customer_contact_details.validate_customer_contact_details,
      logValidators.seller_creds.validate_seller_creds
    ),
  
    ondclogOnConfirm: createOnConfirmValidator(
      logValidators.lsp.validate_lsp,
      logValidators.tat.validate_tat, 
      logValidators.shipment_types.validate_shipment_types,
      logValidators.sla_metrics.validate_sla_metrics,
      logValidators.tax_type_rcm.validate_np_tax_type_rcm,
      logValidators.codified_static_terms.validate_codified_static_terms,
      logValidators.exchange_customer_contact_details.validate_customer_contact_details,
    )
  };