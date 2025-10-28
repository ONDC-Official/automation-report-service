import { Validation, ValidationResult, UnitResult } from "../../types/payload";

function isIsoTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // 2024-11-23T05:42:20.651Z
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

export function contextValidators(): Validation[] {
  return [
    {
      name: 'context:required',
      run: (payload: any) => {
        const ctx = payload?.context;
        const missing: string[] = [];
        if (!ctx) missing.push('context');
        if (!ctx?.domain) missing.push('context.domain');
        if (!ctx?.action) missing.push('context.action');
        // Accept either version (2.x) or core_version (1.x)
        if (!ctx?.version && !ctx?.core_version) missing.push('context.version|core_version');
        if (!ctx?.message_id) missing.push('context.message_id');
        if (!ctx?.transaction_id) missing.push('context.transaction_id');
        if (!ctx?.timestamp) missing.push('context.timestamp');
        return missing.length
          ? { valid: false, results: missing.map(f => ({ valid: false, description: `${f} is required`, code: 400 })) }
          : { valid: true, results: [] };
      },
    },
    {
      name: 'context:timestamp-format',
      run: (payload: any) => {
        const ts = payload?.context?.timestamp;
        if (ts == null) return { valid: true, results: [] };
        return isIsoTimestamp(ts)
          ? { valid: true, results: [] }
          : { valid: false, results: [{ valid: false, description: 'context.timestamp must be ISO-8601 with milliseconds and Z', code: 400 }] };
      },
    },
    {
      name: 'context:country-city-required',
      run: (payload: any) => {
        const ctx = payload?.context;
        const country = ctx?.country ?? ctx?.location?.country?.code;
        const city = ctx?.city ?? ctx?.location?.city?.code;
        const missing: string[] = [];
        if (!country) missing.push('context.country|location.country.code');
        if (!city) missing.push('context.city|location.city.code');
        return missing.length
          ? { valid: false, results: missing.map(f => ({ valid: false, description: `${f} is required`, code: 400 })) }
          : { valid: true, results: [] };
      },
    },
  ];
}