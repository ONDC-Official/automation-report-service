import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";

// Required LOAN_INFO codes per doc (child items must have all of these)
const REQUIRED_LOAN_INFO_CODES = [
  "INTEREST_RATE",
  "TERM",
  "INTEREST_RATE_TYPE",
  "APPLICATION_FEE",
  "DELAY_PENALTY_FEE",
  "ANNUAL_PERCENTAGE_RATE",
  "REPAYMENT_FREQUENCY",
  "NUMBER_OF_INSTALLMENTS",
  "TNC_LINK",
  "COOL_OFF_PERIOD",
  "INSTALLMENT_AMOUNT",
];

// Required LOAN_OFFER codes per doc
const REQUIRED_LOAN_OFFER_CODES = [
  "PRINCIPAL_AMOUNT",
  "INTEREST_AMOUNT",
  "NET_DISBURSED_AMOUNT",
];

// Valid fulfillment CHECKLISTS codes per doc
const VALID_CHECKLIST_CODES = [
  "PERSONAL_INFORMATION_BUSINESS_TERM",
  "PERSONAL_INFORMATION_LAMF",
  "PERSONAL_INFORMATION",
  "SET_LOAN_AMOUNT",
  "KYC_OFFLINE",
  "KYC",
  "LOAN_AGREEMENT",
  "MANDATE",
  "EMANDATE",
];

const VALID_CHECKLIST_VALUES = ["PENDING", "COMPLETED", "OPTIONAL"];

/**
 * Validate the on_search catalog structure for FIS12 2.3.0 Unified Credit flows.
 * Covers both:
 *   - credit_offline (LAMF): no categories on provider, PERSONAL_INFORMATION_LAMF checklist
 *   - offline_journey (Personal Loan): categories present, PERSONAL_INFORMATION checklist
 */
