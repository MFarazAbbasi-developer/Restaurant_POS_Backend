import {
  verifyHostAttestation,
  sha256HexOfDer,
  type SignedHostAttestation,
  type HostAttestationVerifyFailure,
} from './host-attestation.js';
import { hostKeyFingerprintSha256Hex } from './host-request.js';
import { LAN_PAIRING_PROTOCOL_VERSION } from './pairing-invitation-token.js';

/**
 * Out-of-band client trust bootstrap (Phase 2D.7).
 *
 * Expected host fingerprint + TLS pin MUST come from a trusted local/OOB channel
 * (host screen / QR). Never bootstrap trust by fetching a fingerprint from the
 * same untrusted HTTPS connection and automatically trusting it.
 */

export type OutOfBandTrustMaterial = {
  protocolVersion: number;
  invitationId: string;
  /** Expected host Ed25519 fingerprint from OOB channel. */
  hostFingerprintSha256Hex: string;
  /** Expected TLS certificate SHA-256 fingerprint from OOB channel. */
  tlsCertificateFingerprintSha256Hex: string;
  /** Host public key SPKI (from OOB / host screen) used to verify attestation. */
  hostPublicKeySpkiB64: string;
  restaurantId?: string;
  installationBindingId?: string;
  licenseId?: string;
};

export type ClientTrustVerifyFailure =
  | 'UNSUPPORTED_PROTOCOL'
  | 'TLS_PIN_MISMATCH'
  | 'HOST_FINGERPRINT_MISMATCH'
  | 'BINDING_MISMATCH'
  | 'ATTESTATION_INVALID'
  | HostAttestationVerifyFailure;

export type ClientTrustVerifyResult =
  | { ok: true; tlsFingerprintSha256Hex: string; hostFingerprintSha256Hex: string }
  | { ok: false; reason: ClientTrustVerifyFailure; message: string };

/**
 * Verify presented TLS cert + host attestation against OOB pins before sending
 * invitation credentials or accepting host responses as authoritative.
 */
export function verifyClientTrustBootstrap(input: {
  outOfBand: OutOfBandTrustMaterial;
  /** Certificate DER presented by the TLS connection (peer). */
  presentedTlsCertificateDer: Buffer;
  attestation: SignedHostAttestation;
  /** Optional binding claims returned by hello — must match OOB when provided. */
  presentedRestaurantId?: string;
  presentedInstallationBindingId?: string;
  presentedLicenseId?: string;
}): ClientTrustVerifyResult {
  const { outOfBand } = input;

  if (outOfBand.protocolVersion !== LAN_PAIRING_PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: 'UNSUPPORTED_PROTOCOL',
      message: 'Unsupported pairing protocol version',
    };
  }

  if (!input.presentedTlsCertificateDer.length) {
    return {
      ok: false,
      reason: 'TLS_PIN_MISMATCH',
      message: 'No TLS certificate presented',
    };
  }

  const presentedTlsFp = sha256HexOfDer(input.presentedTlsCertificateDer);
  if (presentedTlsFp !== outOfBand.tlsCertificateFingerprintSha256Hex) {
    return {
      ok: false,
      reason: 'TLS_PIN_MISMATCH',
      message: 'Presented TLS certificate does not match out-of-band trust pin',
    };
  }

  const derivedHostFp = hostKeyFingerprintSha256Hex(outOfBand.hostPublicKeySpkiB64);
  if (derivedHostFp !== outOfBand.hostFingerprintSha256Hex) {
    return {
      ok: false,
      reason: 'HOST_FINGERPRINT_MISMATCH',
      message: 'Out-of-band host public key does not match expected host fingerprint',
    };
  }

  if (
    outOfBand.restaurantId &&
    input.presentedRestaurantId &&
    outOfBand.restaurantId !== input.presentedRestaurantId
  ) {
    return {
      ok: false,
      reason: 'BINDING_MISMATCH',
      message: 'Restaurant binding mismatch',
    };
  }
  if (
    outOfBand.installationBindingId &&
    input.presentedInstallationBindingId &&
    outOfBand.installationBindingId !== input.presentedInstallationBindingId
  ) {
    return {
      ok: false,
      reason: 'BINDING_MISMATCH',
      message: 'Installation binding mismatch',
    };
  }
  if (
    outOfBand.licenseId &&
    input.presentedLicenseId &&
    outOfBand.licenseId !== input.presentedLicenseId
  ) {
    return {
      ok: false,
      reason: 'BINDING_MISMATCH',
      message: 'License binding mismatch',
    };
  }

  const att = verifyHostAttestation({
    document: input.attestation,
    hostPublicKeySpkiB64: outOfBand.hostPublicKeySpkiB64,
    expectedInvitationId: outOfBand.invitationId,
    expectedTlsCertificateFingerprintSha256Hex: outOfBand.tlsCertificateFingerprintSha256Hex,
    presentedTlsCertificateDer: input.presentedTlsCertificateDer,
  });

  if (!att.ok) {
    return {
      ok: false,
      reason: att.reason,
      message: att.message,
    };
  }

  if (att.claims.hostFingerprintSha256Hex !== outOfBand.hostFingerprintSha256Hex) {
    return {
      ok: false,
      reason: 'HOST_FINGERPRINT_MISMATCH',
      message: 'Attestation host fingerprint does not match out-of-band pin',
    };
  }

  return {
    ok: true,
    tlsFingerprintSha256Hex: presentedTlsFp,
    hostFingerprintSha256Hex: outOfBand.hostFingerprintSha256Hex,
  };
}

/**
 * Reject the anti-pattern: using the live connection's cert fingerprint as the
 * sole trust pin without an independent OOB expectation.
 */
export function rejectSameConnectionTrustBootstrap(input: {
  hasIndependentOutOfBandTlsPin: boolean;
}): ClientTrustVerifyResult | null {
  if (input.hasIndependentOutOfBandTlsPin) return null;
  return {
    ok: false,
    reason: 'TLS_PIN_MISMATCH',
    message:
      'Refusing to bootstrap trust from the untrusted HTTPS connection alone; ' +
      'TLS fingerprint must come from an out-of-band channel',
  };
}
