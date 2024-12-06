import { ValidationResult } from "../types/validationResult";

/**
 * Generates an HTML report grouped by flow.
 * @param results An object where keys are flow names and values are arrays of ValidationResult
 * @returns A string representing the HTML report
 */
export function generateHtmlReportByFlow(
  results: { [flow: string]: ValidationResult[] }
): string {
  // Generate rows grouped by flow
  const reportRows = Object.entries(results)
    .map(
      ([flow, validations]) => `
        <tr>
          <td colspan="3"><strong>${flow}</strong></td>
        </tr>
        ${validations
          .map(
            ({ transactionId, status, details }) => `
          <tr>
            <td>${transactionId}</td>
            <td style="color: ${
              status === "success" ? "green" : "red"
            };">${status.toUpperCase()}</td>
            <td>${details ? JSON.stringify(details) : "-"}</td>
          </tr>
        `
          )
          .join("")}
      `
    )
    .join("");

  // Generate the complete HTML structure
  return `
    <html>
      <head>
        <title>Flow-Based Transaction Report</title>
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
        <h1>Flow-Based Transaction Report</h1>
        <table>
          <thead>
            <tr>
              <th>Flow name</th>
              <th>Status</th>
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