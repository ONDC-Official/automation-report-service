import {
  createConfirmValidator,
  createInitValidator,
  createUpdateValidator,
  createOnCancelValidator,
  createOnConfirmValidator,
  createOnInitValidator,
  createOnSearchValidator,
  createOnSelectValidator,
  createOnStatusValidator,
  createOnUpdateValidator,
  createSearchValidator,
  createSelectValidator,
} from "./validationFactory";
import { validatorConstant } from "./validatorConstant";

/**
 * Pre-configured validators for common domain patterns
 */
const fis11Validators = validatorConstant.beckn.ondc.fis.fis11.v200;
const fis12Validators = validatorConstant.beckn.ondc.fis.fis12.v202;
const logValidators = validatorConstant.beckn.ondc.log.v125;
const trv10Validators = validatorConstant.beckn.ondc.trv.trv10.v210;

export const DomainValidators = {
  fis11Search: createSearchValidator(
    fis11Validators.intent.validate_intent,
    fis11Validators.payment.validate_payment_collected_by,
    fis11Validators.tags.validate_tags
  ),

  fis11OnSearch: createOnSearchValidator(
    fis11Validators.catalog.validate_catalog,
    fis11Validators.providers.validate_providers,
    fis11Validators.items.validate_items,
    fis11Validators.fulfillments.validate_fulfillments,
    fis11Validators.payments.validate_payments
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
    fis11Validators.fulfillments.validate_fulfillments
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
    logValidators.public_special_capabilities
      .validate_public_special_capabilities
  ),

  nic2004Search: createSearchValidator(
    logValidators.holidays.validate_holidays
  ),

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
    logValidators.exchange_customer_contact_details
      .validate_customer_contact_details,
    logValidators.seller_creds.validate_seller_creds
  ),

  ondclogOnConfirm: createOnConfirmValidator(
    logValidators.lsp.validate_lsp,
    logValidators.tat.validate_tat,
    logValidators.shipment_types.validate_shipment_types,
    logValidators.sla_metrics.validate_sla_metrics,
    logValidators.tax_type_rcm.validate_np_tax_type_rcm,
    logValidators.codified_static_terms.validate_codified_static_terms,
    logValidators.exchange_customer_contact_details
      .validate_customer_contact_details
  ),

  /**
   * TRV10 validators - reuse the same validation functions as FIS11
   * since TRV10 and FIS11 share similar structures
   */
  trv10Search: createSearchValidator(
    trv10Validators.intent.validate_intent,
    trv10Validators.payment.validate_payment_collected_by,
    trv10Validators.tags.validate_tags,
    trv10Validators.fulfillment_stops.validate_fulfillment_stops
  ),

  trv10OnSearch: createOnSearchValidator(
    trv10Validators.catalog.validate_catalog,
    trv10Validators.providers_trv10.validate_providers_trv10,
    trv10Validators.items.validate_items,
    trv10Validators.fulfillments.validate_fulfillments,
    trv10Validators.payments.validate_payments,
    trv10Validators.fulfillment_stops_catalog.validate_fulfillment_stops_catalog
  ),

  trv10Select: createSelectValidator(
    trv10Validators.order.validate_order,
    trv10Validators.providers_trv10.validate_providers_trv10,
    trv10Validators.items_trv10.validate_items_trv10,
    trv10Validators.fulfillments_trv10.validate_fulfillments_trv10
  ),

  trv10OnSelect: createOnSelectValidator(
    trv10Validators.order.validate_order,
    trv10Validators.quote_trv10.validate_quote_trv10,
    trv10Validators.provider_trv10.validate_provider_trv10,
    trv10Validators.items.validate_items,
    trv10Validators.fulfillments.validate_fulfillments,
    trv10Validators.fulfillment_stops_order.validate_fulfillment_stops_order
  ),

  trv10Init: createInitValidator(
    trv10Validators.order.validate_order,
    trv10Validators.provider_trv10.validate_provider_trv10,
    trv10Validators.items_trv10.validate_items_trv10,
    trv10Validators.fulfillments_trv10.validate_fulfillments_trv10,
    trv10Validators.payments_trv10.validate_payments_trv10,
    trv10Validators.billing_trv10.validate_billing_trv10,
    trv10Validators.fulfillment_stops_order.validate_fulfillment_stops_order
  ),

  trv10OnInit: createOnInitValidator(
    trv10Validators.order.validate_order,
    trv10Validators.quote_trv10.validate_quote_trv10,
    trv10Validators.provider_trv10.validate_provider_trv10,
    trv10Validators.items.validate_items,
    trv10Validators.fulfillments.validate_fulfillments,
    trv10Validators.payments_trv10.validate_payments_trv10,
    trv10Validators.billing_trv10.validate_billing_trv10,
    trv10Validators.fulfillment_stops_order.validate_fulfillment_stops_order
  ),

  trv10Confirm: createConfirmValidator(
    trv10Validators.order.validate_order,
    trv10Validators.quote_trv10.validate_quote_trv10,
    trv10Validators.provider_trv10.validate_provider_trv10,
    trv10Validators.items_trv10.validate_items_trv10,
    trv10Validators.fulfillments.validate_fulfillments,
    trv10Validators.payments_trv10.validate_payments_trv10,
    trv10Validators.billing_trv10.validate_billing_trv10
  ),

  trv10OnConfirm: createOnConfirmValidator(
    trv10Validators.order.validate_order,
    trv10Validators.quote_trv10.validate_quote_trv10,
    trv10Validators.provider_trv10.validate_provider_trv10,
    trv10Validators.items.validate_items,
    trv10Validators.fulfillments.validate_fulfillments,
    trv10Validators.payments_trv10.validate_payments_trv10,
    trv10Validators.billing_trv10.validate_billing_trv10,
    trv10Validators.order_status.validate_order_status
  ),

  trv10OnStatus: createOnStatusValidator(
    trv10Validators.order.validate_order,
    trv10Validators.quote_trv10.validate_quote_trv10,
    trv10Validators.provider_trv10.validate_provider_trv10,
    trv10Validators.items.validate_items,
    trv10Validators.fulfillments.validate_fulfillments,
    trv10Validators.payments_trv10.validate_payments_trv10,
    trv10Validators.billing_trv10.validate_billing_trv10,
    trv10Validators.order_status.validate_order_status,
    trv10Validators.fulfillment_stops_order.validate_fulfillment_stops_order
  ),

  trv10OnUpdate: createOnUpdateValidator(
    trv10Validators.order.validate_order,
    trv10Validators.quote_trv10.validate_quote_trv10,
    trv10Validators.provider_trv10.validate_provider_trv10,
    trv10Validators.items.validate_items,
    trv10Validators.fulfillments.validate_fulfillments,
    trv10Validators.payments_trv10.validate_payments_trv10,
    trv10Validators.billing_trv10.validate_billing_trv10,
    trv10Validators.order_status.validate_order_status,
    trv10Validators.fulfillment_stops_order.validate_fulfillment_stops_order
  ),

  trv10OnCancel: createOnCancelValidator(
    trv10Validators.order.validate_order,
    trv10Validators.quote_trv10.validate_quote_trv10,
    trv10Validators.provider_trv10.validate_provider_trv10,
    trv10Validators.items.validate_items,
    trv10Validators.fulfillments.validate_fulfillments,
    trv10Validators.payments_trv10.validate_payments_trv10,
    trv10Validators.billing_trv10.validate_billing_trv10,
    trv10Validators.order_status.validate_order_status,
    trv10Validators.fulfillment_stops_order.validate_fulfillment_stops_order
  ),

  trv10Update: createUpdateValidator(
    trv10Validators.update_request_trv10.validate_update_request_trv10,
    trv10Validators.fulfillment_stops_order.validate_fulfillment_stops_order,
    trv10Validators.fulfillments_trv10.validate_fulfillments_trv10,
  ),

  fis12Search: createSearchValidator(
    fis11Validators.intent.validate_intent,
    fis11Validators.payment.validate_payment_collected_by,
    fis11Validators.tags.validate_tags
  ),

  fis12OnSearch: createOnSearchValidator(
    fis11Validators.catalog.validate_catalog,
    fis11Validators.providers.validate_providers,
    fis12Validators.items.validate_onsearch_items,
    fis11Validators.payments.validate_payments,
    fis12Validators.catalog.providers.categories,
    fis12Validators.items.validate_xinput
  ),

  fis12Select: createSelectValidator(
    fis11Validators.order.validate_order,
    fis11Validators.provider.validate_provider,
    fis11Validators.items.validate_items,
    fis12Validators.items.select_validate_xinput
  ),

  fis12OnSelect: createOnSelectValidator(
    trv10Validators.order.validate_order,
    trv10Validators.quote_trv10.validate_quote_trv10,
    trv10Validators.provider_trv10.validate_provider_trv10,
    fis11Validators.items.validate_items,
    fis12Validators.items.validate_xinput
  ),
  fis12Init: createInitValidator(
    fis11Validators.order.validate_order,
    fis11Validators.provider.validate_provider,
    fis11Validators.items.validate_items,
    fis12Validators.payments.validate_payments,
    fis12Validators.items.select_validate_xinput
  ),

  fis12OnInit: createOnInitValidator(
    fis11Validators.order.validate_order,
    fis11Validators.quote.validate_quote,
    fis11Validators.provider.validate_provider,
    fis11Validators.items.validate_items,
    fis12Validators.fulfillments.validate_fulfillments,
    fis12Validators.payments.validate_payments,
    fis12Validators.items.loan_info_oninit
  ),

  fis12Confirm: createConfirmValidator(
    fis11Validators.order.validate_order,
    fis11Validators.quote.validate_quote,
    fis11Validators.provider.validate_provider,
    fis12Validators.payments.validate_payments,
  ),

  fis12OnConfirm: createOnConfirmValidator(
    fis11Validators.order.validate_order,
    fis11Validators.quote.validate_quote,
    fis11Validators.provider.validate_provider,
    fis11Validators.items.validate_items,
    fis12Validators.fulfillments.validate_fulfillments,
    fis12Validators.payments.validate_payments,
    fis11Validators.order_status.validate_order_status,
    fis12Validators.documents.validate_documents
  ),

  fis12OnStatus: createOnStatusValidator(
    fis11Validators.order.validate_order,
    fis11Validators.quote.validate_quote,
    fis11Validators.provider.validate_provider,
    fis11Validators.items.validate_items,
    fis12Validators.fulfillments.validate_fulfillments,
    fis11Validators.order_status.validate_order_status
  ),

  fis12Update: createUpdateValidator(
    trv10Validators.update_request_trv10.validate_update_request_trv10,
    fis12Validators.update.validate_update_payments,
  ),

  fis12OnUpdate: createOnUpdateValidator(
    trv10Validators.order.validate_order,
    trv10Validators.quote_trv10.validate_quote_trv10,
    trv10Validators.provider_trv10.validate_provider_trv10,
    trv10Validators.items.validate_items,
    fis12Validators.fulfillments.validate_fulfillments,
    fis12Validators.payments.validate_payments,
    fis12Validators.documents.validate_documents,
    fis12Validators.update.validate_fulfillment_state,
  ),
};
