import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Pairing invitation secrets (Phase 2D.7).
 * ≥128 bits CSPRNG; persist only SHA-256 hash. Never log the plaintext token.
 */

export const LAN_PAIRING_PROTOCOL_VERSION = 1 as const;
export const LAN_PAIRING_INVITATION_TTL_MS = 5 * 60 * 1000;
export const LAN_PAIRING_INVITATION_MAX_ATTEMPTS = 5;
/** 16 bytes = 128 bits of entropy (base64url ≈ 22 chars). */
export const LAN_PAIRING_TOKEN_BYTES = 16;

export function generatePairingInvitationToken(): string {
  return randomBytes(LAN_PAIRING_TOKEN_BYTES).toString('base64url');
}

export function hashPairingInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time compare of a presented token against a stored SHA-256 hex hash. */
export function verifyPairingInvitationToken(
  presentedToken: string,
  storedHashSha256Hex: string,
): boolean {
  if (typeof presentedToken !== 'string' || presentedToken.length < 16) {
    return false;
  }
  if (
    typeof storedHashSha256Hex !== 'string' ||
    storedHashSha256Hex.length !== 64 ||
    !/^[0-9a-f]{64}$/i.test(storedHashSha256Hex)
  ) {
    return false;
  }
  const presentedHash = Buffer.from(hashPairingInvitationToken(presentedToken), 'hex');
  const storedHash = Buffer.from(storedHashSha256Hex.toLowerCase(), 'hex');
  if (presentedHash.length !== storedHash.length) return false;
  return timingSafeEqual(presentedHash, storedHash);
}

export function assertInvitationTokenEntropy(token: string): void {
  // base64url of 16 bytes → 22 chars without padding
  const decoded = Buffer.from(token, 'base64url');
  if (decoded.length < LAN_PAIRING_TOKEN_BYTES) {
    throw new Error('Invitation token entropy below 128 bits');
  }
}
