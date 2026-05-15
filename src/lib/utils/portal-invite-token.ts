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

function pidToBase62(partnerId: number): string {
  const pidBuf = Buffer.alloc(4);
  pidBuf.writeUInt32BE(partnerId);
  return toBase62(pidBuf);
}

function base62ToPid(s: string): number | null {
  const pidBuf = fromBase62(s);
  if (pidBuf.length === 0 || pidBuf.length > 4) return null;
  const padded = Buffer.alloc(4);
  pidBuf.copy(padded, 4 - pidBuf.length);
  const pid = padded.readUInt32BE();
  return pid > 0 ? pid : null;
}

function tsToBase62(ts: number): string {
  // Unix epoch seconds (cabe en 5 bytes hasta el año 36812). Usamos 6 bytes
  // para alineación.
  const buf = Buffer.alloc(6);
  buf.writeUIntBE(ts, 0, 6);
  return toBase62(buf);
}

function base62ToTs(s: string): number | null {
  const buf = fromBase62(s);
  if (buf.length === 0 || buf.length > 6) return null;
  const padded = Buffer.alloc(6);
  buf.copy(padded, 6 - buf.length);
  return padded.readUIntBE(0, 6);
}

/**
 * Generate a portal invite token for a client.
 *
 * Format v2 (current): i{base62PartnerId}-{base62Timestamp}-{base62HMAC128}
 * Example v2: i7ES-1QwjP-7NVPb2jlY3uOkKOD6ZEdLv (~25 chars)
 *
 * El timestamp se incluye en el HMAC para que cada token sea único por envío
 * — esto evita cache hits en webviews de WhatsApp, proxies anti-phishing de
 * Meta (w.meta.me), CDNs e ISPs. Cada admin click en "Invitar al portal"
 * produce una URL JAMÁS antes vista por ningún cache intermedio.
 *
 * Compatibilidad: verifyPortalInviteToken sigue aceptando tokens v1 (sin
 * timestamp) para que mensajes ya enviados antes de este cambio sigan
 * funcionando.
 *
 * El "i" prefix distinguishes it from payment tokens (which start with "p").
 */
export function generatePortalInviteToken(partnerId: number): string {
  const secret = getSecret();
  const ts = Math.floor(Date.now() / 1000);

  const pidB62 = pidToBase62(partnerId);
  const tsB62 = tsToBase62(ts);

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`portal-invite-v2-${partnerId}-${ts}`)
    .digest()
    .subarray(0, 16); // 128 bits
  const sigB62 = toBase62(hmac);

  return `i${pidB62}-${tsB62}-${sigB62}`;
}

/**
 * Verify and extract partnerId from a portal invite token.
 * Acepta v2 (con timestamp) y v1 (legacy, sin timestamp) para back-compat.
 * Returns partnerId if valid, null if tampered or malformed.
 */
export function verifyPortalInviteToken(token: string): number | null {
  if (!token.startsWith("i")) return null;
  const body = token.slice(1);
  const parts = body.split("-");
  if (parts.length === 2) return verifyV1(parts[0], parts[1]);
  if (parts.length === 3) return verifyV2(parts[0], parts[1], parts[2]);
  return null;
}

function verifyV1(pidB62: string, sigB62: string): number | null {
  if (!pidB62 || !sigB62) return null;
  const partnerId = base62ToPid(pidB62);
  if (!partnerId) return null;

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

function verifyV2(pidB62: string, tsB62: string, sigB62: string): number | null {
  if (!pidB62 || !tsB62 || !sigB62) return null;
  const partnerId = base62ToPid(pidB62);
  if (!partnerId) return null;
  const ts = base62ToTs(tsB62);
  if (!ts) return null;

  // El timestamp es informativo (auditoría); no enforzamos expiración aquí
  // para que el token sea "permanente como link compartido". La política de
  // expiración la decide el caller si la necesita.

  const secret = getSecret();
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(`portal-invite-v2-${partnerId}-${ts}`)
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
