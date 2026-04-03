import crypto from "crypto";

const SECRET = process.env.PAYMENT_TOKEN_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "wuipi-payment-secret";

/**
 * Generate a permanent, deterministic payment token for a client.
 * Format: {partnerIdHex}_{hmacFirst16}
 * Same partnerId always produces the same token.
 */
export function generateClientPaymentToken(partnerId: number): string {
  const pidHex = partnerId.toString(16).padStart(8, "0");
  const hmac = crypto.createHmac("sha256", SECRET).update(`client-payment-${partnerId}`).digest("hex").substring(0, 16);
  return `${pidHex}_${hmac}`;
}

/**
 * Verify and extract partnerId from a client payment token.
 * Returns partnerId if valid, null if tampered.
 */
export function verifyClientPaymentToken(token: string): number | null {
  const parts = token.split("_");
  if (parts.length !== 2) return null;

  const [pidHex, signature] = parts;
  const partnerId = parseInt(pidHex, 16);
  if (isNaN(partnerId) || partnerId <= 0) return null;

  // Recompute and verify
  const expectedHmac = crypto.createHmac("sha256", SECRET).update(`client-payment-${partnerId}`).digest("hex").substring(0, 16);
  if (signature !== expectedHmac) return null;

  return partnerId;
}
