/**
 * AES-256-GCM symmetric encryption for storing CMS credentials.
 *
 * The ENCRYPTION_KEY env var must be a 64-character hex string (32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.ENCRYPTION_KEY || '';

function getKey() {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Encrypt plaintext string.
 * @param {string} plaintext
 * @returns {string} JSON string containing iv, authTag, and ciphertext (all hex)
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex')
  });
}

/**
 * Decrypt an encrypted JSON string produced by encrypt().
 * @param {string} encryptedJson
 * @returns {string} Original plaintext
 */
export function decrypt(encryptedJson) {
  const key = getKey();
  const { iv, authTag, ciphertext } = JSON.parse(encryptedJson);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  return decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8');
}
