import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { signHostAttestation, type SignedHostAttestation } from './crypto/host-attestation.js';
import { HostIdentityService } from './host-identity/host-identity.service.js';
import { TlsCertificateService } from './tls/tls-certificate.service.js';

/**
 * Remote pairing / TLS gate (Phase 2D.5–2D.9).
 *
 * Loopback HTTPS + pairing protocol (hello/complete/status/approve) may run when
 * the host is activated and TLS is provisioned.
 *
 * Non-loopback remote exposure stays DISABLED until ALL of:
 * 1. Feature readiness latch REMOTE_LAN_EXPOSURE_READY === true (code change after
 *    proven two-machine pilot — never flip casually for tests)
 * 2. Explicit operator env FARMAX_POS_ALLOW_REMOTE_LAN=1
 * 3. Valid TLS material
 * 4. Activated host identity with installation/license binding
 * 5. Pairing protocol ready (trust flow complete enough for local pairing)
 *
 * Missing any prerequisite → loopback-only. Never opens firewall ports from code.
 * See docs/LAN_HOST_FOUNDATION.md § Remote exposure.
 */

/**
 * Hard latch: stays false until a real two-machine pilot is completed and
 * documented. Env alone must not open non-loopback listeners.
 */
/** Hard latch — typed as boolean so enablement path typechecks when flipped after pilot. */
export const REMOTE_LAN_EXPOSURE_READY: boolean = false;

/** Test override — does not enable pairing by itself. */
let tlsCertificateDerOverride: Buffer | null = null;

/** Test override for protocol readiness (null = derive from TLS + host identity). */
let pairingProtocolReadyOverride: boolean | null = null;

export function setLanTlsCertificateDer(der: Buffer | null): void {
  tlsCertificateDerOverride = der && der.length > 0 ? Buffer.from(der) : null;
}

export function getLanTlsCertificateDer(): Buffer | null {
  if (tlsCertificateDerOverride) return Buffer.from(tlsCertificateDerOverride);
  try {
    return TlsCertificateService.getCertificateDer();
  } catch {
    return null;
  }
}

export function setLanPairingProtocolReadyForTests(ready: boolean | null): void {
  pairingProtocolReadyOverride = ready;
}

export type RemoteExposureGateSnapshot = {
  remoteLanPairingEnabled: boolean;
  httpsLoopbackOnly: boolean;
  featureReadyLatch: boolean;
  operatorAllowEnv: boolean;
  tlsProvisioned: boolean;
  hostActivated: boolean;
  pairingProtocolReady: boolean;
  blockingReasons: string[];
};

/**
 * Evaluate remote-exposure prerequisites without enabling anything.
 * Used by host status UI and operator diagnostics.
 */
export function evaluateRemoteExposureGate(): RemoteExposureGateSnapshot {
  const featureReadyLatch = REMOTE_LAN_EXPOSURE_READY === true;
  const operatorAllowEnv = process.env.FARMAX_POS_ALLOW_REMOTE_LAN === '1';
  const tlsProvisioned = Boolean(getLanTlsCertificateDer());
  const identity = HostIdentityService.getPublicMeta();
  const hostActivated = Boolean(
    identity?.activated && identity.installationId && identity.licenseId,
  );
  const pairingProtocolReady = isLanPairingProtocolReady();

  const blockingReasons: string[] = [];
  if (!featureReadyLatch) {
    blockingReasons.push(
      'feature_ready_latch_false (two-machine pilot not marked complete in code)',
    );
  }
  if (!operatorAllowEnv) {
    blockingReasons.push('FARMAX_POS_ALLOW_REMOTE_LAN is not 1');
  }
  if (!tlsProvisioned) blockingReasons.push('tls_certificate_missing');
  if (!hostActivated) blockingReasons.push('host_not_activated');
  if (!pairingProtocolReady) blockingReasons.push('pairing_protocol_not_ready');

  const remoteLanPairingEnabled = blockingReasons.length === 0;
  return {
    remoteLanPairingEnabled,
    httpsLoopbackOnly: !remoteLanPairingEnabled,
    featureReadyLatch,
    operatorAllowEnv,
    tlsProvisioned,
    hostActivated,
    pairingProtocolReady,
    blockingReasons,
  };
}

/**
 * Non-loopback remote LAN pairing / binding.
 * Default false. Env alone cannot enable while REMOTE_LAN_EXPOSURE_READY is false.
 */
export function isRemoteLanPairingEnabled(): boolean {
  return evaluateRemoteExposureGate().remoteLanPairingEnabled;
}

/**
 * True when the pairing protocol may accept hello/complete/status/approve locally.
 * Requires provisioned TLS + activated host identity. Does NOT enable non-loopback bind.
 */
export function isLanPairingProtocolReady(): boolean {
  if (pairingProtocolReadyOverride !== null) return pairingProtocolReadyOverride;
  if (!getLanTlsCertificateDer()) return false;
  const identity = HostIdentityService.getPublicMeta();
  return Boolean(identity?.activated && identity.installationId && identity.licenseId);
}

export function assertLanPairingProtocolReady(): void {
  if (!isLanPairingProtocolReady()) {
    throw new AppError(
      'LAN pairing protocol is not ready: activated host identity and TLS certificate required',
      503,
      ErrorCode.LAN_PAIRING_DISABLED,
    );
  }
}

export function assertRemotePairingAllowed(): void {
  const gate = evaluateRemoteExposureGate();
  if (!gate.remoteLanPairingEnabled) {
    throw new AppError(
      `Remote LAN pairing is disabled: ${gate.blockingReasons.join('; ') || 'prerequisites unmet'}`,
      503,
      ErrorCode.LAN_PAIRING_DISABLED,
    );
  }
  if (!getLanTlsCertificateDer()) {
    throw new AppError(
      'Remote LAN pairing requires a provisioned TLS server certificate',
      503,
      ErrorCode.LAN_TLS_REQUIRED,
    );
  }
  assertLanPairingProtocolReady();
}

/**
 * Build a signed host attestation bound to the active TLS certificate and
 * licensing host Ed25519 identity. Requires provisioned TLS material.
 */
export function createHostAttestationOrThrow(input: {
  invitationId: string;
}): SignedHostAttestation {
  const cert = getLanTlsCertificateDer();
  if (!cert) {
    throw new AppError(
      'Cannot issue host attestation without a TLS certificate fingerprint binding',
      503,
      ErrorCode.LAN_TLS_REQUIRED,
    );
  }
  const identity = HostIdentityService.ensureKeyPair();
  const privateKey = HostIdentityService.loadPrivateKey();
  return signHostAttestation({
    invitationId: input.invitationId,
    hostPublicKeySpkiB64: identity.publicKeySpkiB64,
    tlsCertificateDer: cert,
    privateKey,
  });
}
