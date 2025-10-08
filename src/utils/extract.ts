import jsonpath from "jsonpath";

export type SaveSpec = Record<string, string> | { 'save-data': Record<string, string> };

export function extractBySpec(payload: any, spec: SaveSpec): Record<string, any> {
  const extracted: Record<string, any> = {};
  console.log("payload=>>>>>>>>>>>>>>>>>extractBySpec", payload, spec);
  if (!spec) return extracted;
  
  // Handle the case where spec has a 'save-data' key (from YAML files)
  const specData = (spec as any)['save-data'] || spec;
  
  for (const key of Object.keys(specData)) {
    console.log("key=>>>>>>>>>>>>>>>>>extractBySpec", key);
    const path = specData[key];
    console.log("path=>>>>>>>>>>>>>>>>>extractBySpec", path);
    
    try {
      const result = jsonpath.query(payload, path);
      console.log("result=>>>>>>>>>>>>>>>>>extractBySpec", result);
      extracted[key] = Array.isArray(result) ? (result.length === 1 ? result[0] : result) : result;
    } catch (error) {
      console.error(`Error extracting data for key '${key}' with path '${path}':`, error);
      extracted[key] = null;
    }
  }
  console.log("extracted=>>>>>>>>>>>>>>>>>extracted", extracted);
  return extracted;
}


