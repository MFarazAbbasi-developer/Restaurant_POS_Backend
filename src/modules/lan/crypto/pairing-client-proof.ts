import { createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { normalizeAndFingerprintTerminalPublicKey } from './terminal-device-key.js';

/**
 * Client possession proof during pairing (Phase 2D.7).
 * Proves the joining terminal holds the private key for the presented SPKI
 * without treating the invitation token alone as host trust.
 */

export const LAN_PAIRING_CLIENT_PROOF_SCHEME = 'FARMAX-LAN-PAIRING-CLIENT-PROOF-V1' as const;
export const LAN_PAIRING_STATUS_PROOF_SCHEME = 'FARMAX-LAN-PAIRING-STATUS-PROOF-V1' as const;

/** How long after REDEEMED a client may poll for terminalId (restart / lost response). */
export const LAN_PAIRING_STATUS_LOOKUP_TTL_MS = 48 * 60 * 60 * 1000;

export type PairingClientProofClaims = {
  invitationId: string;
  clientPublicKeySpkiB64: string;
  clientFingerprintSha256Hex: string;
  hostFingerprintSha256Hex: string;
  tlsCertificateFingerprintSha256Hex: string;
};

export type PairingStatusProofClaims = {
  invitationId: string;
  clientFingerprintSha256Hex: string;
};

export function buildPairingClientProofCanonical(claims: PairingClientProofClaims): string {
  return [
    LAN_PAIRING_CLIENT_PROOF_SCHEME,
    claims.invitationId,
    claims.clientFingerprintSha256Hex,
    claims.hostFingerprintSha256Hex,
    claims.tlsCertificateFingerprintSha256Hex,
  ].join('\n');
}

export function buildPairingStatusProofCanonical(claims: PairingStatusProofClaims): string {
  return [
    LAN_PAIRING_STATUS_PROOF_SCHEME,
    claims.invitationId,
    claims.clientFingerprintSha256Hex,
  ].join('\n');
}

export function signPairingClientProof(
  claims: PairingClientProofClaims,
  privateKey: KeyObject,
): string {
  const canonical = buildPairingClientProofCanonical(claims);
  return sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64url');
}

export function verifyPairingClientProof(input: {
  claims: PairingClientProofClaims;
  signatureBase64Url: string;
}): boolean {
  let identity;
  try {
    identity = normalizeAndFingerprintTerminalPublicKey(input.claims.clientPublicKeySpkiB64);
  } catch {
    return false;
  }
  if (identity.fingerprintSha256Hex !== input.claims.clientFingerprintSha256Hex) {
    return false;
  }
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({
      key: identity.der,
      format: 'der',
      type: 'spki',
    });
  } catch {
    return false;
  }
  try {
    const sig = Buffer.from(input.signatureBase64Url, 'base64url');
    const canonical = buildPairingClientProofCanonical({
      ...input.claims,
      clientPublicKeySpkiB64: identity.publicKeySpkiB64,
      clientFingerprintSha256Hex: identity.fingerprintSha256Hex,
    });
    return verify(null, Buffer.from(canonical, 'utf8'), publicKey, sig);
  } catch {
    return false;
  }
}

export function signPairingStatusProof(
  claims: PairingStatusProofClaims,
  privateKey: KeyObject,
): string {
  const canonical = buildPairingStatusProofCanonical(claims);
  return sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64url');
}

export function verifyPairingStatusProof(input: {
  claims: PairingStatusProofClaims;
  clientPublicKeySpkiB64: string;
  signatureBase64Url: string;
}): boolean {
  let identity;
  try {
    identity = normalizeAndFingerprintTerminalPublicKey(input.clientPublicKeySpkiB64);
  } catch {
    return false;
  }
  if (identity.fingerprintSha256Hex !== input.claims.clientFingerprintSha256Hex) {
    return false;
  }
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({
      key: identity.der,
      format: 'der',
      type: 'spki',
    });
  } catch {
    return false;
  }
  try {
    const sig = Buffer.from(input.signatureBase64Url, 'base64url');
    const canonical = buildPairingStatusProofCanonical({
      invitationId: input.claims.invitationId,
      clientFingerprintSha256Hex: identity.fingerprintSha256Hex,
    });
    return verify(null, Buffer.from(canonical, 'utf8'), publicKey, sig);
  } catch {
    return false;
  }
}
