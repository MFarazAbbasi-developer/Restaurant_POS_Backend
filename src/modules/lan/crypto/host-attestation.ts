import { createHash, createPublicKey, type KeyObject } from 'node:crypto';
import {
  hostKeyFingerprintSha256Hex,
  signHostRequestCanonical,
  verifyHostRequestSignature,
} from './host-request.js';

/**
 * Host attestation document (Phase 2D.5 / 2D.6).
 *
 * Per licensing SECURITY.md: attestation binds invitationId, host fingerprint,
 * server time, and the TLS certificate fingerprint of the active connection.
 * Possession of an Ed25519 host key alone is NOT attestation.
 *
 * Clients are NOT MITM-safe until they validate the expected TLS fingerprint
 * received out-of-band (pairing QR / host screen). An unauthenticated endpoint
 * must never bootstrap its own trust.
 */

export const HOST_ATTESTATION_SCHEME = 'FARMAX-HOST-ATTESTATION-V1' as const;

export type HostAttestationClaims = {
  v: 1;
  scheme: typeof HOST_ATTESTATION_SCHEME;
  invitationId: string;
  hostFingerprintSha256Hex: string;
  serverTime: string;
  /** SHA-256 hex of the TLS certificate DER presented on this connection. */
  tlsCertificateFingerprintSha256Hex: string;
};

export type SignedHostAttestation = {
  claims: HostAttestationClaims;
  signature: string;
};

export type HostAttestationVerifyFailure =
  | 'MALFORMED'
  | 'BAD_SIGNATURE'
  | 'HOST_FINGERPRINT_MISMATCH'
  | 'TLS_FINGERPRINT_MISMATCH'
  | 'INVITATION_MISMATCH'
  | 'SCHEME_MISMATCH';

export type HostAttestationVerifyResult =
  | { ok: true; claims: HostAttestationClaims }
  | { ok: false; reason: HostAttestationVerifyFailure; message: string };

export function sha256HexOfDer(der: Buffer): string {
  return createHash('sha256').update(der).digest('hex');
}

export function buildHostAttestationCanonical(claims: HostAttestationClaims): string {
  return [
    HOST_ATTESTATION_SCHEME,
    claims.invitationId,
    claims.hostFingerprintSha256Hex,
    claims.serverTime,
    claims.tlsCertificateFingerprintSha256Hex,
  ].join('\n');
}

export function signHostAttestation(input: {
  invitationId: string;
  hostPublicKeySpkiB64: string;
  tlsCertificateDer: Buffer;
  privateKey: KeyObject;
  serverTime?: Date;
}): SignedHostAttestation {
  if (!input.tlsCertificateDer.length) {
    throw new Error('TLS certificate DER required for host attestation');
  }
  const claims: HostAttestationClaims = {
    v: 1,
    scheme: HOST_ATTESTATION_SCHEME,
    invitationId: input.invitationId,
    hostFingerprintSha256Hex: hostKeyFingerprintSha256Hex(input.hostPublicKeySpkiB64),
    serverTime: (input.serverTime ?? new Date()).toISOString(),
    tlsCertificateFingerprintSha256Hex: sha256HexOfDer(input.tlsCertificateDer),
  };
  const canonical = buildHostAttestationCanonical(claims);
  return {
    claims,
    signature: signHostRequestCanonical(canonical, input.privateKey),
  };
}

/**
 * Verify attestation using the documented host Ed25519 public key and expected pins.
 * Callers must supply expectedTlsFingerprint from out-of-band trust material — never
 * from the connection alone.
 */
export function verifyHostAttestation(input: {
  document: SignedHostAttestation;
  hostPublicKeySpkiB64: string;
  expectedInvitationId: string;
  expectedTlsCertificateFingerprintSha256Hex: string;
  /** Optional: active connection cert DER — must match claims + expected pin. */
  presentedTlsCertificateDer?: Buffer;
}): HostAttestationVerifyResult {
  const { document } = input;
  const claims = document?.claims;
  if (!claims || typeof document.signature !== 'string') {
    return { ok: false, reason: 'MALFORMED', message: 'Missing attestation claims or signature' };
  }
  if (claims.scheme !== HOST_ATTESTATION_SCHEME || claims.v !== 1) {
    return { ok: false, reason: 'SCHEME_MISMATCH', message: 'Unsupported attestation scheme' };
  }
  if (claims.invitationId !== input.expectedInvitationId) {
    return { ok: false, reason: 'INVITATION_MISMATCH', message: 'Invitation id mismatch' };
  }

  const expectedHostFp = hostKeyFingerprintSha256Hex(input.hostPublicKeySpkiB64);
  if (claims.hostFingerprintSha256Hex !== expectedHostFp) {
    return {
      ok: false,
      reason: 'HOST_FINGERPRINT_MISMATCH',
      message: 'Host fingerprint does not match expected licensing host key',
    };
  }

  if (
    claims.tlsCertificateFingerprintSha256Hex !==
    input.expectedTlsCertificateFingerprintSha256Hex
  ) {
    return {
      ok: false,
      reason: 'TLS_FINGERPRINT_MISMATCH',
      message: 'TLS certificate fingerprint does not match out-of-band trust pin',
    };
  }

  if (input.presentedTlsCertificateDer) {
    const presentedFp = sha256HexOfDer(input.presentedTlsCertificateDer);
    if (presentedFp !== claims.tlsCertificateFingerprintSha256Hex) {
      return {
        ok: false,
        reason: 'TLS_FINGERPRINT_MISMATCH',
        message: 'Presented TLS certificate does not match attestation claims',
      };
    }
  }

  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(input.hostPublicKeySpkiB64, 'base64url'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    return { ok: false, reason: 'MALFORMED', message: 'Invalid host public key' };
  }

  const canonical = buildHostAttestationCanonical(claims);
  if (!verifyHostRequestSignature(canonical, document.signature, publicKey)) {
    return { ok: false, reason: 'BAD_SIGNATURE', message: 'Attestation signature invalid' };
  }

  return { ok: true, claims };
}
