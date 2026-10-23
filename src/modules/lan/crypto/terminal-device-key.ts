import { createHash, createPublicKey } from 'node:crypto';

/**
 * Canonical Ed25519 SPKI identity for LAN terminal public keys (Phase 2D.3).
 * Matches licensing-api Phase 2C.1 rules: re-export DER → unpadded base64url + SHA-256 fingerprint.
 */

export type Ed25519SpkiIdentity = {
  publicKeySpkiB64: string;
  fingerprintSha256Hex: string;
  der: Buffer;
};

export function normalizeAndFingerprintTerminalPublicKey(
  spkiEncoding: string,
): Ed25519SpkiIdentity {
  const trimmed = spkiEncoding.trim();
  if (!trimmed || /[\s]/.test(trimmed) || trimmed.includes('-----')) {
    throw new Error('public key must be raw base64url SPKI, not PEM');
  }
  const inputDer = Buffer.from(trimmed, 'base64url');
  if (inputDer.length < 32) {
    throw new Error('public key DER too short');
  }
  let key;
  try {
    key = createPublicKey({ key: inputDer, format: 'der', type: 'spki' });
  } catch {
    throw new Error('public key is not a valid SPKI DER');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('public key must be an Ed25519 SPKI public key');
  }
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer;
  return {
    publicKeySpkiB64: der.toString('base64url'),
    fingerprintSha256Hex: createHash('sha256').update(der).digest('hex'),
    der,
  };
}
