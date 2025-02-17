"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCommon = checkCommon;
function checkCommon(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const testResults = {
            response: {},
            passed: [],
            failed: [],
        };
        const { jsonRequest } = payload;
        const { message } = jsonRequest;
        const provider = (_a = message === null || message === void 0 ? void 0 : message.order) === null || _a === void 0 ? void 0 : _a.provider;
        const quote = (_b = message === null || message === void 0 ? void 0 : message.order) === null || _b === void 0 ? void 0 : _b.quote;
        // 1. Process fulfillments only once
        const fulfillments = provider === null || provider === void 0 ? void 0 : provider.fulfillments;
        //   // Validate unique IDs in fulfillments
        //   try {
        //     const ids = fulfillments.map((fulfillment: any) => fulfillment.id);
        //     const uniqueIds = new Set(ids);
        //     assert.strictEqual(ids.length, uniqueIds.size, "Ids must be unique");
        //     testResults.passed.push("Ids are unique");
        //   } catch (error: any) {
        //     testResults.failed.push(`Unique Ids check: ${error.message}`);
        //   }
        //   // Validate GPS precision and parent_item_id references
        //   try {
        //     for (const fulfillment of fulfillments) {
        //       // Check GPS precision
        //       for (const stop of fulfillment.stops) {
        //         try {
        //           if (stop.location && stop.location.gps) {
        //             const gps = stop.location.gps;
        //             const gpsRegex = /^\d{1,3}\.\d{6}$/; // regex to match 6 decimal precision
        //             assert.ok(gpsRegex.test(gps), "GPS must have 6 decimal precision");
        //           }
        //         } catch (error: any) {
        //           testResults.failed.push(`GPS precision check: ${error.message}`);
        //         }
        //       }
        //       // Check parent_item_id references
        //       const stops = fulfillment.stops;
        //       try {
        //         for (let i = 1; i < stops.length; i++) {
        //           const previousStop = stops[i - 1];
        //           const currentStop = stops[i];
        //           assert.strictEqual(currentStop.parent_item_id, previousStop.id, "parent_item_id should refer to previous stop id");
        //         }
        //         testResults.passed.push("parent_item_id refers to previous stop id");
        //       } catch (error: any) {
        //         testResults.failed.push(`parent_item_id check: ${error.message}`);
        //       }
        //     }
        //     testResults.passed.push("GPS has 6 decimal precision");
        //   } catch (error: any) {
        //     testResults.failed.push(`GPS and parent_item_id check: ${error.message}`);
        //   }
        // // 2. Valid titles for quote.breakup
        // try {
        //   if (quote && quote.breakup) {
        //     for (const breakupItem of quote.breakup) {
        //       const validTitles = ["BASE_FARE", "REFUND", "CANCELLATION_CHARGES"];
        //       assert.ok(validTitles.includes(breakupItem.title), "Invalid title in quote.breakup");
        //       // Only REFUND & CANCELLATION_CHARGES should be included if cancellation is being made
        //       if (["REFUND", "CANCELLATION_CHARGES"].includes(breakupItem.title)) {
        //         assert.ok(breakupItem.status === "CANCELLED", "REFUND and CANCELLATION_CHARGES should be included only if cancellation is being made");
        //       }
        //     }
        //     testResults.passed.push("Valid titles in quote.breakup");
        //   }
        // } catch (error: any) {
        //   testResults.failed.push(`Quote.breakup validation: ${error.message}`);
        // }
        return testResults;
    });
}
