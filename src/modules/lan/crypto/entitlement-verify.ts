import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/**
 * Minimal reusable signed-entitlement verification for host LAN routes (Phase 2D.3).
 * There is no prior host entitlement system — this is the first verify boundary.
 *
 * Does NOT implement offline paidThrough / Karachi grace (deferred per Phase 2D.2a).
 * Protected LAN ops fail closed when commercial eligibility cannot be established online.
 */

export type EntitlementStatus = 'active' | 'grace' | 'suspended' | 'revoked';

export interface EntitlementClaims {
  v: number;
  iss: string;
  aud: string;
  entitlementId: string;
  keyId: string;
  customerId: string;
  branchLicenseId: string;
  installationBindingId: string | null;
  planType: 'monthly' | 'lifetime';
  status: EntitlementStatus;
  paidThrough: string | null;
  iat: string;
  nbf: string;
  exp: string;
  terminalLimit: number;
  revocationReason: string | null;
}

export interface SignedEntitlement {
  claims: EntitlementClaims;
  signature: string;
}

export type TrustedPublicKeyMap = Map<string, KeyObject>;

export function parseTrustedPublicKeys(
  csv: string | undefined,
): TrustedPublicKeyMap {
  const map: TrustedPublicKeyMap = new Map();
  if (!csv?.trim()) return map;
  for (const part of csv.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const keyId = trimmed.slice(0, idx);
    const spki = trimmed.slice(idx + 1);
    const der = Buffer.from(spki, 'base64url');
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error(`Trusted key ${keyId} is not Ed25519`);
    }
    map.set(keyId, key);
  }
  return map;
}

function canonicalizeClaimsJson(claims: EntitlementClaims): Buffer {
  const ordered = Object.keys(claims)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = (claims as unknown as Record<string, unknown>)[k];
      return acc;
    }, {});
  return Buffer.from(JSON.stringify(ordered), 'utf8');
}

export type EntitlementVerifyFailure =
  | 'UNKNOWN_KEY'
  | 'BAD_SIGNATURE'
  | 'BAD_ISS'
  | 'BAD_AUD'
  | 'BAD_BINDING'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'MALFORMED'
  | 'CLOCK_ROLLBACK';

export type EntitlementVerifyResult =
  | { ok: true; claims: EntitlementClaims }
  | { ok: false; reason: EntitlementVerifyFailure; message: string };

/**
 * Verify a signed entitlement for host use.
 * @param effectiveNow — use max(wallClock, lastTrustedUtc) so clock rollback cannot extend exp.
 */
export function verifySignedEntitlement(args: {
  document: SignedEntitlement;
  trustedKeys: TrustedPublicKeyMap;
  expectedIssuer?: string;
  expectedAudience?: string;
  expectedInstallationBindingId?: string | null;
  effectiveNow: Date;
}): EntitlementVerifyResult {
  const { document, trustedKeys, effectiveNow } = args;
  const claims = document.claims;
  if (!claims || typeof claims !== 'object') {
    return { ok: false, reason: 'MALFORMED', message: 'Missing claims' };
  }

  const publicKey = trustedKeys.get(claims.keyId);
  if (!publicKey) {
    return { ok: false, reason: 'UNKNOWN_KEY', message: `Unknown keyId: ${claims.keyId}` };
  }

  let sig: Buffer;
  try {
    sig = Buffer.from(document.signature, 'base64url');
  } catch {
    return { ok: false, reason: 'BAD_SIGNATURE', message: 'Malformed signature encoding' };
  }

  const canonical = canonicalizeClaimsJson(claims);
  let valid = false;
  try {
    valid = verify(null, canonical, publicKey, sig);
  } catch {
    valid = false;
  }
  if (!valid) {
    return { ok: false, reason: 'BAD_SIGNATURE', message: 'Entitlement signature invalid' };
  }

  if (args.expectedIssuer && claims.iss !== args.expectedIssuer) {
    return { ok: false, reason: 'BAD_ISS', message: 'Issuer mismatch' };
  }
  if (args.expectedAudience && claims.aud !== args.expectedAudience) {
    return { ok: false, reason: 'BAD_AUD', message: 'Audience mismatch' };
  }

  if (
    args.expectedInstallationBindingId !== undefined &&
    args.expectedInstallationBindingId !== null
  ) {
    if (claims.installationBindingId !== args.expectedInstallationBindingId) {
      return { ok: false, reason: 'BAD_BINDING', message: 'Installation binding mismatch' };
    }
  }

  const nbf = new Date(claims.nbf);
  const exp = new Date(claims.exp);
  if (Number.isNaN(nbf.getTime()) || Number.isNaN(exp.getTime())) {
    return { ok: false, reason: 'MALFORMED', message: 'Invalid nbf/exp' };
  }
  if (effectiveNow < nbf) {
    return { ok: false, reason: 'NOT_YET_VALID', message: 'Entitlement not yet valid' };
  }
  if (effectiveNow >= exp) {
    return { ok: false, reason: 'EXPIRED', message: 'Entitlement document expired' };
  }

  if (claims.status === 'suspended') {
    return { ok: false, reason: 'SUSPENDED', message: 'Entitlement is suspended' };
  }
  if (claims.status === 'revoked') {
    return { ok: false, reason: 'REVOKED', message: 'Entitlement is revoked' };
  }
  if (claims.status !== 'active' && claims.status !== 'grace') {
    return { ok: false, reason: 'MALFORMED', message: 'Unknown entitlement status' };
  }

  return { ok: true, claims };
}
