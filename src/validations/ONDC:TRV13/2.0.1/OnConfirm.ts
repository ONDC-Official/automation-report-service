import { TestResult, Payload } from "../../../types/payload";
import { validateOrderQuote } from "../../shared/quoteValidations";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) result.response = jsonResponse.response;

  try {
    const context = jsonRequest?.context;
    const message = jsonRequest?.message;
    const order = message?.order;

    // Validate domain
    if (context?.domain === "ONDC:TRV13") {
      result.passed.push("Domain is ONDC:TRV13");
    } else {
      result.failed.push(`Invalid domain: expected ONDC:TRV13, got ${context?.domain}`);
    }

    // Validate action
    if (context?.action === "on_confirm") {
      result.passed.push("Action is on_confirm");
    } else {
      result.failed.push(`Invalid action: expected on_confirm, got ${context?.action}`);
    }

    // Validate order ID
    if (order?.id) {
      result.passed.push(`Order ID: ${order.id}`);
    } else {
      result.failed.push("Order ID is missing");
    }

    // Validate order state
    if (order?.state) {
      const validStates = ["ACTIVE", "COMPLETE", "CANCELLED"];
      if (validStates.includes(order.state)) {
        result.passed.push(`Order state: ${order.state}`);
      } else {
        result.failed.push(`Invalid order state: ${order.state}`);
      }
    }

    // Validate provider
    if (order?.provider?.id) {
      result.passed.push(`Provider ID: ${order.provider.id}`);
    }

    // Validate items
    const items = order?.items;
    if (items && Array.isArray(items) && items.length > 0) {
      result.passed.push(`${items.length} item(s) confirmed`);
    }

    // Validate quote
    const quote = order?.quote;
    if (quote?.price?.value) {
      result.passed.push(`Total quote: ${quote.price.currency} ${quote.price.value}`);
    }

    // Validate fulfillments
    const fulfillments = order?.fulfillments;
    if (fulfillments && Array.isArray(fulfillments) && fulfillments.length > 0) {
      const fulfillment = fulfillments[0];
      if (fulfillment?.id) {
        result.passed.push(`Fulfillment ID: ${fulfillment.id}`);
      }
      if (fulfillment?.state?.descriptor?.code) {
        result.passed.push(`Fulfillment state: ${fulfillment.state.descriptor.code}`);
      }
    }

    // Validate payments
    const payments = order?.payments;
    if (payments && Array.isArray(payments) && payments.length > 0) {
      const validStatuses = ["PAID", "NOT-PAID"];
      const paymentStatuses: string[] = [];
      let totalPaymentAmount = 0;
      
      for (const payment of payments) {
        if (payment?.status) {
          // Validate status is valid
          if (validStatuses.includes(payment.status)) {
            result.passed.push(`Payment ${payment.type || 'unknown'} status: ${payment.status}`);
            paymentStatuses.push(payment.status);
          } else {
            result.failed.push(`Invalid payment status: ${payment.status}. Must be PAID or NOT-PAID`);
          }
          
          // Validate payment type consistency with status
          if (payment.type === "PRE-ORDER" && payment.status === "NOT-PAID") {
            result.failed.push(`PRE-ORDER payment should be PAID in on_confirm, found NOT-PAID`);
          }
        } else {
          result.failed.push(`Payment status is missing for payment type: ${payment.type || 'unknown'}`);
        }
        
        // Validate payment.params
        const params = payment?.params;
        if (!params) {
          result.failed.push(`Payment params missing for payment type: ${payment.type || 'unknown'}`);
          continue;
        }
        
        // Validate params.amount
        if (!params.amount) {
          result.failed.push(`Payment params.amount missing for ${payment.type || 'unknown'} payment`);
        } else {
          const amount = parseFloat(params.amount);
          if (isNaN(amount) || amount <= 0) {
            result.failed.push(`Invalid payment amount: ${params.amount}. Must be a positive number`);
          } else {
            result.passed.push(`Payment ${payment.type} amount: ${params.currency || ''} ${params.amount}`);
            totalPaymentAmount += amount;
          }
        }
        
        // Validate params.currency
        if (!params.currency) {
          result.failed.push(`Payment params.currency missing for ${payment.type || 'unknown'} payment`);
        } else if (quote?.price?.currency && params.currency !== quote.price.currency) {
          result.failed.push(
            `Payment currency mismatch: expected ${quote.price.currency}, found ${params.currency}`
          );
        } else {
          result.passed.push(`Payment currency: ${params.currency}`);
        }
        
        // Validate transaction_id for PAID payments
        if (payment.status === "PAID") {
          if (!params.transaction_id) {
            result.failed.push(`Transaction ID missing for PAID ${payment.type || 'unknown'} payment`);
          } else {
            result.passed.push(`Transaction ID present for PAID payment: ${params.transaction_id}`);
          }
        }
      }
      
      // Check for conflicting statuses (unless split payment)
      const hasPaid = paymentStatuses.includes("PAID");
      const hasNotPaid = paymentStatuses.includes("NOT-PAID");
      
      if (hasPaid && hasNotPaid && payments.length === 1) {
        result.failed.push(
          `Inconsistent payment status: Single payment cannot be both PAID and NOT-PAID`
        );
      } else if (hasPaid && hasNotPaid && payments.length > 1) {
        // Split payment scenario - validate it's intentional
        result.passed.push(
          `Split payment detected: ${paymentStatuses.filter(s => s === "PAID").length} PAID, ${paymentStatuses.filter(s => s === "NOT-PAID").length} NOT-PAID`
        );
      }
      
      // Validate total payment amount matches quote
      if (quote?.price?.value) {
        const quoteTotal = parseFloat(quote.price.value);
        if (!isNaN(quoteTotal)) {
          const paidPayments = payments.filter(p => p.status === "PAID");
          
          if (paidPayments.length === 1 && payments.length === 1) {
            // Single full payment
            if (Math.abs(totalPaymentAmount - quoteTotal) > 0.01) {
              result.failed.push(
                `Payment amount mismatch: quote total ${quoteTotal}, payment amount ${totalPaymentAmount.toFixed(2)}`
              );
            } else {
              result.passed.push(`Payment amount matches quote total: ${quoteTotal}`);
            }
          } else if (payments.length > 1) {
            // Split payment — validate sum of payment amounts equals quote total
            const paymentsWithAmount = payments.filter(
              (p: any) => p.params?.amount && !isNaN(parseFloat(p.params.amount))
            );
            const sumOfAmounts = paymentsWithAmount.reduce(
              (sum: number, p: any) => sum + parseFloat(p.params.amount), 0
            );

            if (Math.abs(sumOfAmounts - quoteTotal) > 0.01) {
              result.failed.push(
                `Split payment amount mismatch: sum of payments (${sumOfAmounts.toFixed(2)}) does not match quote total (${quoteTotal})`
              );
            } else {
              result.passed.push(
                `Split payment audit trail: ${paymentsWithAmount.length} payment(s) with amounts, total ${sumOfAmounts.toFixed(2)} matches quote ${quoteTotal}`
              );
            }
          }
        }
      }
    } else {
      result.failed.push("Payment information is missing in on_confirm");
    }

    // Validate created_at and updated_at
    if (order?.created_at) {
      result.passed.push("Order created_at present");
    }
    if (order?.updated_at) {
      result.passed.push("Order updated_at present");
    }

    // Use shared quote validation
    if (message?.order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: false,
        flowId,
      });
    }
  } catch (error) {
    result.failed.push(`Validation error: ${error}`);
  }

  return result;
}
