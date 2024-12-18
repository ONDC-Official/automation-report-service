import { writeFileSync } from "fs";
import { FlowValidationResult } from "../services/validationModule";


export function generateCustomHTMLReport(data: Record<string, FlowValidationResult>) {
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
      background-color: #f4f4f9;
      color: #333;
    }
    h1 {
      text-align: center;
      color: #0056a6;
      margin-bottom: 20px;
    }
    .flow-card {
      background: #fff;
      margin-bottom: 20px;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .flow-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .flow-id {
      font-size: 18px;
      font-weight: bold;
      color: #0056a6;
    }
    .validity {
      font-size: 14px;
      padding: 5px 10px;
      border-radius: 20px;
      color: #fff;
    }
    .validity.valid {
      background-color: #28a745;
    }
    .validity.invalid {
      background-color: #dc3545;
    }
    .section-title {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }
    .result-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .result-item {
      display: flex;
      align-items: center;
      padding: 10px;
      margin-bottom: 10px;
      border-radius: 5px;
      font-size: 14px;
    }
    .result-item.passed {
      background-color: #e7f9ed;
      border: 1px solid #28a745;
      color: #155724;
    }
    .result-item.failed {
      background-color: #fce8e6;
      border: 1px solid #dc3545;
      color: #721c24;
    }
    .icon {
      margin-right: 10px;
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
      // Parse the "messages" object
      const parsedMessages = Object.entries(messages).reduce(
        (acc, [api, result]) => {
          try {
            const parsedResult = JSON.parse(result);
            acc[api] = {
              passed: parsedResult.passed || [],
              failed: parsedResult.failed || [],
            };
          } catch (err:any) {
            console.error(`Failed to parse message for ${api}: ${err.message}`);
            acc[api] = { passed: [], failed: [] }; // Default empty arrays on parse failure
          }
          return acc;
        },
        {} as Record<string, { passed: string[]; failed: string[] }>
      );

      return `
      <div class="flow-card">
        <div class="flow-header">
          <div class="flow-id">Flow ID: ${flowId}</div>
          <div class="validity ${valid_flow ? "valid" : "invalid"}">
            ${valid_flow ? "Valid" : "Invalid"}
          </div>
        </div>
        <div class="section">
          <div class="section-title">Flow sequence errors</div>
          ${
            errors.length > 0
              ? `<ul class="result-list">${errors
                  .map(
                    (error) => `
                  <li class="result-item failed">
                    <span class="icon fail">✘</span>${error}
                  </li>`
                  )
                  .join("")}</ul>`
              : "<p>No errors found.</p>"
          }
        </div>
        <div class="section">
          <div class="section-title">Validations</div>
          ${
            Object.keys(parsedMessages).length > 0
              ? `<ul class="result-list">
                  ${Object.entries(parsedMessages)
                    .map(([api, { passed, failed }]) => {
                      const passedItems = passed
                        .map(
                          (passItem) => `
                          <li class="result-item passed">
                            <span class="icon pass">✔</span>${api}: ${passItem}
                          </li>`
                        )
                        .join("");
                      const failedItems = failed
                        .map(
                          (failItem) => `
                          <li class="result-item failed">
                            <span class="icon fail">✘</span>${api}: ${failItem}
                          </li>`
                        )
                        .join("");
                      return passedItems + failedItems;
                    })
                    .join("")}
                </ul>`
              : "<p>No messages found.</p>"
          }
        </div>
      </div>
    `;
    })
    .join("")}
</body>
</html>
  `;

  writeFileSync("custom_flow_validation_report.html", htmlContent, "utf8");
  console.log(
    "HTML report generated successfully: custom_flow_validation_report.html"
  );
  return htmlContent;
}