/**
 * Turns Supabase/PostgREST/auth errors into safe, human-readable messages.
 * Never surfaces raw SQL, stack traces or customer data.
 */
export interface AppError {
  message: string;
  /** form field path for validation errors, e.g. "items.0.quantity" */
  field?: string;
  code?: string;
  sessionExpired?: boolean;
}

interface MaybePgError { message?: string; hint?: string | null; code?: string; details?: string | null; status?: number; name?: string }

const FIELD_MAP: Record<string, string> = {
  'client.name': 'client.name',
  'client.country_code': 'client.countryCode',
  'client.state': 'client.state',
  invoice_date: 'invoiceDate',
  items: 'items',
};

function mapField(dbField: string): string {
  if (FIELD_MAP[dbField]) return FIELD_MAP[dbField]!;
  return dbField.replace(/\.unit_price$/, '.unitPrice');
}

export function toAppError(err: unknown): AppError {
  if (!err) return { message: 'Something went wrong. Please try again.' };
  const e = err as MaybePgError;
  const msg = e.message ?? String(err);

  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
    return { message: 'Network error — check your connection and try again.', code: 'NETWORK' };
  }
  if (e.code === 'PGRST301' || e.code === 'PGRST303' || /JWT expired|invalid JWT|refresh token/i.test(msg)) {
    return { message: 'Your session has expired. Please sign in again.', code: 'SESSION_EXPIRED', sessionExpired: true };
  }
  if (e.code === '42501' || /permission denied|not authorized/i.test(msg)) {
    return { message: 'You are not authorized to perform this action.', code: 'NOT_AUTHORIZED' };
  }
  const hint = e.hint ?? '';
  if (hint.startsWith('VALIDATION:')) {
    return { message: msg, field: mapField(hint.slice('VALIDATION:'.length)), code: 'VALIDATION' };
  }
  if (hint && /^[A-Z_]+$/.test(hint)) {
    // Our own RAISE EXCEPTION messages are written to be user-facing.
    return { message: msg, code: hint };
  }
  if (e.code === '23505') return { message: 'This record already exists (duplicate value).', code: 'DUPLICATE' };
  if (e.code === '23514') return { message: 'Some values are not allowed. Please review the form.', code: 'CHECK' };
  if (e.name === 'AuthApiError' || e.name === 'AuthError') {
    if (/Invalid login credentials/i.test(msg)) return { message: 'Incorrect email or password.' };
    if (/Email not confirmed/i.test(msg)) return { message: 'Please confirm your email address first.' };
    if (/rate limit/i.test(msg)) return { message: 'Too many attempts. Please wait a moment and try again.' };
    return { message: msg };
  }
  if (import.meta.env.DEV) console.error(err);
  return { message: 'Something went wrong. Please try again.' };
}
