import { AppError } from '../../../common/errors/app-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { sha256HexOfDer } from '../crypto/host-attestation.js';
import {
  generateSelfSignedHostTlsCredential,
  materializeCredential,
  tlsCredentialToPem,
  type GeneratedTlsCredential,
} from './tls-cert-generate.js';
import {
  createDefaultTlsSecretStore,
  MemoryTlsSecretStore,
  type HostTlsPublicMeta,
  type TlsSecretStore,
} from './tls-secret-store.js';

/**
 * Host TLS certificate lifecycle (Phase 2D.6).
 * Separate from Ed25519 licensing identity — never reuses that key.
 * Never silently regenerates the licensing host identity.
 */

let injectedStore: TlsSecretStore | null = null;

export function setTlsSecretStoreForTests(store: TlsSecretStore | null): void {
  injectedStore = store;
}

export function getTlsSecretStore(): TlsSecretStore {
  if (injectedStore) return injectedStore;
  return createDefaultTlsSecretStore();
}

export type HostTlsSnapshot = {
  fingerprintSha256Hex: string;
  subject: string;
  notBefore: string;
  notAfter: string;
  previousFingerprintSha256Hex?: string;
};

export class TlsCertificateService {
  /**
   * Ensure a TLS credential exists. Does not rotate an existing valid cert.
   * Fail closed on corrupt/mismatched material (does not auto-repair by regenerating
   * while leaving clients with a stale pin — callers must rotate explicitly).
   */
  public static ensureCertificate(): HostTlsSnapshot {
    const store = getTlsSecretStore();
    const meta = store.readMeta();
    if (meta) {
      this.loadValidatedCredential(store, meta);
      return this.toSnapshot(meta);
    }
    return this.persistNewCredential(store, generateSelfSignedHostTlsCredential());
  }

  /** Load active certificate DER (public). */
  public static getCertificateDer(): Buffer {
    const store = getTlsSecretStore();
    const meta = store.readMeta();
    if (!meta) {
      throw new AppError(
        'Host TLS certificate is not provisioned',
        503,
        ErrorCode.LAN_TLS_REQUIRED,
      );
    }
    const cred = this.loadValidatedCredential(store, meta);
    return cred.certificateDer;
  }

  public static getPublicMeta(): HostTlsSnapshot | null {
    const meta = getTlsSecretStore().readMeta();
    return meta ? this.toSnapshot(meta) : null;
  }

  /** PEM material for https.createServer — private key never logged. */
  public static getHttpsCredentials(): { cert: string; key: string; fingerprintSha256Hex: string } {
    const store = getTlsSecretStore();
    const meta = store.readMeta();
    if (!meta) {
      throw new AppError(
        'Host TLS certificate is not provisioned',
        503,
        ErrorCode.LAN_TLS_REQUIRED,
      );
    }
    const cred = this.loadValidatedCredential(store, meta);
    const pem = tlsCredentialToPem(cred);
    return {
      cert: pem.certPem,
      key: pem.keyPem,
      fingerprintSha256Hex: cred.fingerprintSha256Hex,
    };
  }

  /**
   * Rotate to a new certificate. Records previous fingerprint so clients know re-pair is required.
   * Does not touch the Ed25519 licensing host identity.
   * Open pairing invitations bound to the previous TLS pin fail closed on next use
   * (assertBindingsMatchCurrentHost) and should be cancelled via
   * LanPairingInvitationService.invalidateForRotatedTrust after rotation.
   */
  public static rotateCertificate(): HostTlsSnapshot {
    const store = getTlsSecretStore();
    const previous = store.readMeta();
    const generated = generateSelfSignedHostTlsCredential();
    return this.persistNewCredential(store, generated, previous?.fingerprintSha256Hex);
  }

  /**
   * Import a validated credential (tests / recovery). Refuses Ed25519 keys via materializeCredential.
   */
  public static importCredential(input: {
    certificateDer: Buffer;
    privateKeyPkcs8Der: Buffer;
    previousFingerprintSha256Hex?: string;
  }): HostTlsSnapshot {
    const store = getTlsSecretStore();
    const cred = materializeCredential(input.certificateDer, input.privateKeyPkcs8Der);
    return this.persistNewCredential(
      store,
      cred,
      input.previousFingerprintSha256Hex,
    );
  }