function validateUnifiedCreditOnSearchCatalog(
  message: any,
  testResults: TestResult
): void {
  const catalog = message?.catalog;
  if (!catalog) {
    testResults.failed.push("catalog is missing in on_search message");
    return;
  }

  // ── Catalog descriptor ──────────────────────────────────────────────────
  if (!catalog.descriptor?.name) {
    testResults.failed.push("catalog.descriptor.name is missing");
  } else {
    testResults.passed.push(`catalog.descriptor.name present: "${catalog.descriptor.name}"`);
  }

  const providers: any[] = catalog.providers;
  if (!providers || !Array.isArray(providers) || providers.length === 0) {
    testResults.failed.push("catalog.providers array is missing or empty");
    return;
  }

  const provider = providers[0];

  // ── Provider descriptor ─────────────────────────────────────────────────
  if (!provider.id) {
    testResults.failed.push("provider.id is missing");
  } else {
    testResults.passed.push(`provider.id is present: ${provider.id}`);
  }

  if (!provider.descriptor?.name) {
    testResults.failed.push("provider.descriptor.name is missing");
  }

  if (
    !provider.descriptor?.images ||
    !Array.isArray(provider.descriptor.images) ||
    provider.descriptor.images.length === 0
  ) {
    testResults.failed.push("provider.descriptor.images is missing");
  }

  // ── Items ───────────────────────────────────────────────────────────────
  const items: any[] = provider.items || [];
  if (!Array.isArray(items) || items.length === 0) {
    testResults.failed.push("provider.items array is missing or empty");
    return;
  }

  const parentItems = items.filter((i) => !i.parent_item_id);
  const childItems = items.filter((i) => !!i.parent_item_id);

  if (parentItems.length === 0) {
    testResults.failed.push("No parent item found in on_search items");
  }
  if (childItems.length === 0) {
    testResults.failed.push(
      "No child item found in on_search items (child item with price and LOAN_INFO/LOAN_OFFER is required)"
    );
  }

  items.forEach((item: any) => {
    if (!item.id) {
      testResults.failed.push("Item.id is missing");
      return;
    }

    // Descriptor code
    const validCodes = ["LOAN", "CARD", "CREDIT_CARD", "PARENT", "ITEM"];
    if (!item.descriptor?.code) {
      testResults.failed.push(`Item ${item.id}: descriptor.code missing`);
    } else if (!validCodes.includes(item.descriptor.code)) {
      testResults.failed.push(
        `Item ${item.id}: descriptor.code "${item.descriptor.code}" is invalid. Must be one of [${validCodes.join(", ")}]`
      );
    } else {
      testResults.passed.push(`Item ${item.id}: descriptor.code valid ("${item.descriptor.code}")`);
    }

    // fulfillment_ids
    if (!item.fulfillment_ids || item.fulfillment_ids.length === 0) {
      testResults.failed.push(`Item ${item.id}: fulfillment_ids missing`);
    } else {
      testResults.passed.push(`Item ${item.id}: fulfillment_ids present`);
    }

    // category_ids
    if (!Array.isArray(item.category_ids) || item.category_ids.length === 0) {
      testResults.failed.push(`Item ${item.id}: category_ids missing`);
    }

    if (item.parent_item_id) {
      // ─── Child item validations ────────────────────────────────────────
      if (!item.price?.value) {
        testResults.failed.push(`Child item ${item.id}: price.value is mandatory`);
      } else {
        testResults.passed.push(`Child item ${item.id}: price present (${item.price.value})`);
      }

      if (!item.tags || !Array.isArray(item.tags) || item.tags.length === 0) {
        testResults.failed.push(
          `Child item ${item.id}: tags (LOAN_INFO, LOAN_OFFER) are required`
        );
      } else {
        const tagCodes = item.tags.map((t: any) => t.descriptor?.code);

        // Validate LOAN_INFO
        if (!tagCodes.includes("LOAN_INFO")) {
          testResults.failed.push(`Child item ${item.id}: LOAN_INFO tag is missing`);
        } else {
          const loanInfoTag = item.tags.find((t: any) => t.descriptor?.code === "LOAN_INFO");
          const loanInfoMap = new Map<string, string>();
          (loanInfoTag?.list || []).forEach((entry: any) => {
            if (entry.descriptor?.code) {
              loanInfoMap.set(entry.descriptor.code, entry.value);
            }
          });

          REQUIRED_LOAN_INFO_CODES.forEach((code) => {
            if (!loanInfoMap.has(code)) {
              testResults.failed.push(`Child item ${item.id}: LOAN_INFO.${code} is missing`);
            } else {
              testResults.passed.push(
                `Child item ${item.id}: LOAN_INFO.${code} = "${loanInfoMap.get(code)}"`
              );
            }
          });
        }

        // Validate LOAN_OFFER
        if (!tagCodes.includes("LOAN_OFFER")) {
          testResults.failed.push(`Child item ${item.id}: LOAN_OFFER tag is missing`);
        } else {
          const loanOfferTag = item.tags.find((t: any) => t.descriptor?.code === "LOAN_OFFER");
          const loanOfferMap = new Map<string, string>();
          (loanOfferTag?.list || []).forEach((entry: any) => {
            if (entry.descriptor?.code) {
              loanOfferMap.set(entry.descriptor.code, entry.value);
            }
          });

          REQUIRED_LOAN_OFFER_CODES.forEach((code) => {
            if (!loanOfferMap.has(code)) {
              testResults.failed.push(`Child item ${item.id}: LOAN_OFFER.${code} is missing`);
            } else {
              testResults.passed.push(
                `Child item ${item.id}: LOAN_OFFER.${code} = "${loanOfferMap.get(code)}"`
              );
            }
          });
        }
      }

      testResults.passed.push(`Child item ${item.id}: structure validated`);
    } else {
      // ─── Parent item validations ──────────────────────────────────────
      if (item.price) {
        testResults.failed.push(`Parent item ${item.id}: should NOT have a price`);
      }
      if (!item.matched) {
        testResults.failed.push(`Parent item ${item.id}: matched flag should be true`);
      } else {
        testResults.passed.push(`Parent item ${item.id}: matched = true`);
      }
      if (!item.recommended) {
        testResults.failed.push(`Parent item ${item.id}: recommended flag should be true`);
      } else {
        testResults.passed.push(`Parent item ${item.id}: recommended = true`);
      }
      testResults.passed.push(`Parent item ${item.id}: structure validated`);
    }
  });

  // ── Fulfillments ────────────────────────────────────────────────────────
  const fulfillments: any[] = provider.fulfillments || [];
  if (fulfillments.length === 0) {
    testResults.failed.push("provider.fulfillments missing in on_search");
  } else {
    fulfillments.forEach((f: any) => {
      if (!f.id) {
        testResults.failed.push("Fulfillment id missing");
      }
      if (f.type !== "SEMI_ONLINE") {
        testResults.failed.push(
          `Fulfillment ${f.id}: type should be "SEMI_ONLINE", found "${f.type}"`
        );
      } else {
        testResults.passed.push(`Fulfillment ${f.id}: type = SEMI_ONLINE`);
      }

      // Validate CHECKLISTS tag on fulfillment
      const checklistTag = (f.tags || []).find(
        (t: any) => t.descriptor?.code === "CHECKLISTS"
      );
      if (!checklistTag) {
        testResults.failed.push(
          `Fulfillment ${f.id}: CHECKLISTS tag is missing`
        );
      } else {
        if (!Array.isArray(checklistTag.list) || checklistTag.list.length === 0) {
          testResults.failed.push(`Fulfillment ${f.id}: CHECKLISTS tag list is empty`);
        } else {
          checklistTag.list.forEach((entry: any) => {
            const code = entry.descriptor?.code;
            const value = entry.value;
            if (!VALID_CHECKLIST_CODES.includes(code)) {
              testResults.failed.push(
                `Fulfillment ${f.id}: CHECKLISTS entry code "${code}" is not a known checklist item`
              );
            }
            if (!VALID_CHECKLIST_VALUES.includes(value)) {
              testResults.failed.push(
                `Fulfillment ${f.id}: CHECKLISTS.${code} value "${value}" is invalid. Expected one of [${VALID_CHECKLIST_VALUES.join(", ")}]`
              );
            } else {
              testResults.passed.push(
                `Fulfillment ${f.id}: CHECKLISTS.${code} = "${value}"`
              );
            }
          });
        }
      }
    });
  }

  // ── Provider-level tags: CONTACT_INFO, LSP_INFO ─────────────────────────
  const providerTags: any[] = provider.tags || [];
  const hasContactInfo = providerTags.some((t: any) => t.descriptor?.code === "CONTACT_INFO");
  const hasLspInfo = providerTags.some((t: any) => t.descriptor?.code === "LSP_INFO");

  if (!hasContactInfo) {
    testResults.failed.push("provider.tags: CONTACT_INFO tag is missing");
  } else {
    testResults.passed.push("provider.tags: CONTACT_INFO is present");
  }
  if (!hasLspInfo) {
    testResults.failed.push("provider.tags: LSP_INFO tag is missing");
  } else {
    testResults.passed.push("provider.tags: LSP_INFO is present");
  }

  // ── Payments ─────────────────────────────────────────────────────────────
  const payments: any[] = provider.payments || [];
  if (payments.length === 0) {
    testResults.failed.push("provider.payments is missing in on_search");
  } else {
    const hasInstallment = payments.some((p: any) => p.time?.label === "INSTALLMENT");
    const hasDisbursement = payments.some((p: any) => p.time?.label === "LOAN_DISBURSMENT");

    if (!hasInstallment) {
      testResults.failed.push(
        "Payments: INSTALLMENT payment (time.label = INSTALLMENT) is missing"
      );
    } else {
      testResults.passed.push("Payments: INSTALLMENT payment is present");
    }
    if (!hasDisbursement) {
      testResults.failed.push(
        "Payments: LOAN_DISBURSMENT payment (time.label = LOAN_DISBURSMENT) is missing"
      );
    } else {
      testResults.passed.push("Payments: LOAN_DISBURSMENT payment is present");
    }
  }

  // ── Catalog-level BPP_TERMS tag ──────────────────────────────────────────
  const catalogTags: any[] = catalog.tags || [];
  const hasBppTerms = catalogTags.some((t: any) => t.descriptor?.code === "BPP_TERMS");
  if (!hasBppTerms) {
    testResults.failed.push("catalog.tags: BPP_TERMS tag is missing");
  } else {
    testResults.passed.push("catalog.tags: BPP_TERMS is present");
  }
}

export default async function on_search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  // Run the shared unified-credit validator (item structure)
  const result = await DomainValidators.fis12UnifiedCreditOnSearch(element, sessionID, flowId, actionId);

  // Run detailed catalog validation specific to the 2.3.0 doc spec
  try {
    const message = element?.jsonRequest?.message;
    if (message) {
      validateUnifiedCreditOnSearchCatalog(message, result);
    }
  } catch (err: any) {
    result.failed.push(`on_search catalog validation error: ${err?.message || err}`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}