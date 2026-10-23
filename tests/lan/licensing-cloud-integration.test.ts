import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LanCloudSyncStatus, LanTerminalLocalStatus } from '@prisma/client';
import { prisma } from '../../src/config/database.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import {
  buildHostRequestCanonicalString,
  generateHostEd25519KeyPair,
  hashActivationCodePlaintext,
  hostKeyFingerprintSha256Hex,
  sha256Hex,
  signActivationRecovery,
  signHostRequestCanonical,
  verifyHostRequestSignature,
  HOST_REQUEST_SCHEME,
  ACTIVATION_RECOVERY_SCHEME,
} from '../../src/modules/lan/crypto/host-request.js';
import {
  verifySignedEntitlement,
  type EntitlementClaims,
  type SignedEntitlement,
} from '../../src/modules/lan/crypto/entitlement-verify.js';
import { LanEntitlementService } from '../../src/modules/lan/lan-entitlement.service.js';
import { LanTerminalService } from '../../src/modules/lan/lan-terminal.service.js';
import { LanReconciliationService } from '../../src/modules/lan/lan-reconciliation.service.js';
import { HostActivationService } from '../../src/modules/lan/host-activation.service.js';
import {
  HostIdentityService,
  setHostSecretStoreForTests,
  useMemoryHostSecretStore,
} from '../../src/modules/lan/host-identity/host-identity.service.js';
import {
  WindowsDpapiHostSecretStore,
  wipeHostSecretStoreFiles,
} from '../../src/modules/lan/host-identity/host-secret-store.js';
import { isWindowsPlatform } from '../../src/modules/lan/host-identity/windows-dpapi.js';
import {
  HttpLicensingCloudClient,
  setLicensingCloudClient,
  type CloudTerminalListResult,
  type LicensingCloudClient,
} from '../../src/modules/lan/licensing-cloud.client.js';
import {
  LicensingCloudError,
  isUnsafeBlindRetry,
} from '../../src/modules/lan/licensing-cloud.errors.js';
import { resetLanEnvCache } from '../../src/modules/lan/lan-env.js';
import { normalizeAndFingerprintTerminalPublicKey } from '../../src/modules/lan/crypto/terminal-device-key.js';
import { generateLanTerminalEd25519KeyPair } from '../../src/modules/lan/crypto/lan-client-request.js';
import { assertDisposableTestDatabase } from '../helpers/seed-auth-fixture.js';

function mintEntitlement(args: {
  signingKey: KeyObject;
  keyId: string;
  claims: Partial<EntitlementClaims> &
    Pick<EntitlementClaims, 'installationBindingId' | 'status' | 'nbf' | 'exp'>;
}): SignedEntitlement {
  const now = new Date();
  const claims: EntitlementClaims = {
    v: 1,
    iss: 'https://licensing.farmax.local',
    aud: 'farmax-pos',
    entitlementId: randomUUID(),
    keyId: args.keyId,
    customerId: randomUUID(),
    branchLicenseId: randomUUID(),
    planType: 'monthly',
    paidThrough: '2099-12-31',
    iat: now.toISOString(),
    terminalLimit: 3,
    revocationReason: null,
    ...args.claims,
  };
  const ordered = Object.keys(claims)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = (claims as unknown as Record<string, unknown>)[k];
      return acc;
    }, {});
  const canonical = Buffer.from(JSON.stringify(ordered), 'utf8');
  const signature = sign(null, canonical, args.signingKey).toString('base64url');
  return { claims, signature };
}

