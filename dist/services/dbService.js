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
exports.fetchPayloads = fetchPayloads;
// Fetches payloads from a storage URL based on a provided session ID
function fetchPayloads(sessionID) {
    return __awaiter(this, void 0, void 0, function* () {
        const storageUrl = process.env.STORAGE_URL; // Get the storage URL from environment variables
        const dbUrl = `${storageUrl}/${sessionID}`; // Construct the URL for the session-specific payloads
        // Perform a fetch request to retrieve payloads from the constructed URL
        const response = yield fetch(dbUrl);
        // If the response is not successful, throw an error
        if (!response.ok) {
            throw new Error(`Failed to fetch payloads for session ID: ${sessionID}`);
        }
        // Parse the response JSON and return it as an array of Payload objects
        return response.json();
    });
}
