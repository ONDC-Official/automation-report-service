import { TestResult } from "../../types/payload";
import { fetchData } from "../../utils/redisUtils";
import logger from "@ondc/automation-logger";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

/**
 * Normalizes HTML content for comparison by:
 * - Removing whitespace and newlines
 * - Normalizing attribute order
 * - Removing EJS template variables
 * - Converting to lowercase for comparison
 */
function normalizeHTML(html: string): string {
  if (!html) return "";
  
  return html
    .replace(/<%=[\s\S]*?%>/g, "") // Remove EJS template variables
    .replace(/\s+/g, " ") // Replace multiple whitespace with single space
    .replace(/>\s+</g, "><") // Remove whitespace between tags
    .trim()
    .toLowerCase();
}

/**
 * Extracts form structure (fields, labels, types) from HTML for comparison
 */
function extractFormStructure(html: string): {
  fields: Array<{ name: string; type: string; required: boolean; label?: string }>;
  formId?: string;
} {
  const structure: {
    fields: Array<{ name: string; type: string; required: boolean; label?: string }>;
    formId?: string;
  } = { fields: [] };

  try {
    // Extract form ID
    const formIdMatch = html.match(/<form[^>]*id=["']([^"']+)["']/i);
    if (formIdMatch) {
      structure.formId = formIdMatch[1];
    }

    // Extract all input, select, textarea elements
    const fieldPattern = /<(input|select|textarea)[^>]*>/gi;
    const matches = html.match(fieldPattern) || [];

    matches.forEach((match) => {
      const nameMatch = match.match(/name=["']([^"']+)["']/i);
      const idMatch = match.match(/id=["']([^"']+)["']/i);
      const typeMatch = match.match(/type=["']([^"']+)["']/i);
      const tagMatch = match.match(/<(input|select|textarea)/i);
      
      const name = nameMatch?.[1] || idMatch?.[1];
      if (!name || name === "formId" || name === "submit") {
        return; // Skip hidden formId and submit buttons
      }

      const type = typeMatch?.[1]?.toLowerCase() || tagMatch?.[1]?.toLowerCase() || "text";
      const required = /required/i.test(match);

      // Try to find associated label
      let label: string | undefined;
      const id = idMatch?.[1];
      if (id) {
        const labelForPattern = new RegExp(
          `<label[^>]*for=["']${id}["'][^>]*>([^<]+)</label>`,
          "i"
        );
        const labelMatch = html.match(labelForPattern);
        if (labelMatch) {
          label = labelMatch[1].trim();
        }
      }

      // If no label found, look for preceding label
      if (!label) {
        const beforeMatch = html.substring(0, html.indexOf(match));
        const labelPattern = /<label[^>]*>([^<]+)<\/label>\s*$/i;
        const lastLabelMatch = beforeMatch.match(labelPattern);
        if (lastLabelMatch) {
          label = lastLabelMatch[1].trim();
        }
      }

      structure.fields.push({
        name,
        type,
        required,
        label: label || undefined,
      });
    });
  } catch (error: any) {
    logger.error("Error extracting form structure", error);
  }

  return structure;
}

/**
 * Compares two HTML forms by structure and content
 * Returns true if forms match, false otherwise
 */
