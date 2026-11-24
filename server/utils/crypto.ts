import crypto from 'node:crypto';

let ephemeralFallbackKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET?.trim();
  if (secret && secret.length >= 16) {
    return crypto.createHash('sha256').update(secret).digest();
  }
  if (!ephemeralFallbackKey) {
    ephemeralFallbackKey = crypto.randomBytes(32);
  }
  return ephemeralFallbackKey;
}

export function encryptSecret(plaintext: string): {
  encryptedKey: string;
  iv: string;
  authTag: string;
  keyHint: string;
} {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const trimmed = plaintext.trim();
  const keyHint =
    trimmed.length >= 8
      ? `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
      : '••••';

  return {
    encryptedKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyHint,
  };
}

export function decryptSecret(payload: {
  encryptedKey: string;
  iv: string;
  authTag: string;
}): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedKey, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
