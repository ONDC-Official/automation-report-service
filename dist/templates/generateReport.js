"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCustomHTMLReport = generateCustomHTMLReport;
// Generate the HTML report
function generateCustomHTMLReport(data) {
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flow Validation Report</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f7f7f7;
            color: #333;
          }
          h1 {
            text-align: center;
            color: #0056a6;
            margin-bottom: 30px;
            font-size: 26px;
          }
          .flow-card {
            background: #fff;
            margin-bottom: 25px;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            border: 1px solid #ddd;
            margin-top: 15px;
          }
          .flow-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }
          .flow-id {
            font-size: 18px;
            font-weight: bold;
            color: #0056a6;
          }
          .validity {
            font-size: 14px;
            padding: 5px 12px;
            border-radius: 18px;
            color: #fff;
            font-weight: bold;
          }
          .validity.valid {
            background-color: #28a745;
          }
          .validity.invalid {
            background-color: #dc3545;
          }
          .section-title {
            font-size: 15px;
            font-weight: bold;
            margin-top: 15px;
            color: #333;
            margin-bottom: 8px;
          }
          .api-header {
            font-size: 15px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 12px;
            margin-bottom: 10px;
          }
          .api-header .right-section {
            display: flex;
            align-items: center;
          }
          .ack-status {
            font-size: 12px;
            padding: 4px 8px;
            border-radius: 18px;
            color: #fff;
            font-weight: bold;
            margin-left: 10px;
          }
          .ack-status.ack {
            background-color: #4caf50; /* Green for ACK */
          }
          .ack-status.nack {
            background-color: #D9534F; /* Light Red for NACK */
          }
          .ack-status.no-response {
            background-color: #5bc0de; /* Blue for No Response */
          }
          .error-details {
            font-size: 12px;
            color: #721c24;
            background-color: #fce8e6;
            padding: 4px 8px;
            border-radius: 4px;
            margin-left: 10px;
            display: inline-block;
          }
          .result-list {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          .result-item {
            display: flex;
            align-items: center;
            padding: 6px 15px;
            margin-bottom: 8px;
            border-radius: 6px;
            font-size: 14px;
            border: 1px solid #ddd;
          }
          .result-item.passed {
            background-color: #e7f9ed;
            border-color: #28a745;
            color: #155724;
          }
          .result-item.failed {
            background-color: #fce8e6;
            border-color: #dc3545;
            color: #721c24;
          }
          .icon {
            margin-right: 8px;
            font-size: 16px;
          }
          .icon.pass {
            color: #28a745;
          }
          .icon.fail {
            color: #dc3545;
          }
        </style>
      </head>
   <body>
        <h1>Flow Validation Report</h1>
        ${Object.entries(data)
        .map(([flowId, { valid_flow, errors, messages }]) => {
        const parsedMessages = Object.entries(messages).reduce((acc, [api, result]) => {
            var _a, _b, _c, _d, _e, _f, _g;
            try {
                const parsedResult = JSON.parse(result);
                acc[api] = {
                    ackStatus: ((_c = (_b = (_a = parsedResult.response) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.ack) === null || _c === void 0 ? void 0 : _c.status) || "invalid response",
                    errorCode: ((_e = (_d = parsedResult.response) === null || _d === void 0 ? void 0 : _d.error) === null || _e === void 0 ? void 0 : _e.code) || "No code available",
                    errorMessage: ((_g = (_f = parsedResult.response) === null || _f === void 0 ? void 0 : _f.error) === null || _g === void 0 ? void 0 : _g.message) || "No message available",
                    passed: parsedResult.passed || [],
                    failed: parsedResult.failed || [],
                };
            }
            catch (_h) {
                acc[api] = {
                    ackStatus: null,
                    errorCode: "Parsing error",
                    errorMessage: "Could not parse response",
                    passed: [],
                    failed: [],
                };
            }
            return acc;
        }, {});
        return `
              <div class="flow-card">
                <div class="flow-header">
                  <div class="flow-id">Flow ID: ${flowId}</div>
                  <div class="validity ${valid_flow ? "valid" : "invalid"}">
                    ${valid_flow ? "Valid" : "Invalid"}
                  </div>
                </div>
                <div class="section">
                  <div class="section-title">Flow Sequence Errors</div>
                  ${errors.length
            ? `<ul class="result-list">${errors
                .map((err) => `<li class="result-item failed"><span class="icon fail">✘</span>${err}</li>`)
                .join("")}</ul>`
            : "<p>No errors found.</p>"}
                </div>
                <div class="section">
                  <div class="section-title">Validations</div>
                  ${Object.entries(parsedMessages)
            .map(([api, { ackStatus, errorCode, errorMessage, passed, failed },]) => `
                    <div class="api-header">
                      <span>${api}</span>
                      <div class="right-section">
                        ${ackStatus
            ? `<span class="ack-status ${ackStatus === "ACK"
                ? "ack"
                : ackStatus === "NACK"
                    ? "nack"
                    : "no-response"}">${ackStatus}</span>
                              ${ackStatus === "NACK" &&
                errorCode &&
                errorMessage
                ? `<span class="error-details">${errorCode}: ${errorMessage}</span>`
                : ""}`
            : ""}
                      </div>
                    </div>
                    <ul class="result-list">
                      ${passed
            .map((item) => `<li class="result-item passed"><span class="icon pass">✔</span>${item}</li>`)
            .join("")}
                      ${failed
            .map((item) => `<li class="result-item failed"><span class="icon fail">✘</span>${item}</li>`)
            .join("")}
                    </ul>
                  `)
            .join("")}
                </div>
              </div>
            `;
    })
        .join("")}
      </body>
      </html>
    `;
    return htmlContent;
}