function compareFormHTML(actualHTML: string, expectedHTML: string): {
  matches: boolean;
  differences: string[];
} {
  const differences: string[] = [];
  
  // Normalize both HTMLs
  const normalizedActual = normalizeHTML(actualHTML);
  const normalizedExpected = normalizeHTML(expectedHTML);

  // Extract form structures
  const actualStructure = extractFormStructure(actualHTML);
  const expectedStructure = extractFormStructure(expectedHTML);

  // Compare form structures
  if (actualStructure.formId !== expectedStructure.formId) {
    differences.push(
      `Form ID mismatch: expected "${expectedStructure.formId}", got "${actualStructure.formId}"`
    );
  }

  // Compare fields
  const expectedFieldsMap = new Map(
    expectedStructure.fields.map((f) => [f.name, f])
  );
  const actualFieldsMap = new Map(
    actualStructure.fields.map((f) => [f.name, f])
  );

  // Check for missing fields
  expectedFieldsMap.forEach((expectedField, name) => {
    const actualField = actualFieldsMap.get(name);
    if (!actualField) {
      differences.push(`Missing required field: "${name}" (${expectedField.type})`);
    } else {
      // Compare field properties
      if (expectedField.required && !actualField.required) {
        differences.push(`Field "${name}" should be required but is not`);
      }
      if (expectedField.type !== actualField.type) {
        differences.push(
          `Field "${name}" type mismatch: expected "${expectedField.type}", got "${actualField.type}"`
        );
      }
    }
  });

  // Check for unexpected fields (optional - just log, don't fail)
  actualFieldsMap.forEach((actualField, name) => {
    if (!expectedFieldsMap.has(name) && name !== "formId") {
      differences.push(`Unexpected field found: "${name}" (${actualField.type})`);
    }
  });

  // Compare normalized HTML (structure comparison)
  // Remove dynamic content like action URLs for comparison
  const actualForComparison = normalizedActual
    .replace(/action=["'][^"']*["']/gi, "")
    .replace(/method=["'][^"']*["']/gi, "");
  const expectedForComparison = normalizedExpected
    .replace(/action=["'][^"']*["']/gi, "")
    .replace(/method=["'][^"']*["']/gi, "");

  // If structures match but HTML is very different, note it
  if (differences.length === 0 && actualForComparison !== expectedForComparison) {
    // Calculate similarity (simple character-based)
    const maxLength = Math.max(actualForComparison.length, expectedForComparison.length);
    const minLength = Math.min(actualForComparison.length, expectedForComparison.length);
    const similarity = minLength / maxLength;
    
    if (similarity < 0.8) {
      differences.push(
        `HTML content structure differs significantly (similarity: ${(similarity * 100).toFixed(1)}%)`
      );
    }
  }

  return {
    matches: differences.length === 0,
    differences,
  };
}

/**
 * Fetches expected form HTML from form service config
 * Tries to read from form service config directory
 */
async function getExpectedFormHTML(formUrl: string, domain?: string): Promise<string | null> {
  try {
    // Extract domain and form name from URL
    // URL format: http://localhost:3300/forms/FIS12/consumer_information_form?...
    let formDomain = domain;
    let formName = formUrl;

    if (formUrl.includes("/")) {
      const urlParts = formUrl.split("/");
      const formPart = urlParts[urlParts.length - 1]?.split("?")[0];
      
      // Try to extract domain from URL
      // URL structure: http://localhost:3300/forms/FIS12/kyc_verification_status?...
      // We need to find the domain (FIS12) which is typically the second-to-last part
      for (let i = urlParts.length - 1; i >= 0; i--) {
        const part = urlParts[i];
        // Skip empty parts, query params, and protocol/host parts
        if (part && !part.includes(":") && !part.includes("?") && part !== "forms") {
          if (i > 0 && urlParts[i - 1] === "forms") {
            // This is the domain (e.g., FIS12)
            formDomain = part;
          } else if (!formName || formName === formUrl) {
            // This is likely the form name
            formName = formPart || part;
          }
        }
      }
      
      if (formPart) {
        formName = formPart;
      }
    }

    // Try multiple path resolution strategies
    const possiblePaths: string[] = [];
    
    // Strategy 1: Relative path from current __dirname
    const relativePath = path.join(
      __dirname,
      "../../../automation-form-service/src/config",
      formDomain || "FIS12",
      formName,
      "form.html"
    );
    possiblePaths.push(relativePath);

    // Strategy 2: Absolute path from workspace root
    const workspaceRoot = path.resolve(__dirname, "../../../../");
    const absolutePath = path.join(
      workspaceRoot,
      "automation-form-service/src/config",
      formDomain || "FIS12",
      formName,
      "form.html"
    );
    possiblePaths.push(absolutePath);

    // Strategy 3: Try with different form name variations (if form name has underscores)
    if (formName.includes("_")) {
      const kebabCase = formName.replace(/_/g, "-");
      possiblePaths.push(
        path.join(
          workspaceRoot,
          "automation-form-service/src/config",
          formDomain || "FIS12",
          kebabCase,
          "form.html"
        )
      );
    }

    // Try each path
    for (const formServicePath of possiblePaths) {
      if (fs.existsSync(formServicePath)) {
        const expectedHTML = fs.readFileSync(formServicePath, "utf8");
        logger.info(`Loaded expected form HTML from: ${formServicePath}`, {
          formUrl,
          domain: formDomain,
          formName,
          resolvedPath: formServicePath
        });
        return expectedHTML;
      }
    }

    // Log all attempted paths for debugging
    logger.info(`Expected form HTML not found. Attempted paths:`, {
      formUrl,
      domain: formDomain,
      formName,
      attemptedPaths: possiblePaths
    });
    
    return null;
  } catch (error: any) {
    logger.error("Error fetching expected form HTML", error, {
      formUrl,
      domain,
      errorMessage: error.message
    });
    return null;
  }
}

