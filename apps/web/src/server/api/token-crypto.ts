import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "~/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(env.API_TOKEN_ENCRYPTION_KEY, "base64url");
}

/**
 * Encrypts a plaintext token.
 * Returns a base64url string: iv(12) + ciphertext + authTag(16)
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64url");
}

/**
 * Decrypts a base64url string produced by encryptToken.
 * Throws if tampered or key mismatch.
 */
export function decryptToken(encrypted: string): string {
  const key = getKey();
  const buf = Buffer.from(encrypted, "base64url");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