  private static loadValidatedCredential(
    store: TlsSecretStore,
    meta: HostTlsPublicMeta,
  ): GeneratedTlsCredential {
    if (!store.hasCertificate() || !store.hasPrivateKey()) {
      throw new AppError(
        'Host TLS certificate or protected private key is missing',
        503,
        ErrorCode.LAN_TLS_REQUIRED,
      );
    }
    let certDer: Buffer;
    let keyDer: Buffer;
    try {
      certDer = store.loadCertificateDer();
      keyDer = store.loadPrivateKeyPkcs8Der();
    } catch {
      throw new AppError(
        'Host TLS protected key or certificate is inaccessible or corrupted',
        503,
        ErrorCode.LAN_TLS_REQUIRED,
      );
    }

    let cred: GeneratedTlsCredential;
    try {
      cred = materializeCredential(certDer, keyDer);
    } catch (err) {
      throw new AppError(
        err instanceof Error ? err.message : 'TLS credential validation failed',
        503,
        ErrorCode.LAN_TLS_REQUIRED,
      );
    }

    if (cred.fingerprintSha256Hex !== meta.fingerprintSha256Hex) {
      throw new AppError(
        'TLS certificate fingerprint does not match stored metadata',
        503,
        ErrorCode.LAN_TLS_REQUIRED,
      );
    }

    const now = Date.now();
    if (cred.notAfter.getTime() <= now) {
      throw new AppError(
        'Host TLS certificate has expired',
        503,
        ErrorCode.LAN_TLS_REQUIRED,
      );
    }
    return cred;
  }

  private static persistNewCredential(
    store: TlsSecretStore,
    cred: GeneratedTlsCredential,
    previousFingerprint?: string,
  ): HostTlsSnapshot {
    store.storePrivateKeyPkcs8Der(cred.privateKeyPkcs8Der);
    store.storeCertificateDer(cred.certificateDer);
    const meta: HostTlsPublicMeta = {
      version: 1,
      fingerprintSha256Hex: cred.fingerprintSha256Hex,
      subject: cred.subject,
      notBefore: cred.notBefore.toISOString(),
      notAfter: cred.notAfter.toISOString(),
      createdAt: new Date().toISOString(),
      ...(previousFingerprint
        ? { previousFingerprintSha256Hex: previousFingerprint, rotatedAt: new Date().toISOString() }
        : {}),
    };
    store.writeMeta(meta);
    return this.toSnapshot(meta);
  }

  private static toSnapshot(meta: HostTlsPublicMeta): HostTlsSnapshot {
    return {
      fingerprintSha256Hex: meta.fingerprintSha256Hex,
      subject: meta.subject,
      notBefore: meta.notBefore,
      notAfter: meta.notAfter,
      ...(meta.previousFingerprintSha256Hex
        ? { previousFingerprintSha256Hex: meta.previousFingerprintSha256Hex }
        : {}),
    };
  }
}

export function useMemoryTlsSecretStore(): MemoryTlsSecretStore {
  const store = new MemoryTlsSecretStore();
  setTlsSecretStoreForTests(store);
  return store;
}

/** Public trust pin material for out-of-band display (QR later) — never includes private keys. */
export function getClientTrustPinMaterial(): {
  tlsCertificateFingerprintSha256Hex: string;
  tlsCertificateDerBase64: string;
  previousTlsFingerprintSha256Hex?: string;
  note: string;
} {
  const der = TlsCertificateService.getCertificateDer();
  const meta = TlsCertificateService.getPublicMeta();
  if (!meta) {
    throw new AppError('TLS certificate not provisioned', 503, ErrorCode.LAN_TLS_REQUIRED);
  }
  return {
    tlsCertificateFingerprintSha256Hex: sha256HexOfDer(der),
    tlsCertificateDerBase64: der.toString('base64'),
    ...(meta.previousFingerprintSha256Hex
      ? { previousTlsFingerprintSha256Hex: meta.previousFingerprintSha256Hex }
      : {}),
    note:
      'Clients must receive this fingerprint out-of-band (pairing QR / host screen). ' +
      'An unauthenticated HTTP endpoint must never bootstrap its own trust. ' +
      'Certificate rotation invalidates prior pins — re-pair required.',
  };
}
