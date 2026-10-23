import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { LanCloudSyncStatus, LanTerminalLocalStatus } from '@prisma/client';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import {
  buildLanClientRequestCanonicalString,
  generateLanTerminalEd25519KeyPair,
  sha256Hex,
  signLanClientRequestCanonical,
} from '../../src/modules/lan/crypto/lan-client-request.js';
import {
  type EntitlementClaims,
  type SignedEntitlement,
} from '../../src/modules/lan/crypto/entitlement-verify.js';
import { LanEntitlementService } from '../../src/modules/lan/lan-entitlement.service.js';
import { LanTerminalService } from '../../src/modules/lan/lan-terminal.service.js';
import {
  bootstrapLicensingAndLanRuntime,
  runLicensingStartup,
} from '../../src/modules/lan/licensing-lifecycle.js';
import {
  configureLanRuntimeForTests,
  getLanRuntime,
  resetLanRuntimeForTests,
} from '../../src/modules/lan/lan-runtime.js';
import {
  HostIdentityService,
  useMemoryHostSecretStore,
} from '../../src/modules/lan/host-identity/host-identity.service.js';
import {
  createHostAttestationOrThrow,
  isRemoteLanPairingEnabled,
  setLanTlsCertificateDer,
} from '../../src/modules/lan/lan-pairing-gate.js';
import { setLicensingCloudClient } from '../../src/modules/lan/licensing-cloud.client.js';
import { LicensingCloudError } from '../../src/modules/lan/licensing-cloud.errors.js';
import { resetLanEnvCache } from '../../src/modules/lan/lan-env.js';
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
  const signature = sign(
    null,
    Buffer.from(JSON.stringify(ordered), 'utf8'),
    args.signingKey,
  ).toString('base64url');
  return { claims, signature };
}

function signLan(
  privateKey: KeyObject,
  args: {
    terminalId: string;
    method?: string;
    path: string;
    rawBody?: string;
    timestamp?: string;
    nonce?: string;
  },
): Record<string, string> {
  const timestamp = args.timestamp ?? new Date().toISOString();
  const nonce = args.nonce ?? randomUUID();
  const method = args.method ?? 'GET';
  const rawBody = args.rawBody ?? '';
  const canonical = buildLanClientRequestCanonicalString({
    method,
    path: args.path,
    query: '',
    terminalId: args.terminalId,
    timestamp,
    nonce,
    bodySha256Hex: sha256Hex(Buffer.from(rawBody, 'utf8')),
  });
  return {
    'X-Farmax-Terminal-Id': args.terminalId,
    'X-Farmax-Timestamp': timestamp,
    'X-Farmax-Nonce': nonce,
    'X-Farmax-Signature': signLanClientRequestCanonical(canonical, privateKey),
    'Content-Type': 'application/json',
  };
}

