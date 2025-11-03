import jsonpath from "jsonpath";

export type SaveSpec = Record<string, string> | { 'save-data': Record<string, string> };

export function extractBySpec(payload: any, spec: SaveSpec): Record<string, any> {
  const extracted: Record<string, any> = {};
  if (!spec) return extracted;

  // Handle the case where spec has a 'save-data' key (from YAML files)
  const specData = (spec as any)['save-data'] || spec;
  
  for (const key of Object.keys(specData)) {
    const path = specData[key];
    try {
      const result = jsonpath.query(payload, path);
      extracted[key] = Array.isArray(result) ? (result.length === 1 ? result[0] : result) : result;
    } catch (error) {
      console.error(`Error extracting data for key '${key}' with path '${path}':`, error);
      extracted[key] = null;
    }
  }
  return extracted;
}


