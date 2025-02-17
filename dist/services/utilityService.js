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
exports.utilityReport = utilityReport;
const reportTemplate_1 = require("../templates/reportTemplate");
const parseutils_1 = require("../utils/parseutils");
const validateLogs_1 = require("./validateLogs");
function utilityReport(flows) {
    return __awaiter(this, void 0, void 0, function* () {
        //parse flows
        const parsedFlows = (0, parseutils_1.parseFlows)(flows);
        // Validate flows
        const validatedFlows = yield (0, validateLogs_1.validateFlows)(yield parsedFlows);
        // Generate HTML report
        const htmlReport = (0, reportTemplate_1.generateReportHTML)(validatedFlows);
        return htmlReport;
        return htmlReport;
    });
}