describe('Phase 2D.5 LAN runtime wiring and enforcement', () => {
  let restaurantId: string;
  let otherRestaurantId: string;
  let signingPrivate: KeyObject;
  let signingPublicSpki: string;
  const keyId = 'test-entitlement-key-2d5';
  let cashierUsername: string;
  let cashierPin: string;

  beforeAll(async () => {
    assertDisposableTestDatabase(process.env.DATABASE_URL ?? '');

    const pair = generateKeyPairSync('ed25519');
    signingPrivate = pair.privateKey;
    signingPublicSpki = (
      pair.publicKey.export({ type: 'spki', format: 'der' }) as Buffer
    ).toString('base64url');

    process.env.ENTITLEMENT_TRUSTED_PUBLIC_KEYS = `${keyId}:${signingPublicSpki}`;
    process.env.ENTITLEMENT_ISSUER = 'https://licensing.farmax.local';
    process.env.ENTITLEMENT_AUDIENCE = 'farmax-pos';
    resetLanEnvCache();

    const rest = await prisma.restaurant.create({
      data: {
        name: 'LAN Runtime Test',
        slug: `lan-runtime-${Date.now()}`,
        currency: 'PKR',
      },
    });
    restaurantId = rest.id;

    const other = await prisma.restaurant.create({
      data: {
        name: 'Other Branch',
        slug: `lan-other-${Date.now()}`,
        currency: 'PKR',
        isActive: false,
      },
    });
    otherRestaurantId = other.id;

    await prisma.permission.upsert({
      where: { key: 'orders.view' },
      create: { key: 'orders.view', description: 'View orders' },
      update: {},
    });
    const ordersView = await prisma.permission.findUniqueOrThrow({
      where: { key: 'orders.view' },
    });
    const role = await prisma.role.create({
      data: {
        restaurantId,
        name: 'LAN_RT_CASHIER_' + Date.now(),
        rolePermissions: { create: [{ permissionId: ordersView.id }] },
      },
    });
    cashierPin = '4321';
    cashierUsername = `lanrt_cash_${Date.now()}`;
    await prisma.user.create({
      data: {
        restaurantId,
        name: 'LAN RT Cashier',
        username: cashierUsername,
        pinHash: await bcrypt.hash(cashierPin, 10),
        userRoles: { create: [{ roleId: role.id }] },
      },
    });
  });

  beforeEach(async () => {
    resetLanRuntimeForTests();
    useMemoryHostSecretStore();
    setLicensingCloudClient(null);
    setLanTlsCertificateDer(null);
    resetLanEnvCache();
    process.env.ENTITLEMENT_TRUSTED_PUBLIC_KEYS = `${keyId}:${signingPublicSpki}`;
    process.env.ENTITLEMENT_ISSUER = 'https://licensing.farmax.local';
    process.env.ENTITLEMENT_AUDIENCE = 'farmax-pos';
    delete process.env.LAN_DEFAULT_RESTAURANT_ID;
    await prisma.hostLicensingTrustState.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.lanTerminalRequestNonce.deleteMany({ where: { restaurantId } });
    await prisma.lanTerminal.deleteMany({ where: { restaurantId } });
  });

  async function seedActiveEntitlement(installationId = randomUUID()) {
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
    await LanEntitlementService.persistVerifiedCache({
      restaurantId,
      document: doc,
      installationBindingId: installationId,
    });
    return { installationId, doc };
  }

  async function seedActiveTerminal() {
    const keys = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
    });
    return { keys, terminalId };
  }

  describe('startup restaurant binding', () => {
    it('binds via activated host identity restaurant, not env', async () => {
      const installationId = randomUUID();
      await seedActiveEntitlement(installationId);
      HostIdentityService.ensureKeyPair();
      HostIdentityService.markActivated({
        installationId,
        licenseId: randomUUID(),
        restaurantId,
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
          throw new LicensingCloudError({
            kind: 'network',
            message: 'ECONNREFUSED',
            retryable: true,
          });
        },
        registerTerminal: async () => {
          throw new Error('unused');
        },
        deactivateTerminal: async () => undefined,
        replaceTerminal: async () => {
          throw new Error('unused');
        },
      });

      process.env.LAN_DEFAULT_RESTAURANT_ID = otherRestaurantId;
      resetLanEnvCache();

      const snap = await bootstrapLicensingAndLanRuntime();
      expect(snap.setupComplete).toBe(true);
      expect(snap.restaurantId).toBe(restaurantId);
      expect(snap.hostActivated).toBe(true);
      expect(snap.lanEnabled).toBe(true);
      expect(getLanRuntime().restaurantId).toBe(restaurantId);
    });

    it('fails closed when activated host restaurant is missing/inactive (data preserved)', async () => {
      HostIdentityService.ensureKeyPair();
      HostIdentityService.markActivated({
        installationId: randomUUID(),
        licenseId: randomUUID(),
        restaurantId: otherRestaurantId, // inactive
      });

      const snap = await bootstrapLicensingAndLanRuntime();
      expect(snap.lanEnabled).toBe(false);
      expect(snap.disabledReason).toMatch(/activated_host_restaurant_missing_or_inactive|restaurant_identity_mismatch/);
      const still = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
      expect(still).toBeTruthy();
      const other = await prisma.restaurant.findUnique({ where: { id: otherRestaurantId } });
      expect(other).toBeTruthy();
    });

    it('does not treat LAN_DEFAULT_RESTAURANT_ID as authoritative binding', async () => {
      process.env.LAN_DEFAULT_RESTAURANT_ID = otherRestaurantId;
      resetLanEnvCache();
      // Prefer trust binding for our restaurant over the env UUID.
      await prisma.hostLicensingTrustState.create({
        data: {
          restaurantId,
          lastTrustedUtc: new Date(),
          installationBindingId: randomUUID(),
        },
      });
      const snap = await bootstrapLicensingAndLanRuntime();
      expect(snap.restaurantId).toBe(restaurantId);
      expect(snap.lanEnabled).toBe(false);
      expect(snap.disabledReason).toBe('host_not_activated');
    });
  });

  describe('Plane B on real POS boundary', () => {
    it('allows login via /lan/v1/pos/auth with valid signature when LAN enabled', async () => {
      await seedActiveEntitlement();
      const { keys, terminalId } = await seedActiveTerminal();
      configureLanRuntimeForTests({
        restaurantId,
        lanEnabled: true,
        hostActivated: true,
      });

      const body = JSON.stringify({ username: cashierUsername, pin: cashierPin });
      const path = '/api/v1/lan/v1/pos/auth/login';
      const headers = signLan(keys.privateKey, {
        terminalId,
        method: 'POST',
        path,
        rawBody: body,
      });

      const res = await request(app).post(path).set(headers).send(body);
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.user.restaurantId).toBe(restaurantId);
    });

    it('rejects invalid signatures on protected POS route', async () => {
      await seedActiveEntitlement();
      const { keys, terminalId } = await seedActiveTerminal();
      const other = generateLanTerminalEd25519KeyPair();
      configureLanRuntimeForTests({ restaurantId, lanEnabled: true, hostActivated: true });

      const body = JSON.stringify({ username: cashierUsername, pin: cashierPin });
      const path = '/api/v1/lan/v1/pos/auth/login';
      const headers = signLan(other.privateKey, {
        terminalId,
        method: 'POST',
        path,
        rawBody: body,
      });
      void keys;
      const res = await request(app).post(path).set(headers).send(body);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.LAN_AUTH_INVALID);
    });

    it('rejects replay and timestamp skew', async () => {
      await seedActiveEntitlement();
      const { keys, terminalId } = await seedActiveTerminal();
      configureLanRuntimeForTests({ restaurantId, lanEnabled: true, hostActivated: true });

      const path = '/api/v1/lan/v1/pos/auth/me';
      const headers = signLan(keys.privateKey, { terminalId, path });
      const first = await request(app).get(path).set(headers);
      // Plane B passes; JWT missing → 401 UNAUTHORIZED from auth middleware
      expect(first.status).toBe(401);
      expect(first.body.error.code).not.toBe(ErrorCode.LAN_AUTH_REPLAY);

      const replay = await request(app).get(path).set(headers);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe(ErrorCode.LAN_AUTH_REPLAY);

      const skewed = signLan(keys.privateKey, {
        terminalId,
        path,
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      });
      const skewRes = await request(app).get(path).set(skewed);
      expect(skewRes.status).toBe(401);
      expect(skewRes.body.error.code).toBe(ErrorCode.LAN_AUTH_TIMESTAMP);
    });

    it('rejects unknown and locally denied terminals', async () => {
      await seedActiveEntitlement();
      configureLanRuntimeForTests({ restaurantId, lanEnabled: true, hostActivated: true });
      const keys = generateLanTerminalEd25519KeyPair();
      const unknownId = randomUUID();
      const path = '/api/v1/lan/v1/pos/auth/me';

      const unknown = await request(app)
        .get(path)
        .set(signLan(keys.privateKey, { terminalId: unknownId, path }));
      expect(unknown.status).toBe(401);
      expect(unknown.body.error.code).toBe(ErrorCode.LAN_AUTH_INVALID);

      const { keys: deniedKeys, terminalId } = await seedActiveTerminal();
      await prisma.lanTerminal.update({
        where: { restaurantId_terminalId: { restaurantId, terminalId } },
        data: { localStatus: LanTerminalLocalStatus.DENIED },
      });
      const denied = await request(app)
        .get(path)
        .set(signLan(deniedKeys.privateKey, { terminalId, path }));
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe(ErrorCode.LAN_TERMINAL_DENIED);
    });

    it('blocks LAN POS when entitlement is denied or missing', async () => {
      const { keys, terminalId } = await seedActiveTerminal();
      configureLanRuntimeForTests({ restaurantId, lanEnabled: true, hostActivated: true });
      const path = '/api/v1/lan/v1/pos/auth/me';
      const res = await request(app)
        .get(path)
        .set(signLan(keys.privateKey, { terminalId, path }));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.LAN_ENTITLEMENT_INVALID);
    });

    it('blocks LAN POS when runtime is disabled', async () => {
      await seedActiveEntitlement();
      const { keys, terminalId } = await seedActiveTerminal();
      configureLanRuntimeForTests({
        restaurantId,
        lanEnabled: false,
        hostActivated: true,
        disabledReason: 'entitlement_refresh_failed',
      });
      const path = '/api/v1/lan/v1/pos/auth/me';
      const res = await request(app)
        .get(path)
        .set(signLan(keys.privateKey, { terminalId, path }));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.LAN_DISABLED);
    });

    it('blocks roster conflict terminals', async () => {
      await seedActiveEntitlement();
      const { keys, terminalId } = await seedActiveTerminal();
      await prisma.lanTerminal.update({
        where: { restaurantId_terminalId: { restaurantId, terminalId } },
        data: {
          cloudSyncStatus: LanCloudSyncStatus.SYNC_FAILED,
          deniedReason: 'fingerprint_prefix_mismatch',
        },
      });
      configureLanRuntimeForTests({ restaurantId, lanEnabled: true, hostActivated: true });
      const path = '/api/v1/lan/v1/pos/auth/me';
      const res = await request(app)
        .get(path)
        .set(signLan(keys.privateKey, { terminalId, path }));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.LAN_ROSTER_UNRECONCILED);
    });
  });

  describe('local staff routes remain intact', () => {
    it('allows local /api/v1/auth/login without Plane B headers', async () => {
      resetLanRuntimeForTests();
      const res = await request(app).post('/api/v1/auth/login').send({
        username: cashierUsername,
        pin: cashierPin,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
    });
  });

  describe('cloud outage vs denial at startup', () => {
    it('enables LAN from cache on network outage after activation', async () => {
      const installationId = randomUUID();
      await seedActiveEntitlement(installationId);
      HostIdentityService.ensureKeyPair();
      HostIdentityService.markActivated({
        installationId,
        licenseId: randomUUID(),
        restaurantId,
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
          throw new LicensingCloudError({
            kind: 'network',
            message: 'ECONNREFUSED',
            retryable: true,
          });
        },
        registerTerminal: async () => {
          throw new Error('unused');
        },
        deactivateTerminal: async () => undefined,
        replaceTerminal: async () => {
          throw new Error('unused');
        },
      });

      const snap = await bootstrapLicensingAndLanRuntime();
      expect(snap.lanEnabled).toBe(true);
      expect(snap.restaurantId).toBe(restaurantId);
    });

    it('disables LAN on explicit cloud denial at refresh', async () => {
      const installationId = randomUUID();
      await seedActiveEntitlement(installationId);
      HostIdentityService.ensureKeyPair();
      HostIdentityService.markActivated({
        installationId,
        licenseId: randomUUID(),
        restaurantId,
      });
      setLicensingCloudClient({
        redeemActivation: async () => {
          throw new Error('unused');
        },
        refreshEntitlement: async () => {
          throw new LicensingCloudError({
            kind: 'denied',
            message: 'License is suspended',
            remoteCode: 'LICENSE_SUSPENDED',
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

      const snap = await bootstrapLicensingAndLanRuntime();
      expect(snap.lanEnabled).toBe(false);
    });
  });

  describe('TLS / attestation fail-closed', () => {
    it('keeps remote pairing disabled without TLS material', () => {
      expect(isRemoteLanPairingEnabled()).toBe(false);
      const resPromise = request(app).post('/api/v1/lan/v1/pairing/hello').send({});
      return resPromise.then((res) => {
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe(ErrorCode.LAN_PAIRING_DISABLED);
      });
    });

    it('refuses attestation without TLS certificate DER', () => {
      useMemoryHostSecretStore();
      HostIdentityService.ensureKeyPair();
      expect(() =>
        createHostAttestationOrThrow({ invitationId: randomUUID() }),
      ).toThrow(/TLS certificate/i);
    });

    it('signs attestation only when TLS cert DER is bound', () => {
      useMemoryHostSecretStore();
      HostIdentityService.ensureKeyPair();
      // Minimal non-empty DER stand-in for unit test (not a real X.509 parse).
      setLanTlsCertificateDer(Buffer.from('test-tls-cert-der-bytes'));
      const att = createHostAttestationOrThrow({ invitationId: randomUUID() });
      expect(att.claims.scheme).toBe('FARMAX-HOST-ATTESTATION-V1');
      expect(att.claims.tlsCertificateFingerprintSha256Hex).toHaveLength(64);
      expect(att.signature.length).toBeGreaterThan(20);
      // Presence of host key alone must not enable pairing.
      expect(isRemoteLanPairingEnabled()).toBe(false);
    });
  });

  it('runLicensingStartup still requires consistent restaurant binding', async () => {
    const installationId = randomUUID();
    HostIdentityService.ensureKeyPair();
    HostIdentityService.markActivated({
      installationId,
      licenseId: randomUUID(),
      restaurantId: otherRestaurantId,
    });
    await expect(runLicensingStartup(restaurantId)).rejects.toMatchObject({
      errorCode: ErrorCode.LAN_RESTAURANT_MISMATCH,
    });
  });
});
