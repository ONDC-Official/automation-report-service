"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReportHTML = generateReportHTML;
/**
 * Generates an HTML report based on a list of flow IDs and their respective validation results.
 * @param flowReports An array where each item contains a flow ID and its validation result.
 * @returns A string representing the HTML report.
 */
function generateReportHTML(flowReports) {
    const reportRows = flowReports
        .map(({ flowId, results }) => {
        var _a, _b, _c;
        // Handle unsuccessful results
        if (!results.success) {
            return `
            <tr>
              <td>${flowId}</td>
              <td style="color: red;">FAILED</td>
              <td>${results.error}</td>
              <td>${results.details ? formatReportItems((_a = results.details.response) === null || _a === void 0 ? void 0 : _a.report) : "N/A"}</td>
            </tr>
          `;
        }
        // Extract data for successful results
        const report = (_c = (_b = results.response) === null || _b === void 0 ? void 0 : _b.response) === null || _c === void 0 ? void 0 : _c.report;
        if (!report) {
            return `
            <tr>
              <td>${flowId}</td>
              <td style="color: orange;">NO REPORT</td>
              <td colspan="2">The response did not include a report.</td>
            </tr>
          `;
        }
        const transactions = Object.entries(report).map(([transactionId, transactionResult]) => {
            var _a;
            return `
            <tr>
              <td>${transactionId}</td>
              <td style="color: ${transactionResult.status === "success" ? "green" : "red"};">${transactionResult.status.toUpperCase()}</td>
              <td>${transactionResult.details ? JSON.stringify(transactionResult.details) : "N/A"}</td>
              <td>${formatReportItems((_a = transactionResult.details) === null || _a === void 0 ? void 0 : _a.report)}</td>
            </tr>
          `;
        });
        return `
          <tr>
            <td colspan="4" style="font-weight: bold; background-color: #f9f9f9;">Flow ID: ${flowId}</td>
          </tr>
          ${transactions.join("")}
        `;
    })
        .join("");
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Validation Results Report</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
            }
            h1 {
              margin-bottom: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
            }
            th {
              background-color: #f2f2f2;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            tr:hover {
              background-color: #f1f1f1;
            }
            .cross-icon {
              color: red;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <h1>Validation Results Report</h1>
          <table>
            <thead>
              <tr>
                <th>Flow ID</th>
                <th>Status</th>
                <th>Error/Details</th>
                <th>Additional Info</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows}
            </tbody>
          </table>
        </body>
      </html>
    `;
}
/**
 * Formats report items into HTML with each line item on a new line, prefixed by a red cross.
 * @param report The report object to format.
 * @returns A string of HTML with formatted report items.
 */
function formatReportItems(report) {
    if (!report || typeof report !== "object")
        return "N/A";
    return Object.entries(report)
        .map(([key, value]) => {
        // If the value contains multiple issues, format each issue separately
        if (typeof value === "object" && !Array.isArray(value)) {
            return `
            <div>
              <strong>${key}:</strong>
              <ul>
                ${Object.entries(value)
                .map(([subKey, subValue]) => `
                    <li>
                      <span class="cross-icon">✖</span>
                      <strong>${subKey}:</strong> ${subValue}
                    </li>
                  `)
                .join("")}
              </ul>
            </div>
          `;
        }
        else if (Array.isArray(value)) {
            // Handle array of issues
            return `
            <div>
              <strong>${key}:</strong>
              <ul>
                ${value
                .map((item) => `
                    <li>
                      <span class="cross-icon">✖</span>
                      ${item}
                    </li>
                  `)
                .join("")}
              </ul>
            </div>
          `;
        }
        else {
            // Single issue as a string or primitive
            return `
            <div>
              <strong>${key}:</strong> ${value}
            </div>
          `;
        }
    })
        .join("");
}
