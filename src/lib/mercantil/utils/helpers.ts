// WUIPI MERCANTIL SDK - Utility Helpers
import crypto from 'crypto';

/** Generate a unique payment token for tracking */
export function generatePaymentToken(): string {
  return 'wpy_' + crypto.randomBytes(16).toString('hex');
}

/** Generate invoice number with WUIPI prefix */
export function generateInvoiceNumber(prefix = 'WUIPI'): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return prefix + '-' + ts + '-' + rand;
}

/** Format amount for Mercantil API (2 decimal places, string) */
export function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

/** Validate Venezuelan cedula format */
export function validateCedula(cedula: string, type: string): boolean {
  if (!['V', 'E', 'J', 'P'].includes(type.toUpperCase())) return false;
  const clean = cedula.replace(/[^0-9]/g, '');
  if (type === 'J') return clean.length >= 8 && clean.length <= 10;
  return clean.length >= 6 && clean.length <= 9;
}

/** Validate Venezuelan phone number (04XX-XXXXXXX) */
export function validatePhone(phone: string): boolean {
  const clean = phone.replace(/[^0-9]/g, '');
  return /^(0?4[12][24680]\d{7})$/.test(clean) || clean.length === 11;
}

/** Validate Venezuelan bank code (4 digits) */
export function validateBankCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}

/** Format phone for Mercantil (11 digits with leading 0) */
export function formatPhone(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '');
  return clean.startsWith('0') ? clean : '0' + clean;
}

/** Get client identify info from request headers (Next.js) */
export function getClientIdentify(headers: Record<string, string | undefined>) {
  return {
    ipaddress: headers['x-forwarded-for']?.split(',')[0]?.trim()
      || headers['x-real-ip'] || '0.0.0.0',
    browser_agent: headers['user-agent'] || 'unknown',
  };
}

/** Mask sensitive data for logging (show first/last chars) */
export function maskSensitive(value: string, showChars = 4): string {
  if (value.length <= showChars * 2) return '*'.repeat(value.length);
  const start = value.substring(0, showChars);
  const end = value.substring(value.length - showChars);
  const middle = '*'.repeat(Math.min(value.length - showChars * 2, 8));
  return start + middle + end;
}
