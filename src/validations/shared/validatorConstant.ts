export const validatorConstant = {
  beckn: {
    ondc: {
      context_timestamp: "context_timestamp",
      fis: {
        fis11: {
          v200: {
            intent: {
              validate_intent: "validateIntent",
            },
            payment: {
              validate_payment_collected_by: "validatePaymentCollectedBy",
            },
            tags: {
              validate_tags: "validateTags",
            },
            catalog: {
              validate_catalog: "validateCatalog",
            },
            providers: {
              validate_providers: "validateProviders",
            },
            items: {
              validate_items: "validateItems",
            },
            fulfillments: {
              validate_fulfillments: "validateFulfillments",
            },
            payments: {
              validate_payments: "validatePayments",
            },
            order: {
              validate_order: "validateOrder",
            },
            provider: {
              validate_provider: "validateProvider",
            },
            quote: {
              validate_quote: "validateQuote",
            },
            billing: {
              validate_billing: "validateBilling",
            },
            order_status: {
              validate_order_status: "validateOrderStatus",
            },
          },
        },
        fis12: {
          v202: {
            fulfillments: {
              validate_fulfillments: "validateFulfillmentsFIS12",
            },
            items: {
              validate_items: "validateItemsFIS12",
              validate_onsearch_items :"validateOnSearchItemsFIS12",
              validate_xinput: "validateXinputFIS12",
              select_validate_xinput:"validateXInputStatusFIS12",
              loan_info_oninit: "validateGoldLoanOnInitFIS12"
            },
            payments: {
              validate_payments: "validatePaymentsFIS12",
            },
            catalog:{
              providers:{
                categories: "validateCategoriesFIS12"
              }
            },
            tags: {
              validate_purchase_finance_bap_terms: "validatePurchaseFinanceBapTerms"
            },
            search: {
              validate_purchase_finance_search: "validatePurchaseFinanceSearch"
            },
            onsearch: {
              validate_purchase_finance_onsearch: "validatePurchaseFinanceOnSearch"
            },
            select: {
              validate_purchase_finance_select: "validatePurchaseFinanceSelect"
            },
            onselect: {
              validate_purchase_finance_onselect: "validatePurchaseFinanceOnSelect"
            },
            init: {
              validate_purchase_finance_init: "validatePurchaseFinanceInit"
            },
            oninit: {
              validate_purchase_finance_oninit: "validatePurchaseFinanceOnInit"
            },
            confirm: {
              validate_purchase_finance_confirm: "validatePurchaseFinanceConfirm"
            },
            onconfirm: {
              validate_purchase_finance_onconfirm: "validatePurchaseFinanceOnConfirm"
            },
            onupdate: {
              validate_purchase_finance_onupdate: "validatePurchaseFinanceOnUpdate"
            },
            onstatus: {
              validate_purchase_finance_onstatus: "validatePurchaseFinanceOnStatus"
            },
            oncancel: {
              validate_purchase_finance_oncancel: "validatePurchaseFinanceOnCancel"
            },
            documents: {
              validate_documents: "validateDocumentsFIS12"
            },
            update: {
              validate_update_payments: "validateUpdatePaymentsFIS12",
              validate_fulfillment_state: "validateFulfillmentStateOnUpdateFIS12"
            }
          },
        },
      },
      trv: {
        trv10: {
          v210: {
            intent: {
              validate_intent: "validateIntent",
            },
            payment: {
              validate_payment_collected_by: "validatePaymentCollectedBy",
            },
            tags: {
              validate_tags: "validateTags",
            },
            fulfillment_stops: {
              validate_fulfillment_stops: "validateFulfillmentStops",
            },
            fulfillment_stops_catalog: {
              validate_fulfillment_stops_catalog: "validateFulfillmentStopsInCatalog",
            },
            fulfillment_stops_order: {
              validate_fulfillment_stops_order: "validateFulfillmentStopsInOrder",
            },
            catalog: {
              validate_catalog: "validateCatalog",
            },
            providers: {
              validate_providers: "validateProviders",
            },
            providers_trv10: {
              validate_providers_trv10: "validateProvidersTRV10",
            },
            items: {
              validate_items: "validateItems",
            },
            items_trv10: {
              validate_items_trv10: "validateItemsTRV10",
            },
            fulfillments: {
              validate_fulfillments: "validateFulfillments",
            },
            fulfillments_trv10: {
              validate_fulfillments_trv10: "validateFulfillmentsTRV10",
            },
            payments: {
              validate_payments: "validatePayments",
            },
            order: {
              validate_order: "validateOrder",
            },
            provider: {
              validate_provider: "validateProvider",
            },
            provider_trv10: {
              validate_provider_trv10: "validateProviderTRV10",
            },
            quote: {
              validate_quote: "validateQuote",
            },
            quote_trv10: {
              validate_quote_trv10: "validateQuoteTRV10",
            },
            billing: {
              validate_billing: "validateBilling",
            },
            billing_trv10: {
              validate_billing_trv10: "validateBillingTRV10",
            },
            payments_trv10: {
              validate_payments_trv10: "validatePaymentsTRV10",
            },
            order_status: {
              validate_order_status: "validateOrderStatus",
            },
            update_request_trv10: {
              validate_update_request_trv10: "validateUpdateRequestTRV10",
            },
          },
        },
      },
      log: {
        v125: {
          holidays: {
            validate_holidays: "validateHolidays",
          },
          lbnp: {
            validate_lbnp: "validateLBNP",
          },
          prepaid_payment: {
            validate_prepaid_payment: "validatePrepaidPayment",
          },
          cod: {
            validate_cod: "validateCOD",
          },
          tat: {
            validate_tat: "validateTAT",
          },
          lsp: {
            validate_lsp: "validateLSP",
          },
          shipment_types: {
            validate_shipment_types: "validateShipmentTypes",
          },
          sla_metrics:{
            validate_sla_metrics: "validateSlaMetrics"
          },
          tax_type_rcm:{
            validate_np_tax_type_rcm: "validateNpTaxTypeRCM"
          },
          codified_static_terms:{
            validate_codified_static_terms: "validateCodifiedStaticTerms"
          },
          exchange_customer_contact_details:{
            validate_customer_contact_details:"validateCustomerContactDetails"
          },
          public_special_capabilities:{
            validate_public_special_capabilities:"validatePublicSpecialCapabilities"
          },
          seller_creds:{
            validate_seller_creds:"validateSellerCreds"
          },
          e_pod:{
            validate_e_pod:"validateEPOD"
          },
          awb_shipping_label:{
            validate_awb_shipping_label:"validateAWB_Shipping_Label"
          }
        },
      },
    },
  },
};
