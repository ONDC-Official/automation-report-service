/**
 * Generates an HTML report for multiple transaction validation results
 * @param results Array of ValidationResult objects
 * @returns A string representing the HTML report
 */

import { ValidationResult } from "../types/validationResult";

export function generateHtmlReport(results: ValidationResult[]): string {
  const reportRows = results
    .map(
      ({ transactionId, status, test_case, details }) => `
      <td style="color: ${
        status === "success" ? "green" : "red"
      };">${status.toUpperCase()}</td>
      <tr>
        <td>${transactionId}</td>
        <td>${test_case || "N/A"}</td>
        <td>${details ? JSON.stringify(details) : "-"}</td>
      </tr>
    `
    )
    .join("");

  return `
    <html>
      <head>
        <title>Transaction Report</title>
        <style>
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid black;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
          }
        </style>
      </head>
      <body>
        <h1>Transaction Report</h1>
        <table>
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Status</th>
              <th>Test Case</th>
              <th>Details</th>
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
