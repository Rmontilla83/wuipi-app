// ============================================================================
// WUIPI MERCANTIL SDK — AES-128/ECB/PKCS5Padding Encryption
// Based on: github.com/apimercantil/encrypt-examples (Node.js)
// Spec: SecretKey → SHA-256 → first 16 bytes (HEX) → AES-128/ECB
// ============================================================================

import crypto from 'crypto';

const ALGORITHM = 'aes-128-ecb';
const ENCODING_INPUT = 'utf8';
const ENCODING_OUTPUT = 'base64';

/**
 * Derives the AES-128 key from the raw SecretKey.
 * Process: SHA-256 hash → take first 16 bytes → hex encode → use as key bytes
 */
export function deriveKey(secretKey: string): Buffer {
  const hash = crypto.createHash('sha256').update(secretKey, 'utf8').digest();
  const hexString = hash.toString('hex');
  const keyHex = hexString.substring(0, 32);
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts plaintext using AES-128/ECB/PKCS5Padding.
 */
export function encrypt(plaintext: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const cipher = crypto.createCipheriv(ALGORITHM, key, null);
  cipher.setAutoPadding(true);
  let encrypted = cipher.update(plaintext, ENCODING_INPUT, ENCODING_OUTPUT);
  encrypted += cipher.final(ENCODING_OUTPUT);
  return encrypted;
}

/**
 * Decrypts AES-128/ECB/PKCS5Padding ciphertext.
 */
export function decrypt(ciphertext: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, null);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(ciphertext, ENCODING_OUTPUT, ENCODING_INPUT);
  decrypted += decipher.final(ENCODING_INPUT);
  return decrypted;
}

/**
 * Encrypts a JSON object → JSON.stringify → AES encrypt → Base64 string.
 */
export function encryptTransactionData(
  data: Record<string, unknown>,
  secretKey: string
): string {
  const jsonString = JSON.stringify(data);
  return encrypt(jsonString, secretKey);
}

/**
 * Decrypts a base64 transaction data string back to JSON object.
 */
export function decryptTransactionData<T = Record<string, unknown>>(
  encryptedData: string,
  secretKey: string
): T {
  const jsonString = decrypt(encryptedData, secretKey);
  return JSON.parse(jsonString) as T;
}

/**
 * Encrypts a single sensitive field (card number, cédula, phone, etc.)
 */
export function encryptField(value: string, secretKey: string): string {
  return encrypt(value, secretKey);
}

/**
 * Validates that a SecretKey produces a valid AES-128 key.
 */
export function validateSecretKey(secretKey: string): boolean {
  try {
    if (!secretKey) return false;
    const key = deriveKey(secretKey);
    if (key.length !== 16) return false;
    const testPlain = 'WUIPI_KEY_VALIDATION_TEST';
    const encrypted = encrypt(testPlain, secretKey);
    const decrypted = decrypt(encrypted, secretKey);
    return decrypted === testPlain;
  } catch {
    return false;
  }
}
