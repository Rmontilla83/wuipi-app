import crypto from "crypto";

// Portal Invite Token — same construction as payment-token.ts but scoped to
// a different secret/namespace. Each token is a PERMANENT pointer to a
// partnerId; consuming it at /portal/invite/[token] generates a fresh
// Supabase Magic Link on the fly. This is what makes the WhatsApp invite
// button work for months, even though Supabase's OTP can't be set above 24h.

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function getSecret(): string {
  // Reuse PAYMENT_TOKEN_SECRET so we don't have to rotate two env vars on
  // every deploy. The internal HMAC string ("portal-invite-v1-...") namespaces
  // this token so it CAN'T be confused with a payment token — even if the
  // payment-token secret leaks, an attacker can't forge a portal-invite token
  // for a different partnerId because the prefix changes the digest.
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
 * Generate a portal invite token for a client.
 * Format: i{base62PartnerId}-{base62HMAC128}
 * Example: i3F9-aB7cD2eF4gH6jK8lM0nO
 *
 * The "i" prefix distinguishes it from payment tokens (which start with "p").
 */
export function generatePortalInviteToken(partnerId: number): string {
  const secret = getSecret();

  const pidBuf = Buffer.alloc(4);
  pidBuf.writeUInt32BE(partnerId);
  const pidB62 = toBase62(pidBuf);

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`portal-invite-v1-${partnerId}`)
    .digest()
    .subarray(0, 16); // 128 bits
  const sigB62 = toBase62(hmac);

  return `i${pidB62}-${sigB62}`;
}

/**
 * Verify and extract partnerId from a portal invite token.
 * Returns partnerId if valid, null if tampered or malformed.
 */
export function verifyPortalInviteToken(token: string): number | null {
  if (!token.startsWith("i")) return null;
  const dashIdx = token.indexOf("-");
  if (dashIdx === -1 || dashIdx !== token.lastIndexOf("-")) return null;

  const pidB62 = token.slice(1, dashIdx);
  const sigB62 = token.slice(dashIdx + 1);
  if (!pidB62 || !sigB62) return null;

  const pidBuf = fromBase62(pidB62);
  if (pidBuf.length === 0 || pidBuf.length > 4) return null;
  const padded = Buffer.alloc(4);
  pidBuf.copy(padded, 4 - pidBuf.length);
  const partnerId = padded.readUInt32BE();
  if (partnerId <= 0) return null;

  const secret = getSecret();
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(`portal-invite-v1-${partnerId}`)
    .digest()
    .subarray(0, 16);
  const expectedB62 = toBase62(expectedHmac);

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
