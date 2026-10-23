import { randomUUID, type KeyObject } from 'node:crypto';
import { AppError } from '../../../common/errors/app-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import {
  generateHostEd25519KeyPair,
  hostKeyFingerprintSha256Hex,
  loadHostPrivateKeyPkcs8Der,
  loadHostPublicKeySpkiBase64Url,
} from '../crypto/host-request.js';
import {
  createDefaultHostSecretStore,
  type HostIdentityPublicMeta,
  type HostSecretStore,
  MemoryHostSecretStore,
} from './host-secret-store.js';

/**
 * Host Ed25519 identity lifecycle (Plane A).
 * Private key stays in OS-protected storage; never in DB / logs / .env.
 * After activation, identity must not be silently regenerated (would orphan cloud install).
 */

let injectedStore: HostSecretStore | null = null;

export function setHostSecretStoreForTests(store: HostSecretStore | null): void {
  injectedStore = store;
}

export function getHostSecretStore(): HostSecretStore {
  if (injectedStore) return injectedStore;
  return createDefaultHostSecretStore();
}

export type HostIdentitySnapshot = {
  publicKeySpkiB64: string;
  fingerprintSha256Hex: string;
  installationNonce: string;
  activated: boolean;
  installationId?: string;
  licenseId?: string;
  restaurantId?: string;
};

export class HostIdentityService {
  /** Ensure a pre-activation keypair exists; never regenerate once activated. */
  public static ensureKeyPair(): HostIdentitySnapshot {
    const store = getHostSecretStore();
    const existing = store.readMeta();
    if (existing) {
      if (existing.activated && !store.hasPrivateKey()) {
        throw new AppError(
          'Host identity is activated but private key is unavailable; refusing to regenerate',
          503,
          ErrorCode.HOST_IDENTITY_UNAVAILABLE,
        );
      }
      if (!store.hasPrivateKey() && !existing.activated) {
        // Meta without key and not activated — create fresh pair.
        return this.generateAndPersist(store, existing.restaurantId);
      }
      return this.toSnapshot(existing);
    }
    return this.generateAndPersist(store);
  }

  /** Load private key for signing. Fail closed if activated identity cannot be recovered. */
  public static loadPrivateKey(): KeyObject {
    const store = getHostSecretStore();
    const meta = store.readMeta();
    try {
      const der = store.loadPrivateKeyPkcs8Der();
      const key = loadHostPrivateKeyPkcs8Der(der);
      if (key.asymmetricKeyType !== 'ed25519') {
        throw new Error('not ed25519');
      }
      return key;
    } catch (err) {
      const activated = Boolean(meta?.activated);
      throw new AppError(
        activated
          ? 'Activated host private key cannot be loaded from OS-protected storage'
          : 'Host private key is not available',
        503,
        ErrorCode.HOST_IDENTITY_UNAVAILABLE,
        true,
        { activated },
      );
    }
  }

  public static getPublicMeta(): HostIdentitySnapshot | null {
    const meta = getHostSecretStore().readMeta();
    return meta ? this.toSnapshot(meta) : null;
  }

  public static getPublicKey(): KeyObject {
    const meta = this.ensureKeyPair();
    return loadHostPublicKeySpkiBase64Url(meta.publicKeySpkiB64);
  }

  /**
   * Record successful cloud activation binding.
   * Does not rotate keys.
   */
  public static markActivated(input: {
    installationId: string;
    licenseId: string;
    restaurantId: string;
  }): HostIdentitySnapshot {
    const store = getHostSecretStore();
    const meta = store.readMeta();
    if (!meta || !store.hasPrivateKey()) {
      throw new AppError(
        'Cannot mark host activated without a durable identity',
        503,
        ErrorCode.HOST_IDENTITY_UNAVAILABLE,
      );
    }
    if (
      meta.activated &&
      meta.installationId &&
      meta.installationId !== input.installationId
    ) {
      throw new AppError(
        'Host is already bound to a different installation; rebind is not supported',
        409,
        ErrorCode.CONFLICT,
      );
    }
    const next: HostIdentityPublicMeta = {
      ...meta,
      activated: true,
      installationId: input.installationId,
      licenseId: input.licenseId,
      restaurantId: input.restaurantId,
      activatedAt: meta.activatedAt ?? new Date().toISOString(),
    };
    store.writeMeta(next);
    return this.toSnapshot(next);
  }

  /** Import an existing keypair (recovery / migration tests). Refuses overwrite of activated identity. */
  public static importKeyPair(input: {
    privateKeyPkcs8Der: Buffer;
    publicKeySpkiB64: string;
    installationNonce?: string;
    restaurantId?: string;
  }): HostIdentitySnapshot {
    const store = getHostSecretStore();
    const existing = store.readMeta();
    if (existing?.activated) {
      throw new AppError(
        'Refusing to import over an activated host identity',
        409,
        ErrorCode.CONFLICT,
      );
    }
    const privateKey = loadHostPrivateKeyPkcs8Der(input.privateKeyPkcs8Der);
    if (privateKey.asymmetricKeyType !== 'ed25519') {
      throw new AppError('Host private key must be Ed25519', 400, ErrorCode.BAD_REQUEST);
    }
    const fingerprint = hostKeyFingerprintSha256Hex(input.publicKeySpkiB64);
    const meta: HostIdentityPublicMeta = {
      version: 1,
      publicKeySpkiB64: input.publicKeySpkiB64,
      fingerprintSha256Hex: fingerprint,
      installationNonce: input.installationNonce ?? randomUUID(),
      activated: false,
      createdAt: new Date().toISOString(),
      ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
    };
    store.storePrivateKeyPkcs8Der(input.privateKeyPkcs8Der);
    store.writeMeta(meta);
    return this.toSnapshot(meta);
  }

  private static generateAndPersist(
    store: HostSecretStore,
    restaurantId?: string,
  ): HostIdentitySnapshot {
    const pair = generateHostEd25519KeyPair();
    const meta: HostIdentityPublicMeta = {
      version: 1,
      publicKeySpkiB64: pair.publicKeySpkiBase64Url,
      fingerprintSha256Hex: hostKeyFingerprintSha256Hex(pair.publicKeySpkiBase64Url),
      installationNonce: randomUUID(),
      activated: false,
      createdAt: new Date().toISOString(),
      ...(restaurantId ? { restaurantId } : {}),
    };
    store.storePrivateKeyPkcs8Der(pair.privateKeyPkcs8Der);
    store.writeMeta(meta);
    return this.toSnapshot(meta);
  }

  private static toSnapshot(meta: HostIdentityPublicMeta): HostIdentitySnapshot {
    return {
      publicKeySpkiB64: meta.publicKeySpkiB64,
      fingerprintSha256Hex: meta.fingerprintSha256Hex,
      installationNonce: meta.installationNonce,
      activated: meta.activated,
      ...(meta.installationId ? { installationId: meta.installationId } : {}),
      ...(meta.licenseId ? { licenseId: meta.licenseId } : {}),
      ...(meta.restaurantId ? { restaurantId: meta.restaurantId } : {}),
    };
  }
}

/** Convenience for unit tests that need an in-memory store without DPAPI. */
export function useMemoryHostSecretStore(): MemoryHostSecretStore {
  const store = new MemoryHostSecretStore();
  setHostSecretStoreForTests(store);
  return store;
}
