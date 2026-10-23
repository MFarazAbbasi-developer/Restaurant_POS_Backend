import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dpapiProtect, dpapiUnprotect, isWindowsPlatform } from './windows-dpapi.js';

/**
 * OS-protected host private-key storage.
 * Private key material is never written as plaintext on disk.
 */

export type HostIdentityPublicMeta = {
  version: 1;
  publicKeySpkiB64: string;
  fingerprintSha256Hex: string;
  installationNonce: string;
  /** Set after successful cloud activation; never clear by regenerating keys. */
  activated: boolean;
  installationId?: string;
  licenseId?: string;
  restaurantId?: string;
  createdAt: string;
  activatedAt?: string;
};

export interface HostSecretStore {
  readMeta(): HostIdentityPublicMeta | null;
  writeMeta(meta: HostIdentityPublicMeta): void;
  /** Store PKCS#8 DER private key using OS protection. */
  storePrivateKeyPkcs8Der(pkcs8Der: Buffer): void;
  /** Load PKCS#8 DER private key; throws if unavailable. */
  loadPrivateKeyPkcs8Der(): Buffer;
  hasPrivateKey(): boolean;
}

export class MemoryHostSecretStore implements HostSecretStore {
  private meta: HostIdentityPublicMeta | null = null;
  private privateKey: Buffer | null = null;

  readMeta(): HostIdentityPublicMeta | null {
    return this.meta ? { ...this.meta } : null;
  }

  writeMeta(meta: HostIdentityPublicMeta): void {
    this.meta = { ...meta };
  }

  storePrivateKeyPkcs8Der(pkcs8Der: Buffer): void {
    this.privateKey = Buffer.from(pkcs8Der);
  }

  loadPrivateKeyPkcs8Der(): Buffer {
    if (!this.privateKey) {
      throw new Error('Host private key not present in memory store');
    }
    return Buffer.from(this.privateKey);
  }

  hasPrivateKey(): boolean {
    return this.privateKey !== null && this.privateKey.length > 0;
  }
}

/**
 * Windows DPAPI-backed file store under the desktop config directory.
 * Non-Windows platforms refuse to persist (no plaintext fallback).
 */
export class WindowsDpapiHostSecretStore implements HostSecretStore {
  private readonly metaPath: string;
  private readonly keyPath: string;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.metaPath = join(directory, 'host-identity.meta.json');
    this.keyPath = join(directory, 'host-identity.pkcs8.dpapi');
  }

  readMeta(): HostIdentityPublicMeta | null {
    if (!existsSync(this.metaPath)) return null;
    const raw = readFileSync(this.metaPath, 'utf8');
    const parsed = JSON.parse(raw) as HostIdentityPublicMeta;
    if (parsed.version !== 1 || typeof parsed.publicKeySpkiB64 !== 'string') {
      throw new Error('Corrupt host identity metadata');
    }
    return parsed;
  }

  writeMeta(meta: HostIdentityPublicMeta): void {
    const tmp = `${this.metaPath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(meta, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, this.metaPath);
  }

  storePrivateKeyPkcs8Der(pkcs8Der: Buffer): void {
    if (!isWindowsPlatform()) {
      throw new Error(
        'Refusing to persist host private key: OS-protected storage requires Windows DPAPI',
      );
    }
    const protectedBlob = dpapiProtect(pkcs8Der);
    const tmp = `${this.keyPath}.tmp`;
    writeFileSync(tmp, protectedBlob, { mode: 0o600 });
    renameSync(tmp, this.keyPath);
  }

  loadPrivateKeyPkcs8Der(): Buffer {
    if (!existsSync(this.keyPath)) {
      throw new Error('Host private key file missing');
    }
    const blob = readFileSync(this.keyPath);
    return dpapiUnprotect(blob);
  }

  hasPrivateKey(): boolean {
    return existsSync(this.keyPath);
  }
}

/** Resolve store directory from Electron-injected FARMAX_POS_* paths. */
export function resolveHostIdentityDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const configDir = env.FARMAX_POS_CONFIG_DIR?.trim();
  if (configDir) return join(configDir, 'host-identity');
  const dataDir = env.FARMAX_POS_DATA_DIR?.trim();
  if (dataDir) return join(dataDir, 'config', 'host-identity');
  // Dev fallback under cwd — still DPAPI-protected on Windows; never plaintext.
  return join(process.cwd(), '.farmax-host-identity');
}

export function createDefaultHostSecretStore(
  env: NodeJS.ProcessEnv = process.env,
): HostSecretStore {
  if (!isWindowsPlatform()) {
    throw new Error(
      'Host private-key OS protection is implemented for Windows (DPAPI) only. ' +
        'Refusing plaintext storage on this platform.',
    );
  }
  return new WindowsDpapiHostSecretStore(resolveHostIdentityDirectory(env));
}

/** Test helper — wipe files created by WindowsDpapiHostSecretStore. */
export function wipeHostSecretStoreFiles(directory: string): void {
  for (const name of [
    'host-identity.meta.json',
    'host-identity.pkcs8.dpapi',
    'host-identity.meta.json.tmp',
    'host-identity.pkcs8.dpapi.tmp',
  ]) {
    const p = join(directory, name);
    if (existsSync(p)) unlinkSync(p);
  }
  try {
    // leave directory; only remove known files
    void dirname(directory);
  } catch {
    /* ignore */
  }
}
