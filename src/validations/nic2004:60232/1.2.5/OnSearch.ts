import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import { logger } from "../../../utils/logger";

export async function checkOnSearch(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  const payload = element;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);

  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;


  const { context, message } = jsonRequest;
  const contextTimestamp = new Date(context?.timestamp || "");
  const onSearch = message?.catalog;
  let validFulfillmentIDs = new Set<string>();

  const formatDate = (date: Date): string => date.toISOString().split("T")[0];
  const extractTATHours = (duration: string): number | null => {
    if (!duration) return null;

    const daysMatch = duration.match(/P(\d+)D/); // Extracts days (e.g., "P4D")
    const hoursMatch = duration.match(/T(\d+)H/); // Extracts hours (e.g., "T12H")

    const days = daysMatch ? parseInt(daysMatch[1]) * 24 : 0;
    const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;

    return days + hours;
  };

  const currentDate = formatDate(contextTimestamp);
  const nextDate = formatDate(
    new Date(contextTimestamp.setDate(contextTimestamp.getDate() + 1))
  );
  let hasForwardShipment = false;
  let hasBackwardShipment = false;

  onSearch?.["bpp/providers"].forEach(
    (provider: { fulfillments: any[]; categories: any[]; items: any[] }) => {
      provider.fulfillments.forEach((fulfillment) => {
        validFulfillmentIDs.add(fulfillment.id);

        if (fulfillment.type === "Delivery") {
          hasForwardShipment = true;
        }
        if (fulfillment.type === "RTO") {
          hasBackwardShipment = true;
        }
      });

      try {
        assert.ok(
          hasForwardShipment && hasBackwardShipment,
          "Both forward shipment (Delivery) and backward shipment (RTO) should be provided in the catalog"
        );
        testResults.passed.push(
          "Forward and backwardshipment validation passed"
        );
      } catch (error: any) {
        testResults.failed.push(error.message);
      }
      provider.categories.forEach((category) => {
        const tatHours = extractTATHours(category?.time?.range?.duration);

        let expectedDate = tatHours
          ? formatDate(
              new Date(contextTimestamp.getTime() + tatHours * 60 * 60 * 1000)
            )
          : null;

        try {
          if (["Standard Delivery", "Express Delivery"].includes(category.id)) {
            assert.ok(
              category.time?.timestamp === expectedDate,
              `In bpp/providers/categories, for ${category.id}, expected TAT date should be ${expectedDate} based on duration (${category?.time?.range?.duration})`
            );

            testResults.passed.push(
              `TAT validation passed for category ${category.id} (Expected: ${expectedDate})`
            );
          }
        } catch (error: any) {
          testResults.failed.push(error.message);
        }
        if (
          [
            "Same Day Delivery",
            "Immediate Delivery",
            "Instant Delivery",
          ].includes(category.id) &&
          category.time?.timestamp !== currentDate
        ) {
          testResults.failed.push(
            `In bpp/providers/categories, for ${category.id}, TAT date should be ${currentDate}`
          );
        }

        if (
          category.id === "Next Day Delivery" &&
          category.time?.timestamp !== nextDate
        ) {
          testResults.failed.push(
            `In bpp/providers/categories, for Next Day Delivery, TAT date should be ${nextDate}`
          );
        }
      });

      provider.items.forEach((item, i) => {
        const tatHours = extractTATHours(item?.time?.range?.duration);

        let expectedDate = tatHours
          ? formatDate(
              new Date(contextTimestamp.getTime() + tatHours * 60 * 60 * 1000)
            )
          : null;

        try {
          if (
            ["Standard Delivery", "Express Delivery"].includes(item.category_id)
          ) {
            assert.ok(
              tatHours !== null,
              `For item ${item.id} (${item.category_id}), TAT duration is missing`
            );

            assert.ok(
              item.time?.timestamp === expectedDate,
              `For item ${item.id} (${item.category_id}), expected TAT date should be ${expectedDate} based on duration (${item?.time?.range?.duration})`
            );

            testResults.passed.push(
              `TAT validation passed for item ${item.id} (${item.category_id}) (Expected: ${expectedDate})`
            );
          }
        } catch (error: any) {
          testResults.failed.push(error.message);
        }
        if (
          [
            "Same Day Delivery",
            "Immediate Delivery",
            "Instant Delivery",
          ].includes(item.category_id) &&
          item.time?.timestamp !== currentDate
        ) {
          testResults.failed.push(
            `For ${item.category_id}, TAT date should be ${currentDate} (item ${item.id})`
          );
        }

        if (
          item.category_id === "Next Day Delivery" &&
          item.time?.timestamp !== nextDate
        ) {
          testResults.failed.push(
            `For Next Day Delivery, TAT date should be ${nextDate} - item ${item.id}`
          );
        }

        try {
          assert.ok(
            validFulfillmentIDs.has(item.fulfillment_id || ""),
            `Item ${item.id} and fulfillment_id does not match any fulfillment ID`
          );
          testResults.passed.push(
            `Fulfillment ID mapping validation passed for item ${item.id}`
          );
        } catch (error: any) {
          testResults.failed.push(error.message);
        }
      });
    }
  );

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}
