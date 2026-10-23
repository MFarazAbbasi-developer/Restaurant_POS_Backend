import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

/**
 * FARMAX-HOST-REQUEST-V1 — Plane A host → licensing cloud request authentication.
 * Canonical form matches farmax-licensing-api `host-request-crypto.ts` exactly.
 */

export const HOST_REQUEST_SCHEME = 'FARMAX-HOST-REQUEST-V1' as const;
export const ACTIVATION_RECOVERY_SCHEME = 'FARMAX-ACTIVATION-RECOVERY-V1' as const;

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function buildHostRequestCanonicalString(parts: {
  method: string;
  path: string;
  query: string;
  installationId: string;
  timestamp: string;
  nonce: string;
  bodySha256Hex: string;
}): string {
  return [
    HOST_REQUEST_SCHEME,
    parts.method.toUpperCase(),
    parts.path,
    parts.query,
    parts.installationId,
    parts.timestamp,
    parts.nonce,
    parts.bodySha256Hex,
  ].join('\n');
}

export function signHostRequestCanonical(
  canonical: string,
  privateKey: KeyObject,
): string {
  return sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64url');
}

export function verifyHostRequestSignature(
  canonical: string,
  signatureBase64Url: string,
  publicKey: KeyObject,
): boolean {
  try {
    const sig = Buffer.from(signatureBase64Url, 'base64url');
    return verify(null, Buffer.from(canonical, 'utf8'), publicKey, sig);
  } catch {
    return false;
  }
}

export function buildActivationRecoveryMessage(parts: {
  codeHash: string;
  installationNonce: string;
  hostPublicKeySpkiB64: string;
}): string {
  return [
    ACTIVATION_RECOVERY_SCHEME,
    parts.codeHash,
    parts.installationNonce,
    parts.hostPublicKeySpkiB64,
  ].join('\n');
}

export function signActivationRecovery(
  parts: {
    codeHash: string;
    installationNonce: string;
    hostPublicKeySpkiB64: string;
  },
  privateKey: KeyObject,
): string {
  return signHostRequestCanonical(buildActivationRecoveryMessage(parts), privateKey);
}

export function hashActivationCodePlaintext(activationCode: string): string {
  return sha256Hex(Buffer.from(activationCode, 'utf8'));
}

export function loadHostPublicKeySpkiBase64Url(spkiBase64Url: string): KeyObject {
  const der = Buffer.from(spkiBase64Url, 'base64url');
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export function loadHostPrivateKeyPkcs8Der(pkcs8Der: Buffer): KeyObject {
  return createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
}

export function exportHostPublicKeySpkiBase64Url(publicKey: KeyObject): string {
  const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  return der.toString('base64url');
}

export function exportHostPrivateKeyPkcs8Der(privateKey: KeyObject): Buffer {
  return privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
}

export function generateHostEd25519KeyPair(): {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeySpkiBase64Url: string;
  privateKeyPkcs8Der: Buffer;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKey,
    publicKeySpkiBase64Url: exportHostPublicKeySpkiBase64Url(publicKey),
    privateKeyPkcs8Der: exportHostPrivateKeyPkcs8Der(privateKey),
  };
}

export function hostKeyFingerprintSha256Hex(publicKeySpkiBase64Url: string): string {
  const der = Buffer.from(publicKeySpkiBase64Url, 'base64url');
  return sha256Hex(der);
}