/**
 * Validates HTML_FORM action by:
 * 1. Fetching form URL from Redis (saved during on_search)
 * 2. Calling form service to get HTML
 * 3. Parsing HTML to extract required fields
 * 4. Comparing with expected form HTML (if available)
 * 5. Showing validation results
 */
export async function validateHTMLForm(
  sessionID: string,
  transactionId: string,
  flowId: string,
  testResults: TestResult,
  validateContent: boolean = true // Whether to validate form content (required vs optional)
): Promise<void> {
  try {
    // Step 1: Fetch form URLs from Redis
    const formUrlsData = await fetchData(sessionID, transactionId, "formUrls");
    
    if (!formUrlsData || !formUrlsData.urls || formUrlsData.urls.length === 0) {
      testResults.failed.push(
        "No form URLs found in Redis. Form URLs should be saved during on_search validation."
      );
      return;
    }

    const formUrls: string[] = formUrlsData.urls;
    testResults.passed.push(
      `Found ${formUrls.length} form URL(s) in Redis for validation`
    );

    // Step 2: Process each form URL
    for (let i = 0; i < formUrls.length; i++) {
      const formUrl = formUrls[i];
      
      try {
        // Extract form name from URL
        // URL format: http://localhost:3300/forms/FIS12/consumer_information_form?session_id=...
        const urlParts = formUrl.split("/");
        const formName = urlParts[urlParts.length - 1]?.split("?")[0];
        
        testResults.passed.push(
          `Processing form ${i + 1}: ${formName || formUrl}`
        );

        // Step 3: Call form service to get HTML
        const formServiceUrl = process.env.FORM_SERVICE_URL || "http://localhost:3300";
        const formResponse = await axios.get(formUrl, {
          timeout: 10000,
          validateStatus: (status) => status < 500, // Accept 4xx as valid responses
        });

        if (formResponse.status !== 200) {
          testResults.failed.push(
            `Form ${i + 1} (${formName}): Failed to fetch HTML. Status: ${formResponse.status}`
          );
          continue;
        }

        const htmlContent = formResponse.data;
        if (!htmlContent || typeof htmlContent !== "string") {
          testResults.failed.push(
            `Form ${i + 1} (${formName}): Invalid HTML content received`
          );
          continue;
        }

        testResults.passed.push(
          `Form ${i + 1} (${formName}): Successfully fetched HTML from form service`
        );

        // Step 4: Parse HTML to extract required fields
        const requiredFields = extractRequiredFields(htmlContent);
        
        if (requiredFields.length === 0) {
          testResults.failed.push(
            `Form ${i + 1} (${formName}): No required fields found in HTML form`
          );
        } else {
          testResults.passed.push(
            `Form ${i + 1} (${formName}): Found ${requiredFields.length} required field(s)`
          );
          
          // Add details about required fields
          requiredFields.forEach((field) => {
            testResults.passed.push(
              `Form ${i + 1} - Required Field: "${field.label || field.name}" (${field.type})`
            );
          });
        }

        // Step 5: Validate form content against expected HTML
        // Extract domain from URL if available
        const urlPartsForDomain = formUrl.split("/");
        let domain: string | undefined;
        if (urlPartsForDomain.length >= 2) {
          const possibleDomain = urlPartsForDomain[urlPartsForDomain.length - 2];
          if (possibleDomain && !possibleDomain.includes(":") && !possibleDomain.includes(".")) {
            domain = possibleDomain;
          }
        }

        const expectedHTML = await getExpectedFormHTML(formUrl, domain);
        
        if (expectedHTML) {
          testResults.passed.push(
            `Form ${i + 1} (${formName}): Expected form HTML template found`
          );

          const comparison = compareFormHTML(htmlContent, expectedHTML);
          
          if (comparison.matches) {
            testResults.passed.push(
              `Form ${i + 1} (${formName}): Form content matches expected template`
            );
          } else {
            // Content doesn't match
            if (validateContent) {
              // Required validation - raise error
              const errorMessage = `Form ${i + 1} (${formName}): Form content does not match expected template (REQUIRED)`;
              testResults.failed.push(errorMessage);
              
              // Add detailed differences
              comparison.differences.forEach((diff) => {
                testResults.failed.push(`  - ${diff}`);
              });
            } else {
              // Optional validation - just pass
              testResults.passed.push(
                `Form ${i + 1} (${formName}): Form content does not match expected template (OPTIONAL - passed)`
              );
              
              // Log differences for information (but don't fail)
              comparison.differences.forEach((diff) => {
                testResults.passed.push(`  - Note: ${diff}`);
              });
            }
          }
        } else {
          // Expected HTML not found
          if (validateContent) {
            // Required but template not found - this is a failure
            testResults.failed.push(
              `Form ${i + 1} (${formName}): Expected form HTML template not found (REQUIRED validation cannot be performed)`
            );
          } else {
            // Optional - just pass
            testResults.passed.push(
              `Form ${i + 1} (${formName}): Expected form HTML template not found (OPTIONAL - validation skipped)`
            );
          }
        }

      } catch (error: any) {
        logger.error(`Error processing form URL ${formUrl}`, error);
        testResults.failed.push(
          `Form ${i + 1}: Error processing form - ${error.message}`
        );
      }
    }

  } catch (error: any) {
    logger.error("Error in HTML_FORM validation", error);
    testResults.failed.push(
      `HTML_FORM validation failed: ${error.message}`
    );
  }
}

