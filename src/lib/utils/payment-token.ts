import crypto from "crypto";

// Base62 alphabet (URL-safe, no special chars)
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function getSecret(): string {
  const secret = process.env.PAYMENT_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "PAYMENT_TOKEN_SECRET env var is required (min 32 chars). " +
      "Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return secret;
}

function toBase62(buf: Buffer): string {
  let n = BigInt("0x" + buf.toString("hex"));
  if (n === 0n) return "0";
  let result = "";
  while (n > 0n) {
    result = B62[Number(n % 62n)] + result;
    n = n / 62n;
  }
  return result;
}

function fromBase62(str: string): Buffer {
  let n = 0n;
  for (const c of str) {
    const idx = B62.indexOf(c);
    if (idx === -1) return Buffer.alloc(0);
    n = n * 62n + BigInt(idx);
  }
  const hex = n.toString(16);
  const padded = hex.length % 2 ? "0" + hex : hex;
  return Buffer.from(padded, "hex");
}

/**
 * Generate a short, URL-friendly payment token for a client.
 *
 * Format: p{base62PartnerId}-{base62HMAC128}
 * Example: p3F9-xK7mW2qR4aBcDeFg  (~22 chars total)
 *
 * Compared to old format (00012345_a1b2c3d4e5f6g7h8 = 25 chars):
 * - Shorter and cleaner URL
 * - 128-bit HMAC (vs 64-bit old) — 2^64 times harder to brute force
 * - Timing-safe comparison
 * - Required secret (no insecure fallback)
 */
export function generateClientPaymentToken(partnerId: number): string {
  const secret = getSecret();

  const pidBuf = Buffer.alloc(4);
  pidBuf.writeUInt32BE(partnerId);
  const pidB62 = toBase62(pidBuf);

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`client-payment-v2-${partnerId}`)
    .digest()
    .subarray(0, 16); // 128 bits
  const sigB62 = toBase62(hmac);

  return `p${pidB62}-${sigB62}`;
}

/**
 * Verify and extract partnerId from a client payment token.
 * Returns partnerId if valid, null if tampered or malformed.
 */
export function verifyClientPaymentToken(token: string): number | null {
  // Validate basic format: starts with "p", has exactly one "-"
  if (!token.startsWith("p")) return null;
  const dashIdx = token.indexOf("-");
  if (dashIdx === -1 || dashIdx !== token.lastIndexOf("-")) return null;

  const pidB62 = token.slice(1, dashIdx);
  const sigB62 = token.slice(dashIdx + 1);
  if (!pidB62 || !sigB62) return null;

  // Decode partnerId
  const pidBuf = fromBase62(pidB62);
  if (pidBuf.length === 0 || pidBuf.length > 4) return null;
  const padded = Buffer.alloc(4);
  pidBuf.copy(padded, 4 - pidBuf.length);
  const partnerId = padded.readUInt32BE();
  if (partnerId <= 0) return null;

  // Recompute expected HMAC
  const secret = getSecret();
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(`client-payment-v2-${partnerId}`)
    .digest()
    .subarray(0, 16);
  const expectedB62 = toBase62(expectedHmac);

  // Timing-safe comparison
  try {
    const sig = Buffer.from(sigB62, "utf8");
    const expected = Buffer.from(expectedB62, "utf8");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(sig, expected)) return null;
  } catch {
    return null;
  }

  return partnerId;
}
