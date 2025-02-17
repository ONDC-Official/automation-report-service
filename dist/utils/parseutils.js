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
exports.parseFlows = parseFlows;
function parseFlows(flows) {
    return __awaiter(this, void 0, void 0, function* () {
        const parsedFlows = {};
        // Parse each flow's payloads and create parsed payloads
        for (const [flowId, flowPayloads] of Object.entries(flows)) {
            try {
                parsedFlows[flowId] = parsePayloads(flowId, flowPayloads);
            }
            catch (error) {
                console.error(`Error parsing flow ${flowId}:`, error);
                // Optionally handle invalid flows by adding an empty or error state.
                parsedFlows[flowId] = {
                    domain: "ONDC:TRV11",
                    version: "2.0.1",
                    flow: flowId,
                    payload: {},
                };
            }
        }
        return parsedFlows;
    });
}
function parsePayloads(flowId, payloads) {
    const parsedPayload = {
        domain: "ONDC:TRV11",
        version: "2.0.1",
        flow: flowId,
        payload: {},
    };
    // Group payloads by action
    const groupedPayloads = payloads.reduce((groups, payload) => {
        var _a;
        const action = (_a = payload.action) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (!action) {
            console.warn(`Missing action in payload for flow ID ${flowId}`, payload);
            return groups;
        }
        if (!groups[action]) {
            groups[action] = [];
        }
        groups[action].push(payload);
        return groups;
    }, {});
    // Sort payloads by createdAt timestamp
    const allPayloads = Object.values(groupedPayloads).flat();
    allPayloads.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    // Counters for numbered actions (search, on_search, cancel, on_cancel)
    const actionCounters = {
        search: 0,
        on_search: 0,
        cancel: 0,
        on_cancel: 0,
    };
    // Flags for first `cancel` and `on_cancel`
    let firstCancelMapped = false;
    let firstOnCancelMapped = false;
    // Process payloads
    allPayloads.forEach((payload) => {
        var _a;
        const action = (_a = payload.action) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (!action) {
            console.warn(`Missing action in payload for flow ID ${flowId}`, payload);
            return;
        }
        // Handling `search` and `on_search` actions with numbering
        if (action === "search" || action === "on_search") {
            actionCounters[action]++;
            const key = `${action}_${actionCounters[action]}`;
            parsedPayload.payload[key] = payload.jsonRequest;
        }
        // Handling `select`, `on_select`, `init`, `on_init`, `confirm`, `on_confirm`, etc.
        else if (action === "select" || action === "on_select" || action === "init" || action === "on_init" || action === "confirm" || action === "on_confirm" || action === "status" || action === "on_status") {
            parsedPayload.payload[action] = payload.jsonRequest;
        }
        // Handling `cancel` actions
        else if (action === "cancel") {
            if (!firstCancelMapped) {
                parsedPayload.payload.soft_cancel = payload.jsonRequest;
                firstCancelMapped = true;
            }
            else {
                actionCounters.cancel++;
                const key = `cancel_${actionCounters.cancel}`;
                parsedPayload.payload[key] = payload.jsonRequest;
            }
        }
        // Handling `on_cancel` actions
        else if (action === "on_cancel") {
            if (!firstOnCancelMapped) {
                parsedPayload.payload.soft_on_cancel = payload.jsonRequest;
                firstOnCancelMapped = true;
            }
            else {
                actionCounters.on_cancel++;
                const key = `on_cancel_${actionCounters.on_cancel}`;
                parsedPayload.payload[key] = payload.jsonRequest;
            }
        }
    });
    // Ensure all keys are added (even if empty)
    const actionKeys = [
        "select", "on_select", "init", "on_init",
        "confirm", "on_confirm", "status", "on_status",
        "soft_cancel", "soft_on_cancel", "cancel", "on_cancel"
    ];
    actionKeys.forEach((key) => {
        if (!(key in parsedPayload.payload)) {
            parsedPayload.payload[key] = {};
        }
    });
    return parsedPayload;
}
