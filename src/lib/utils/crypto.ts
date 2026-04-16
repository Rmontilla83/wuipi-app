// ============================================
// AES-256-GCM encryption for storing passwords
// ============================================
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.BEQUANT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("BEQUANT_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt plaintext → "iv:tag:ciphertext" (all base64) */
export function encryptPassword(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

/** Decrypt "iv:tag:ciphertext" → plaintext */
export function decryptPassword(encoded: string): string {
  const key = getKey();
  const [ivB64, tagB64, cipherB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !cipherB64) throw new Error("Invalid encrypted password format");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
