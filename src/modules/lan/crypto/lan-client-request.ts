import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

/**
 * FARMAX-LAN-CLIENT-REQUEST-V1 — Plane B client → host POS request authentication.
 * (Planned LAN routes; not applied to staff JWT login.)
 */

export const LAN_CLIENT_REQUEST_SCHEME = 'FARMAX-LAN-CLIENT-REQUEST-V1' as const;

/** Default max |clientTime - serverTime|; explicit and configurable via env. */
export const DEFAULT_LAN_CLIENT_MAX_SKEW_MS = 300_000;

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function buildLanClientRequestCanonicalString(parts: {
  method: string;
  path: string;
  query: string;
  terminalId: string;
  timestamp: string;
  nonce: string;
  bodySha256Hex: string;
}): string {
  return [
    LAN_CLIENT_REQUEST_SCHEME,
    parts.method.toUpperCase(),
    parts.path,
    parts.query,
    parts.terminalId,
    parts.timestamp,
    parts.nonce,
    parts.bodySha256Hex,
  ].join('\n');
}

export function loadTerminalPublicKeySpkiBase64Url(spkiBase64Url: string): KeyObject {
  const der = Buffer.from(spkiBase64Url, 'base64url');
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export function signLanClientRequestCanonical(
  canonical: string,
  privateKey: KeyObject,
): string {
  return sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64url');
}

export function verifyLanClientRequestSignature(
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

/** Test helper: generate Ed25519 terminal keypair. */
export function generateLanTerminalEd25519KeyPair(): {
  privateKey: KeyObject;
  publicKeySpkiBase64Url: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  return { privateKey, publicKeySpkiBase64Url: spki.toString('base64url') };
}