/**
 * Extracts required fields from HTML form using regex
 * Looks for input, select, textarea elements with required attribute
 */
function extractRequiredFields(html: string): Array<{
  name: string;
  type: string;
  label?: string;
}> {
  const requiredFields: Array<{ name: string; type: string; label?: string }> = [];
  
  try {
    // Regex patterns to find form elements with required attribute
    const requiredInputPattern = /<(input|select|textarea)[^>]*required[^>]*>/gi;
    const matches = html.match(requiredInputPattern) || [];
    
    matches.forEach((match) => {
      // Extract name attribute
      const nameMatch = match.match(/name=["']([^"']+)["']/i);
      const idMatch = match.match(/id=["']([^"']+)["']/i);
      const name = nameMatch?.[1] || idMatch?.[1] || "unnamed";
      
      // Extract type attribute
      const typeMatch = match.match(/type=["']([^"']+)["']/i);
      const tagMatch = match.match(/<(input|select|textarea)/i);
      const type = typeMatch?.[1] || tagMatch?.[1]?.toLowerCase() || "text";
      
      // Try to find associated label
      let label: string | undefined;
      const id = idMatch?.[1];
      if (id) {
        // Look for label with 'for' attribute
        const labelForPattern = new RegExp(
          `<label[^>]*for=["']${id}["'][^>]*>([^<]+)</label>`,
          "i"
        );
        const labelMatch = html.match(labelForPattern);
        if (labelMatch) {
          label = labelMatch[1].trim();
        }
      }
      
      // If no label found, look for preceding label
      if (!label) {
        const beforeMatch = html.substring(0, html.indexOf(match));
        const labelPattern = /<label[^>]*>([^<]+)<\/label>\s*$/i;
        const lastLabelMatch = beforeMatch.match(labelPattern);
        if (lastLabelMatch) {
          label = lastLabelMatch[1].trim();
        }
      }

      // Avoid duplicates
      if (!requiredFields.find((f) => f.name === name)) {
        requiredFields.push({
          name,
          type,
          label: label || undefined,
        });
      }
    });

    // Also check for fields marked as required via data attributes
    const dataRequiredPattern = /<(input|select|textarea)[^>]*data-required=["']true["'][^>]*>/gi;
    const dataRequiredMatches = html.match(dataRequiredPattern) || [];
    
    dataRequiredMatches.forEach((match) => {
      const nameMatch = match.match(/name=["']([^"']+)["']/i);
      const idMatch = match.match(/id=["']([^"']+)["']/i);
      const name = nameMatch?.[1] || idMatch?.[1];
      
      if (name && !requiredFields.find((f) => f.name === name)) {
        const typeMatch = match.match(/type=["']([^"']+)["']/i);
        const tagMatch = match.match(/<(input|select|textarea)/i);
        const type = typeMatch?.[1] || tagMatch?.[1]?.toLowerCase() || "text";
        
        requiredFields.push({
          name,
          type,
        });
      }
    });

  } catch (error: any) {
    logger.error("Error parsing HTML for required fields", error);
  }

  return requiredFields;
}

