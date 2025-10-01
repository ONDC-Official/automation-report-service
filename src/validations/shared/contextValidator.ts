export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface Validation {
  name: string;
  run: (payload: unknown) => ValidationResult | Promise<ValidationResult>;
}

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
          ? { ok: false, errors: missing.map(f => `${f} is required`) }
          : { ok: true, errors: [] };
      },
    },
    {
      name: 'context:timestamp-format',
      run: (payload: any) => {
        const ts = payload?.context?.timestamp;
        if (ts == null) return { ok: true, errors: [] };
        return isIsoTimestamp(ts)
          ? { ok: true, errors: [] }
          : { ok: false, errors: ['context.timestamp must be ISO-8601 with milliseconds and Z'] };
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
          ? { ok: false, errors: missing.map(f => `${f} is required`) }
          : { ok: true, errors: [] };
      },
    },
  ];
}


