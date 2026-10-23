import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { dpapiProtect, dpapiUnprotect, isWindowsPlatform } from '../host-identity/windows-dpapi.js';

/**
 * OS-protected TLS private-key storage (separate from Ed25519 licensing identity).
 * Certificate DER is public and stored as plaintext; private key is DPAPI-protected.
 */

export type HostTlsPublicMeta = {
  version: 1;
  fingerprintSha256Hex: string;
  subject: string;
  notBefore: string;
  notAfter: string;
  createdAt: string;
  rotatedAt?: string;
  /** Prior fingerprint after rotation — clients with this pin must re-pair. */
  previousFingerprintSha256Hex?: string;
};

export interface TlsSecretStore {
  readMeta(): HostTlsPublicMeta | null;
  writeMeta(meta: HostTlsPublicMeta): void;
  storeCertificateDer(der: Buffer): void;
  loadCertificateDer(): Buffer;
  hasCertificate(): boolean;
  storePrivateKeyPkcs8Der(pkcs8Der: Buffer): void;
  loadPrivateKeyPkcs8Der(): Buffer;
  hasPrivateKey(): boolean;
}

export class MemoryTlsSecretStore implements TlsSecretStore {
  private meta: HostTlsPublicMeta | null = null;
  private cert: Buffer | null = null;
  private key: Buffer | null = null;

  readMeta(): HostTlsPublicMeta | null {
    return this.meta ? { ...this.meta } : null;
  }

  writeMeta(meta: HostTlsPublicMeta): void {
    this.meta = { ...meta };
  }

  storeCertificateDer(der: Buffer): void {
    this.cert = Buffer.from(der);
  }

  loadCertificateDer(): Buffer {
    if (!this.cert) throw new Error('TLS certificate not present in memory store');
    return Buffer.from(this.cert);
  }

  hasCertificate(): boolean {
    return this.cert !== null && this.cert.length > 0;
  }

  storePrivateKeyPkcs8Der(pkcs8Der: Buffer): void {
    this.key = Buffer.from(pkcs8Der);
  }

  loadPrivateKeyPkcs8Der(): Buffer {
    if (!this.key) throw new Error('TLS private key not present in memory store');
    return Buffer.from(this.key);
  }

  hasPrivateKey(): boolean {
    return this.key !== null && this.key.length > 0;
  }
}

export class WindowsDpapiTlsSecretStore implements TlsSecretStore {
  private readonly metaPath: string;
  private readonly certPath: string;
  private readonly keyPath: string;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.metaPath = join(directory, 'host-tls.meta.json');
    this.certPath = join(directory, 'host-tls.cer');
    this.keyPath = join(directory, 'host-tls.pkcs8.dpapi');
  }

  readMeta(): HostTlsPublicMeta | null {
    if (!existsSync(this.metaPath)) return null;
    const parsed = JSON.parse(readFileSync(this.metaPath, 'utf8')) as HostTlsPublicMeta;
    if (parsed.version !== 1 || typeof parsed.fingerprintSha256Hex !== 'string') {
      throw new Error('Corrupt TLS certificate metadata');
    }
    return parsed;
  }

  writeMeta(meta: HostTlsPublicMeta): void {
    const tmp = `${this.metaPath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(meta, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, this.metaPath);
  }

  storeCertificateDer(der: Buffer): void {
    const tmp = `${this.certPath}.tmp`;
    writeFileSync(tmp, der, { mode: 0o644 });
    renameSync(tmp, this.certPath);
  }

  loadCertificateDer(): Buffer {
    if (!existsSync(this.certPath)) throw new Error('TLS certificate file missing');
    return readFileSync(this.certPath);
  }

  hasCertificate(): boolean {
    return existsSync(this.certPath);
  }

  storePrivateKeyPkcs8Der(pkcs8Der: Buffer): void {
    if (!isWindowsPlatform()) {
      throw new Error(
        'Refusing to persist TLS private key: OS-protected storage requires Windows DPAPI',
      );
    }
    const protectedBlob = dpapiProtect(pkcs8Der);
    const tmp = `${this.keyPath}.tmp`;
    writeFileSync(tmp, protectedBlob, { mode: 0o600 });
    renameSync(tmp, this.keyPath);
  }

  loadPrivateKeyPkcs8Der(): Buffer {
    if (!existsSync(this.keyPath)) throw new Error('TLS private key file missing');
    return dpapiUnprotect(readFileSync(this.keyPath));
  }

  hasPrivateKey(): boolean {
    return existsSync(this.keyPath);
  }
}

export function resolveHostTlsDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const configDir = env.FARMAX_POS_CONFIG_DIR?.trim();
  if (configDir) return join(configDir, 'host-tls');
  const dataDir = env.FARMAX_POS_DATA_DIR?.trim();
  if (dataDir) return join(dataDir, 'config', 'host-tls');
  return join(process.cwd(), '.farmax-host-tls');
}

export function createDefaultTlsSecretStore(
  env: NodeJS.ProcessEnv = process.env,
): TlsSecretStore {
  if (!isWindowsPlatform()) {
    throw new Error(
      'Host TLS private-key OS protection is implemented for Windows (DPAPI) only. ' +
        'Refusing plaintext storage on this platform.',
    );
  }
  return new WindowsDpapiTlsSecretStore(resolveHostTlsDirectory(env));
}

export function wipeTlsSecretStoreFiles(directory: string): void {
  for (const name of [
    'host-tls.meta.json',
    'host-tls.cer',
    'host-tls.pkcs8.dpapi',
    'host-tls.meta.json.tmp',
    'host-tls.cer.tmp',
    'host-tls.pkcs8.dpapi.tmp',
  ]) {
    const p = join(directory, name);
    if (existsSync(p)) unlinkSync(p);
  }
}