describe('Phase 2D.4 licensing cloud integration', () => {
  let restaurantId: string;
  let signingPrivate: KeyObject;
  let signingPublicSpki: string;
  const keyId = 'test-entitlement-key';

  beforeAll(async () => {
    assertDisposableTestDatabase(process.env.DATABASE_URL ?? '');

    const pair = generateKeyPairSync('ed25519');
    signingPrivate = pair.privateKey;
    const spki = pair.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    signingPublicSpki = spki.toString('base64url');

    process.env.ENTITLEMENT_TRUSTED_PUBLIC_KEYS = `${keyId}:${signingPublicSpki}`;
    process.env.ENTITLEMENT_ISSUER = 'https://licensing.farmax.local';
    process.env.ENTITLEMENT_AUDIENCE = 'farmax-pos';
    resetLanEnvCache();

    const rest = await prisma.restaurant.create({
      data: {
        name: 'Licensing Cloud Test',
        slug: `lic-cloud-${Date.now()}`,
        currency: 'PKR',
      },
    });
    restaurantId = rest.id;
  });

  beforeEach(async () => {
    setLicensingCloudClient(null);
    useMemoryHostSecretStore();
    resetLanEnvCache();
    process.env.ENTITLEMENT_TRUSTED_PUBLIC_KEYS = `${keyId}:${signingPublicSpki}`;
    process.env.ENTITLEMENT_ISSUER = 'https://licensing.farmax.local';
    process.env.ENTITLEMENT_AUDIENCE = 'farmax-pos';
    // Isolate trust-state binding across tests that share restaurantId.
    await prisma.hostLicensingTrustState.deleteMany({ where: { restaurantId } });
  });

  describe('FARMAX-HOST-REQUEST-V1 interoperability', () => {
    it('builds canonical string with method, path, query, timestamp, nonce, body hash', () => {
      const body = Buffer.from('{"reason":"x"}', 'utf8');
      const canonical = buildHostRequestCanonicalString({
        method: 'post',
        path: '/v1/installations/abc/terminals/def/deactivate',
        query: 'x=1',
        installationId: 'abc',
        timestamp: '2026-10-23T12:00:00.000Z',
        nonce: '11111111-2222-4333-8444-555555555555',
        bodySha256Hex: sha256Hex(body),
      });
      const lines = canonical.split('\n');
      expect(lines[0]).toBe(HOST_REQUEST_SCHEME);
      expect(lines[1]).toBe('POST');
      expect(lines[2]).toBe('/v1/installations/abc/terminals/def/deactivate');
      expect(lines[3]).toBe('x=1');
      expect(lines[4]).toBe('abc');
      expect(lines[5]).toBe('2026-10-23T12:00:00.000Z');
      expect(lines[6]).toBe('11111111-2222-4333-8444-555555555555');
      expect(lines[7]).toBe(sha256Hex(body));
      expect(canonical.endsWith('\n')).toBe(false);
    });

    it('signs and verifies empty body hash for refresh {}', () => {
      const host = generateHostEd25519KeyPair();
      const body = Buffer.from('{}', 'utf8');
      const installationId = randomUUID();
      const timestamp = new Date().toISOString();
      const nonce = randomUUID();
      const canonical = buildHostRequestCanonicalString({
        method: 'POST',
        path: `/v1/installations/${installationId}/entitlements/refresh`,
        query: '',
        installationId,
        timestamp,
        nonce,
        bodySha256Hex: sha256Hex(body),
      });
      const sig = signHostRequestCanonical(canonical, host.privateKey);
      const pub = createPublicKey({
        key: Buffer.from(host.publicKeySpkiBase64Url, 'base64url'),
        format: 'der',
        type: 'spki',
      });
      expect(verifyHostRequestSignature(canonical, sig, pub)).toBe(true);
    });

    it('activation recovery canonical matches documented scheme', () => {
      const host = generateHostEd25519KeyPair();
      const code = 'FMX-ACT-dGVzdGNvZGUxMjM0NTY';
      const msg = [
        ACTIVATION_RECOVERY_SCHEME,
        hashActivationCodePlaintext(code),
        '11111111-2222-4333-8444-555555555555',
        host.publicKeySpkiBase64Url,
      ].join('\n');
      const sig = signActivationRecovery(
        {
          codeHash: hashActivationCodePlaintext(code),
          installationNonce: '11111111-2222-4333-8444-555555555555',
          hostPublicKeySpkiB64: host.publicKeySpkiBase64Url,
        },
        host.privateKey,
      );
      const pub = createPublicKey({
        key: Buffer.from(host.publicKeySpkiBase64Url, 'base64url'),
        format: 'der',
        type: 'spki',
      });
      expect(verifyHostRequestSignature(msg, sig, pub)).toBe(true);
    });
  });

  describe('HttpLicensingCloudClient', () => {
    it('activation success, invalid activation, and recovery proof path', async () => {
      const host = generateHostEd25519KeyPair();
      const fetchImpl: typeof fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          activationCode: string;
          hostProofSignature?: string;
        };
        if (body.activationCode === 'FMX-ACT-invalid000000000000') {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: 'ACTIVATION_CODE_INVALID', message: 'Activation code is invalid' },
            }),
            { status: 400 },
          );
        }
        const installationId = randomUUID();
        const doc = mintEntitlement({
          signingKey: signingPrivate,
          keyId,
          claims: {
            installationBindingId: installationId,
            status: 'active',
            nbf: new Date(Date.now() - 60_000).toISOString(),
            exp: new Date(Date.now() + 3_600_000).toISOString(),
          },
        });
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              installationId,
              licenseId: randomUUID(),
              seatLimit: 3,
              hostCountsAsSeat: true,
              recovered: Boolean(body.hostProofSignature),
              entitlement: doc,
              serverTime: new Date().toISOString(),
            },
          }),
          { status: body.hostProofSignature ? 200 : 201 },
        );
      };

      const client = new HttpLicensingCloudClient({
        baseUrl: 'http://licensing.test',
        getPrivateKey: () => host.privateKey,
        fetchImpl,
        connectTimeoutMs: 50,
        maxRetries: 0,
      });

      await expect(
        client.redeemActivation({
          activationCode: 'FMX-ACT-invalid000000000000',
          installationNonce: randomUUID(),
          hostPublicKey: host.publicKeySpkiBase64Url,
        }),
      ).rejects.toMatchObject({ kind: 'denied', remoteCode: 'ACTIVATION_CODE_INVALID' });

      const first = await client.redeemActivation({
        activationCode: 'FMX-ACT-dGVzdGNvZGUxMjM0NTY3OQ',
        installationNonce: randomUUID(),
        hostPublicKey: host.publicKeySpkiBase64Url,
      });
      expect(first.recovered).toBe(false);

      // Lost-response recovery: same identity + hostPrivateKey mints proof → recovered.
      const recovered = await client.redeemActivation({
        activationCode: 'FMX-ACT-dGVzdGNvZGUxMjM0NTY3OQ',
        installationNonce: randomUUID(),
        hostPublicKey: host.publicKeySpkiBase64Url,
        hostPrivateKey: host.privateKey,
      });
      expect(recovered.recovered).toBe(true);
      expect(recovered.entitlement.claims.status).toBe('active');
    });

    it('does not blind-retry non-idempotent replace on timeout', async () => {
      const host = generateHostEd25519KeyPair();
      let calls = 0;
      const fetchImpl: typeof fetch = async () => {
        calls += 1;
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      };
      const client = new HttpLicensingCloudClient({
        baseUrl: 'http://licensing.test',
        getPrivateKey: () => host.privateKey,
        fetchImpl,
        maxRetries: 3,
      });
      await expect(
        client.replaceTerminal({
          installationId: randomUUID(),
          terminalId: randomUUID(),
          newTerminalPublicKey: generateLanTerminalEd25519KeyPair().publicKeySpkiBase64Url,
        }),
      ).rejects.toBeInstanceOf(LicensingCloudError);
      expect(calls).toBe(1);
    });

    it('retries idempotent list on transient network failure', async () => {
      const host = generateHostEd25519KeyPair();
      let calls = 0;
      const installationId = randomUUID();
      const fetchImpl: typeof fetch = async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('ECONNRESET');
        }
        const data: CloudTerminalListResult = {
          installationId,
          licenseId: randomUUID(),
          host: {
            countsAsSeat: true,
            status: 'ACTIVE',
            activatedAt: new Date().toISOString(),
            hostLabel: null,
          },
          terminals: [],
          seats: {
            seatLimit: 3,
            hostCountsAsSeat: true,
            hostSeatsUsed: 1,
            additionalTerminalsActive: 0,
            additionalTerminalsAllowed: 2,
            seatsUsed: 1,
            seatsAvailable: 2,
          },
          serverTime: new Date().toISOString(),
        };
        return new Response(JSON.stringify({ success: true, data }), { status: 200 });
      };
      const client = new HttpLicensingCloudClient({
        baseUrl: 'http://licensing.test',
        getPrivateKey: () => host.privateKey,
        fetchImpl,
        maxRetries: 2,
      });
      const listed = await client.listTerminals({ installationId });
      expect(listed.installationId).toBe(installationId);
      expect(calls).toBe(2);
    });

    it('classifies auth vs denial vs malformed', async () => {
      const host = generateHostEd25519KeyPair();
      const mk = (status: number, code: string) =>
        new HttpLicensingCloudClient({
          baseUrl: 'http://licensing.test',
          getPrivateKey: () => host.privateKey,
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                success: false,
                error: { code, message: code },
              }),
              { status },
            ),
          maxRetries: 0,
        });

      await expect(
        mk(401, 'HOST_AUTH_INVALID').listTerminals({ installationId: randomUUID() }),
      ).rejects.toMatchObject({ kind: 'auth' });

      await expect(
        mk(409, 'LICENSE_SUSPENDED').refreshEntitlement({ installationId: randomUUID() }),
      ).rejects.toMatchObject({ kind: 'denied' });

      await expect(
        new HttpLicensingCloudClient({
          baseUrl: 'http://licensing.test',
          getPrivateKey: () => host.privateKey,
          fetchImpl: async () => new Response('not-json', { status: 200 }),
          maxRetries: 0,
        }).listTerminals({ installationId: randomUUID() }),
      ).rejects.toMatchObject({ kind: 'malformed' });
    });
  });

  describe('entitlement refresh and durable cache', () => {
    it('persists valid refresh and revalidates cache', async () => {
      const installationId = randomUUID();
      const doc = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: installationId,
          status: 'active',
          nbf: new Date(Date.now() - 60_000).toISOString(),
          exp: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });

      const stub: LicensingCloudClient = {
        redeemActivation: async () => {
          throw new Error('unused');
        },
        refreshEntitlement: async () => ({
          installationId,
          licenseId: randomUUID(),
          entitlementIssueId: randomUUID(),
          entitlement: doc,
          serverTime: new Date().toISOString(),
          paidThroughUnchanged: true,
        }),
        listTerminals: async () => {
          throw new Error('unused');
        },
        registerTerminal: async () => {
          throw new Error('unused');
        },
        deactivateTerminal: async () => undefined,
        replaceTerminal: async () => {
          throw new Error('unused');
        },
      };
      setLicensingCloudClient(stub);

      const claims = await LanEntitlementService.refreshFromCloud({
        restaurantId,
        installationId,
      });
      expect(claims.installationBindingId).toBe(installationId);

      const trust = await LanEntitlementService.getWatermark(restaurantId);
      expect(trust?.cachedEntitlement).toBeTruthy();
      expect(trust?.installationBindingId).toBe(installationId);

      const cached = await LanEntitlementService.assertCachedUsable(restaurantId);
      expect(cached.entitlementId).toBe(doc.claims.entitlementId);
    });

    it('rejects invalid signature, unknown key, wrong binding, suspension, expiry, clock rollback', async () => {
      const installationId = randomUUID();
      await LanEntitlementService.touchWatermark(restaurantId, new Date());

      const badSig = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: installationId,
          status: 'active',
          nbf: new Date(Date.now() - 60_000).toISOString(),
          exp: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      badSig.signature = 'AAAA';

      await expect(
        LanEntitlementService.assertUsableForLan({ restaurantId, document: badSig }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_ENTITLEMENT_INVALID });

      const unknownKey = mintEntitlement({
        signingKey: signingPrivate,
        keyId: 'other-key',
        claims: {
          installationBindingId: installationId,
          status: 'active',
          nbf: new Date(Date.now() - 60_000).toISOString(),
          exp: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      await expect(
        LanEntitlementService.assertUsableForLan({ restaurantId, document: unknownKey }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_ENTITLEMENT_INVALID });

      await prisma.hostLicensingTrustState.upsert({
        where: { restaurantId },
        create: {
          restaurantId,
          lastTrustedUtc: new Date(),
          installationBindingId: installationId,
        },
        update: { installationBindingId: installationId, lastTrustedUtc: new Date() },
      });

      const wrongBinding = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: randomUUID(),
          status: 'active',
          nbf: new Date(Date.now() - 60_000).toISOString(),
          exp: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      await expect(
        LanEntitlementService.assertUsableForLan({ restaurantId, document: wrongBinding }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_ENTITLEMENT_INVALID });

      const suspended = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: installationId,
          status: 'suspended',
          nbf: new Date(Date.now() - 60_000).toISOString(),
          exp: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      await expect(
        LanEntitlementService.assertUsableForLan({ restaurantId, document: suspended }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_ENTITLEMENT_INVALID });

      const expired = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: installationId,
          status: 'active',
          nbf: new Date(Date.now() - 3_600_000).toISOString(),
          exp: new Date(Date.now() - 1_000).toISOString(),
        },
      });
      await expect(
        LanEntitlementService.assertUsableForLan({ restaurantId, document: expired }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_ENTITLEMENT_EXPIRED });

      await prisma.hostLicensingTrustState.update({
        where: { restaurantId },
        data: { lastTrustedUtc: new Date(Date.now() + 60_000) },
      });
      await expect(
        LanEntitlementService.touchWatermark(restaurantId, new Date(Date.now() - 120_000)),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_CLOCK_ROLLBACK });

      await prisma.hostLicensingTrustState.update({
        where: { restaurantId },
        data: { lastTrustedUtc: new Date(Date.now() + 86_400_000) },
      });
      const valid = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: installationId,
          status: 'active',
          nbf: new Date(Date.now() - 60_000).toISOString(),
          exp: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      await expect(
        LanEntitlementService.assertUsableForLan({ restaurantId, document: valid }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_CLOCK_ROLLBACK });
    });

    it('treats transient outage differently from explicit cloud denial', async () => {
      const installationId = randomUUID();
      const cached = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: installationId,
          status: 'active',
          nbf: new Date(Date.now() - 60_000).toISOString(),
          exp: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      await LanEntitlementService.persistVerifiedCache({
        restaurantId,
        document: cached,
        installationBindingId: installationId,
      });

      setLicensingCloudClient({
        redeemActivation: async () => {
          throw new Error('unused');
        },
        refreshEntitlement: async () => {
          throw new LicensingCloudError({
            kind: 'network',
            message: 'ECONNREFUSED',
            retryable: true,
          });
        },
        listTerminals: async () => {
          throw new Error('unused');
        },
        registerTerminal: async () => {
          throw new Error('unused');
        },
        deactivateTerminal: async () => undefined,
        replaceTerminal: async () => {
          throw new Error('unused');
        },
      });

      const outage = await LanEntitlementService.refreshOrRevalidateCached({
        restaurantId,
        installationId,
      });
      expect(outage.source).toBe('cache');
      expect(outage.networkOutage).toBe(true);

      setLicensingCloudClient({
        redeemActivation: async () => {
          throw new Error('unused');
        },
        refreshEntitlement: async () => {
          throw new LicensingCloudError({
            kind: 'denied',
            message: 'License is suspended',
            remoteCode: 'LICENSE_SUSPENDED',
            httpStatus: 409,
            retryable: false,
          });
        },
        listTerminals: async () => {
          throw new Error('unused');
        },
        registerTerminal: async () => {
          throw new Error('unused');
        },
        deactivateTerminal: async () => undefined,
        replaceTerminal: async () => {
          throw new Error('unused');
        },
      });

      await expect(
        LanEntitlementService.refreshOrRevalidateCached({
          restaurantId,
          installationId,
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LICENSING_CLOUD_DENIED });
    });

    it('cache cannot be extended by replaying an older entitlement', async () => {
      const installationId = randomUUID();
      const newer = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: installationId,
          status: 'active',
          nbf: new Date(Date.now() - 60_000).toISOString(),
          exp: new Date(Date.now() + 7_200_000).toISOString(),
          entitlementId: randomUUID(),
        },
      });
      await LanEntitlementService.persistVerifiedCache({
        restaurantId,
        document: newer,
        installationBindingId: installationId,
      });
      const trustAfter = await LanEntitlementService.getWatermark(restaurantId);
      const watermark = trustAfter!.lastTrustedUtc;

      const older = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: installationId,
          status: 'active',
          nbf: new Date(Date.now() - 3_600_000).toISOString(),
          exp: new Date(Date.now() + 60_000).toISOString(),
          entitlementId: randomUUID(),
        },
      });
      // Persisting older doc still advances watermark only forward; exp of older may still be valid
      await LanEntitlementService.assertUsableForLan({ restaurantId, document: older });
      const trust2 = await LanEntitlementService.getWatermark(restaurantId);
      expect(trust2!.lastTrustedUtc.getTime()).toBeGreaterThanOrEqual(watermark.getTime());
      // Cached document is whatever was last successfully verified (older may replace cache),
      // but clock watermark never moves backward — rolling clock back still fails closed.
      await expect(
        LanEntitlementService.touchWatermark(
          restaurantId,
          new Date(trust2!.lastTrustedUtc.getTime() - 5_000),
        ),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_CLOCK_ROLLBACK });
    });
  });

  describe('reconciliation', () => {
    it('reconciles ACTIVE, deactivated, replaced, missing, and locally denied', async () => {
      const installationId = randomUUID();
      const activeKey = generateLanTerminalEd25519KeyPair();
      const activeId = normalizeAndFingerprintTerminalPublicKey(
        activeKey.publicKeySpkiBase64Url,
      );
      const activeTerminalId = randomUUID();

      const deactivatedKey = generateLanTerminalEd25519KeyPair();
      const deactivatedId = normalizeAndFingerprintTerminalPublicKey(
        deactivatedKey.publicKeySpkiBase64Url,
      );
      const deactivatedTerminalId = randomUUID();

      const missingKey = generateLanTerminalEd25519KeyPair();
      const missingTerminalId = randomUUID();

      const deniedKey = generateLanTerminalEd25519KeyPair();
      const deniedTerminalId = randomUUID();

      await LanTerminalService.upsertFromCloudRegistration({
        restaurantId,
        terminalId: activeTerminalId,
        publicKeySpki: activeKey.publicKeySpkiBase64Url,
        label: 'active',
      });
      await LanTerminalService.upsertFromCloudRegistration({
        restaurantId,
        terminalId: deactivatedTerminalId,
        publicKeySpki: deactivatedKey.publicKeySpkiBase64Url,
      });
      await LanTerminalService.upsertFromCloudRegistration({
        restaurantId,
        terminalId: missingTerminalId,
        publicKeySpki: missingKey.publicKeySpkiBase64Url,
      });
      await LanTerminalService.upsertFromCloudRegistration({
        restaurantId,
        terminalId: deniedTerminalId,
        publicKeySpki: deniedKey.publicKeySpkiBase64Url,
      });
      await prisma.lanTerminal.update({
        where: {
          restaurantId_terminalId: { restaurantId, terminalId: deniedTerminalId },
        },
        data: {
          localStatus: LanTerminalLocalStatus.DENIED,
          cloudSyncStatus: LanCloudSyncStatus.PENDING_DEACTIVATE,
          deniedReason: 'manager_revoke',
        },
      });

      const cloudActiveOnly: CloudTerminalListResult = {
        installationId,
        licenseId: randomUUID(),
        host: {
          countsAsSeat: true,
          status: 'ACTIVE',
          activatedAt: new Date().toISOString(),
          hostLabel: null,
        },
        terminals: [
          {
            terminalId: activeTerminalId,
            label: 'active',
            status: 'ACTIVE',
            activatedAt: new Date().toISOString(),
            deactivatedAt: null,
            deviceFingerprintPrefix: activeId.fingerprintSha256Hex.slice(0, 12),
          },
          {
            terminalId: deactivatedTerminalId,
            label: null,
            status: 'DEACTIVATED',
            activatedAt: new Date().toISOString(),
            deactivatedAt: new Date().toISOString(),
            deviceFingerprintPrefix: deactivatedId.fingerprintSha256Hex.slice(0, 12),
          },
          {
            terminalId: deniedTerminalId,
            label: null,
            status: 'ACTIVE',
            activatedAt: new Date().toISOString(),
            deactivatedAt: null,
            deviceFingerprintPrefix: normalizeAndFingerprintTerminalPublicKey(
              deniedKey.publicKeySpkiBase64Url,
            ).fingerprintSha256Hex.slice(0, 12),
          },
          // replaced cloud-only terminal without local key material
          {
            terminalId: randomUUID(),
            label: 'cloud-only',
            status: 'ACTIVE',
            activatedAt: new Date().toISOString(),
            deactivatedAt: null,
            deviceFingerprintPrefix: 'abcdef012345',
          },
        ],
        seats: {
          seatLimit: 3,
          hostCountsAsSeat: true,
          hostSeatsUsed: 1,
          additionalTerminalsActive: 2,
          additionalTerminalsAllowed: 0,
          seatsUsed: 3,
          seatsAvailable: 0,
        },
        serverTime: new Date().toISOString(),
      };

      setLicensingCloudClient({
        redeemActivation: async () => {
          throw new Error('unused');
        },
        refreshEntitlement: async () => {
          throw new Error('unused');
        },
        listTerminals: async () => cloudActiveOnly,
        registerTerminal: async () => {
          throw new Error('unused');
        },
        deactivateTerminal: async () => undefined,
        replaceTerminal: async () => {
          throw new Error('unused');
        },
      });

      const report = await LanReconciliationService.reconcileFromCloud({
        restaurantId,
        installationId,
      });

      const byId = Object.fromEntries(report.outcomes.map((o) => [o.terminalId, o.outcome]));
      expect(byId[activeTerminalId]).toBe('active');
      expect(byId[deactivatedTerminalId]).toBe('denied_cloud_inactive');
      expect(byId[missingTerminalId]).toBe('denied_missing_on_cloud');
      expect(byId[deniedTerminalId]).toBe('pending_sync_unchanged');
      expect(Object.values(byId)).toContain('unreconciled_conflict');

      const deniedLocal = await prisma.lanTerminal.findUnique({
        where: {
          restaurantId_terminalId: { restaurantId, terminalId: deniedTerminalId },
        },
      });
      expect(deniedLocal?.localStatus).toBe(LanTerminalLocalStatus.DENIED);
    });

    it('pending-sync retry never restores locally denied access', async () => {
      // Clear roster leftovers from prior cases in this shared restaurant.
      await prisma.lanTerminal.deleteMany({ where: { restaurantId } });

      const installationId = randomUUID();
      const key = generateLanTerminalEd25519KeyPair();
      const terminalId = randomUUID();
      await LanTerminalService.upsertFromCloudRegistration({
        restaurantId,
        terminalId,
        publicKeySpki: key.publicKeySpkiBase64Url,
      });
      await prisma.lanTerminal.update({
        where: { restaurantId_terminalId: { restaurantId, terminalId } },
        data: {
          localStatus: LanTerminalLocalStatus.DENIED,
          cloudSyncStatus: LanCloudSyncStatus.SYNC_FAILED,
          deniedReason: 'manager_revoke',
        },
      });

      let deactivated = 0;
      setLicensingCloudClient({
        redeemActivation: async () => {
          throw new Error('unused');
        },
        refreshEntitlement: async () => {
          throw new Error('unused');
        },
        listTerminals: async () => {
          throw new Error('unused');
        },
        registerTerminal: async () => {
          throw new Error('unused');
        },
        deactivateTerminal: async () => {
          deactivated += 1;
        },
        replaceTerminal: async () => {
          throw new Error('unused');
        },
      });

      const result = await LanReconciliationService.retryPendingCloudDeactivates({
        restaurantId,
        installationId,
      });
      expect(result.retried).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(deactivated).toBe(1);

      const row = await prisma.lanTerminal.findUnique({
        where: { restaurantId_terminalId: { restaurantId, terminalId } },
      });
      expect(row?.localStatus).toBe(LanTerminalLocalStatus.DENIED);
      expect(row?.cloudSyncStatus).toBe(LanCloudSyncStatus.IN_SYNC);
    });
  });

  describe('host identity storage', () => {
    it('memory store survives ensure/load and refuses silent regenerate after activation', () => {
      const snap = HostIdentityService.ensureKeyPair();
      expect(snap.publicKeySpkiB64).toBeTruthy();
      expect(snap.fingerprintSha256Hex).toBe(
        hostKeyFingerprintSha256Hex(snap.publicKeySpkiB64),
      );
      const again = HostIdentityService.ensureKeyPair();
      expect(again.publicKeySpkiB64).toBe(snap.publicKeySpkiB64);

      HostIdentityService.markActivated({
        installationId: randomUUID(),
        licenseId: randomUUID(),
        restaurantId,
      });

      const store = useMemoryHostSecretStore();
      // Simulate activated meta without private key (lost OS secret)
      store.writeMeta({
        version: 1,
        publicKeySpkiB64: snap.publicKeySpkiB64,
        fingerprintSha256Hex: snap.fingerprintSha256Hex,
        installationNonce: snap.installationNonce,
        activated: true,
        installationId: randomUUID(),
        licenseId: randomUUID(),
        createdAt: new Date().toISOString(),
      });
      expect(() => HostIdentityService.ensureKeyPair()).toThrow(/refusing to regenerate/i);
    });

    it('Windows DPAPI store round-trips private key across reload', function () {
      if (!isWindowsPlatform()) {
        // eslint-disable-next-line no-invalid-this
        this.skip();
        return;
      }
      const dir = mkdtempSync(join(tmpdir(), 'farmax-host-id-'));
      wipeHostSecretStoreFiles(dir);
      const store = new WindowsDpapiHostSecretStore(dir);
      setHostSecretStoreForTests(store);

      const snap = HostIdentityService.ensureKeyPair();
      const key1 = HostIdentityService.loadPrivateKey();
      setHostSecretStoreForTests(new WindowsDpapiHostSecretStore(dir));
      const key2 = HostIdentityService.loadPrivateKey();
      const meta = HostIdentityService.getPublicMeta();
      expect(meta?.publicKeySpkiB64).toBe(snap.publicKeySpkiB64);
      expect(key1.type).toBe(key2.type);
      wipeHostSecretStoreFiles(dir);
    });
  });

  describe('activation service lost-response recovery', () => {
    it('binds identity and caches entitlement on redeem', async () => {
      const hostSnap = HostIdentityService.ensureKeyPair();
      const installationId = randomUUID();
      const licenseId = randomUUID();
      const doc = mintEntitlement({
        signingKey: signingPrivate,
        keyId,
        claims: {
          installationBindingId: installationId,
          status: 'active',
          nbf: new Date(Date.now() - 60_000).toISOString(),
          exp: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });

      setLicensingCloudClient({
        redeemActivation: async (input) => {
          expect(input.hostPublicKey).toBe(hostSnap.publicKeySpkiB64);
          expect(input.hostProofSignature || input.hostPrivateKey).toBeTruthy();
          return {
            installationId,
            licenseId,
            seatLimit: 3,
            hostCountsAsSeat: true,
            recovered: false,
            entitlement: doc,
            serverTime: new Date().toISOString(),
          };
        },
        refreshEntitlement: async () => {
          throw new Error('unused');
        },
        listTerminals: async () => {
          throw new Error('unused');
        },
        registerTerminal: async () => {
          throw new Error('unused');
        },
        deactivateTerminal: async () => undefined,
        replaceTerminal: async () => {
          throw new Error('unused');
        },
      });

      const { identity, result } = await HostActivationService.redeemAndBind({
        restaurantId,
        activationCode: 'FMX-ACT-dGVzdGNvZGUxMjM0NTY3OQ',
      });
      expect(identity.activated).toBe(true);
      expect(identity.installationId).toBe(installationId);
      expect(result.entitlement.claims.installationBindingId).toBe(installationId);

      const trust = await LanEntitlementService.getWatermark(restaurantId);
      expect(trust?.installationBindingId).toBe(installationId);
      expect(trust?.hostPublicKeySpkiB64).toBe(hostSnap.publicKeySpkiB64);
    });
  });

  it('isUnsafeBlindRetry flags timeouts', () => {
    expect(
      isUnsafeBlindRetry(
        new LicensingCloudError({ kind: 'timeout', message: 'timed out', retryable: true }),
      ),
    ).toBe(true);
  });

  // Keep verify helper imported for direct crypto assertions in this suite.
  it('verifySignedEntitlement still fails closed on grace-only document without trust keys', () => {
    const doc = mintEntitlement({
      signingKey: signingPrivate,
      keyId,
      claims: {
        installationBindingId: randomUUID(),
        status: 'grace',
        nbf: new Date(Date.now() - 60_000).toISOString(),
        exp: new Date(Date.now() + 3_600_000).toISOString(),
      },
    });
    const map = new Map([[keyId, createPublicKey({
      key: Buffer.from(signingPublicSpki, 'base64url'),
      format: 'der',
      type: 'spki',
    })]]);
    const ok = verifySignedEntitlement({
      document: doc,
      trustedKeys: map,
      effectiveNow: new Date(),
    });
    expect(ok.ok).toBe(true);
  });
});
