import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { LanCloudSyncStatus, LanTerminalLocalStatus } from '@prisma/client';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import {
  buildLanClientRequestCanonicalString,
  generateLanTerminalEd25519KeyPair,
  loadTerminalPublicKeySpkiBase64Url,
  sha256Hex,
  signLanClientRequestCanonical,
  verifyLanClientRequestSignature,
} from '../../src/modules/lan/crypto/lan-client-request.js';
import { normalizeAndFingerprintTerminalPublicKey } from '../../src/modules/lan/crypto/terminal-device-key.js';
import {
  verifySignedEntitlement,
  type EntitlementClaims,
  type SignedEntitlement,
} from '../../src/modules/lan/crypto/entitlement-verify.js';
import { LanEntitlementService } from '../../src/modules/lan/lan-entitlement.service.js';
import { LanTerminalService } from '../../src/modules/lan/lan-terminal.service.js';
import {
  getLicensingCloudClient,
  setLicensingCloudClient,
} from '../../src/modules/lan/licensing-cloud.client.js';
import { resetLanEnvCache } from '../../src/modules/lan/lan-env.js';

function signPing(
  privateKey: KeyObject,
  args: {
    terminalId: string;
    path?: string;
    query?: string;
    rawBody?: string;
    timestamp?: string;
    nonce?: string;
  },
): Record<string, string> {
  const timestamp = args.timestamp ?? new Date().toISOString();
  const nonce = args.nonce ?? randomUUID();
  const path = args.path ?? '/api/v1/lan/v1/ping';
  const query = args.query ?? '';
  const rawBody = args.rawBody ?? '';
  const canonical = buildLanClientRequestCanonicalString({
    method: 'GET',
    path,
    query,
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
  };
}

describe('Phase 2D.3 LAN host foundation', () => {
  let restaurantId: string;
  let managerToken: string;
  let managerPin: string;
  let cashierToken: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!url) throw new Error('DATABASE_URL required');
    if (/faraz_pos_db|farmax_pos_db(?!_)/i.test(url) && !/farmax_pos_.*_test/i.test(url)) {
      // Allow only disposable test DB names; block primary POS DBs.
      if (/\/faraz_pos_db\b/i.test(url) || /\/farmax_pos_db\b/i.test(url)) {
        throw new Error('Refusing primary POS database for LAN tests');
      }
    }
    if (/faraz_pos_db/i.test(url)) {
      throw new Error('Refusing faraz_pos_db');
    }

    resetLanEnvCache();

    await prisma.permission.upsert({
      where: { key: 'terminals.revoke' },
      create: {
        key: 'terminals.revoke',
        description: 'Deny LAN terminal locally',
      },
      update: {},
    });

    const rest = await prisma.restaurant.create({
      data: {
        name: 'LAN Foundation Test',
        slug: `lan-foundation-${Date.now()}`,
        currency: 'PKR',
      },
    });
    restaurantId = rest.id;
    process.env.LAN_DEFAULT_RESTAURANT_ID = restaurantId;
    resetLanEnvCache();

    const permissions = await prisma.permission.findMany();
    const managerRole = await prisma.role.create({
      data: {
        restaurantId,
        name: 'LAN_MANAGER_' + Date.now(),
        rolePermissions: {
          create: permissions
            .filter((p) =>
              ['terminals.revoke', 'settings.view', 'orders.view'].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });
    const cashierRole = await prisma.role.create({
      data: {
        restaurantId,
        name: 'LAN_CASHIER_' + Date.now(),
        rolePermissions: {
          create: permissions
            .filter((p) => p.key === 'orders.view')
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    managerPin = '1234';
    const pinHash = await bcrypt.hash(managerPin, 10);
    const manager = await prisma.user.create({
      data: {
        restaurantId,
        name: 'LAN Manager',
        username: `lanmgr_${Date.now()}`,
        pinHash,
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
    });
    const cashier = await prisma.user.create({
      data: {
        restaurantId,
        name: 'LAN Cashier',
        username: `lancash_${Date.now()}`,
        pinHash: await bcrypt.hash('5678', 10),
        userRoles: { create: [{ roleId: cashierRole.id }] },
      },
    });

    const mgrLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: manager.username, pin: managerPin });
    expect(mgrLogin.status).toBe(200);
    managerToken = mgrLogin.body.data.accessToken;

    const cashLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: cashier.username, pin: '5678' });
    expect(cashLogin.status).toBe(200);
    cashierToken = cashLogin.body.data.accessToken;
  });

  beforeEach(() => {
    setLicensingCloudClient(null);
  });

  it('accepts a valid Plane B signature for an ACTIVE terminal', async () => {
    const keys = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
      label: 'T1',
    });

    const headers = signPing(keys.privateKey, { terminalId });
    const res = await request(app).get('/api/v1/lan/v1/ping').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.terminalId).toBe(terminalId);
  });

  it('rejects DENIED terminals even when signature would otherwise verify', async () => {
    const keys = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
    });

    const deny = await request(app)
      .post('/api/v1/lan/terminals/deny')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ terminalId, managerPin });
    expect(deny.status).toBe(200);
    expect(deny.body.data.localStatus).toBe('DENIED');
    expect(deny.body.data.cloudSynced).toBe(false);

    const headers = signPing(keys.privateKey, { terminalId });
    const res = await request(app).get('/api/v1/lan/v1/ping').set(headers);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.LAN_TERMINAL_DENIED);
  });

  it('rejects invalid signature and malformed keys', async () => {
    const keys = generateLanTerminalEd25519KeyPair();
    const other = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
    });

    const badSig = signPing(other.privateKey, { terminalId });
    const res = await request(app).get('/api/v1/lan/v1/ping').set(badSig);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.LAN_AUTH_INVALID);

    await expect(
      LanTerminalService.upsertFromCloudRegistration({
        restaurantId,
        terminalId: randomUUID(),
        publicKeySpki: 'not-a-valid-key!!!!!!!!!!!!!',
      }),
    ).rejects.toThrow();
  });

  it('body-byte modification changes the canonical hash (signature binds exact bytes)', () => {
    const keys = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    const ts = new Date().toISOString();
    const nonce = randomUUID();
    const path = '/api/v1/lan/v1/echo';
    const c1 = buildLanClientRequestCanonicalString({
      method: 'POST',
      path,
      query: '',
      terminalId,
      timestamp: ts,
      nonce,
      bodySha256Hex: sha256Hex(Buffer.from('{"ok":true}', 'utf8')),
    });
    const c2 = buildLanClientRequestCanonicalString({
      method: 'POST',
      path,
      query: '',
      terminalId,
      timestamp: ts,
      nonce,
      bodySha256Hex: sha256Hex(Buffer.from('{"ok":false}', 'utf8')),
    });
    expect(c1).not.toBe(c2);
    const sig = signLanClientRequestCanonical(c1, keys.privateKey);
    const pub = normalizeAndFingerprintTerminalPublicKey(keys.publicKeySpkiBase64Url);
    const key = loadTerminalPublicKeySpkiBase64Url(pub.publicKeySpkiB64);
    expect(verifyLanClientRequestSignature(c1, sig, key)).toBe(true);
    expect(verifyLanClientRequestSignature(c2, sig, key)).toBe(false);
  });

  it('rejects timestamps outside allowed skew', async () => {
    const keys = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
    });
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const headers = signPing(keys.privateKey, { terminalId, timestamp: old });
    const res = await request(app).get('/api/v1/lan/v1/ping').set(headers);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.LAN_AUTH_TIMESTAMP);
  });

  it('rejects reused nonces including concurrent duplicates', async () => {
    const keys = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
    });
    const nonce = randomUUID();
    const headers = signPing(keys.privateKey, { terminalId, nonce });
    const first = await request(app).get('/api/v1/lan/v1/ping').set(headers);
    expect(first.status).toBe(200);

    const replay = await request(app).get('/api/v1/lan/v1/ping').set(headers);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe(ErrorCode.LAN_AUTH_REPLAY);

    const n2 = randomUUID();
    const hA = signPing(keys.privateKey, { terminalId, nonce: n2 });
    // Same nonce concurrent
    const concurrent = await Promise.all([
      request(app).get('/api/v1/lan/v1/ping').set(hA),
      request(app).get('/api/v1/lan/v1/ping').set(hA),
    ]);
    const oks = concurrent.filter((r) => r.status === 200);
    const replays = concurrent.filter(
      (r) => r.status === 401 && r.body.error?.code === ErrorCode.LAN_AUTH_REPLAY,
    );
    expect(oks).toHaveLength(1);
    expect(replays.length).toBeGreaterThanOrEqual(1);
  });

  it('path/query canonicalization is consistent', async () => {
    const keys = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
    });
    const headers = signPing(keys.privateKey, {
      terminalId,
      path: '/api/v1/lan/v1/ping',
      query: 'a=1&b=2',
    });
    const ok = await request(app).get('/api/v1/lan/v1/ping?a=1&b=2').set(headers);
    expect(ok.status).toBe(200);

    const wrongQuery = await request(app).get('/api/v1/lan/v1/ping?a=1').set(headers);
    expect(wrongQuery.status).toBe(401);
  });

  it('local denial takes effect when cloud deactivation fails', async () => {
    const keys = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
    });

    setLicensingCloudClient({
      deactivateTerminal: async () => {
        throw new Error('simulated cloud outage');
      },
    });

    const deny = await request(app)
      .post('/api/v1/lan/terminals/deny')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        terminalId,
        managerPin,
        installationId: randomUUID(),
        reason: 'lost device',
      });
    expect(deny.status).toBe(502);
    expect(deny.body.error.code).toBe(ErrorCode.LAN_CLOUD_SYNC_FAILED);

    const row = await prisma.lanTerminal.findUnique({
      where: { restaurantId_terminalId: { restaurantId, terminalId } },
    });
    expect(row?.localStatus).toBe(LanTerminalLocalStatus.DENIED);
    expect(row?.cloudSyncStatus).toBe(LanCloudSyncStatus.SYNC_FAILED);

    const ping = await request(app)
      .get('/api/v1/lan/v1/ping')
      .set(signPing(keys.privateKey, { terminalId }));
    expect(ping.status).toBe(403);
    expect(ping.body.error.code).toBe(ErrorCode.LAN_TERMINAL_DENIED);
  });

  it('roster and nonces persist across logical restart (DB durable)', async () => {
    const keys = generateLanTerminalEd25519KeyPair();
    const terminalId = randomUUID();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
    });
    const nonce = randomUUID();
    const headers = signPing(keys.privateKey, { terminalId, nonce });
    expect((await request(app).get('/api/v1/lan/v1/ping').set(headers)).status).toBe(200);

    // Simulate restart: new prisma read of same rows
    const row = await prisma.lanTerminal.findUnique({
      where: { restaurantId_terminalId: { restaurantId, terminalId } },
    });
    expect(row?.publicKeySpkiB64).toBe(
      normalizeAndFingerprintTerminalPublicKey(keys.publicKeySpkiBase64Url).publicKeySpkiB64,
    );
    const nonceRow = await prisma.lanTerminalRequestNonce.findFirst({
      where: { restaurantId, terminalId, nonce },
    });
    expect(nonceRow).toBeTruthy();

    const replay = await request(app).get('/api/v1/lan/v1/ping').set(headers);
    expect(replay.status).toBe(401);
  });

  it('entitlement verify: expired, wrong binding, untrusted key, clock rollback fail safely', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const spki = Buffer.from(publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString(
      'base64url',
    );
    const keyId = 'test-ent-key';
    process.env.ENTITLEMENT_TRUSTED_PUBLIC_KEYS = `${keyId}:${spki}`;
    process.env.ENTITLEMENT_ISSUER = 'https://licensing.test.farmax.local';
    process.env.ENTITLEMENT_AUDIENCE = 'farmax-pos-test';
    resetLanEnvCache();

    const baseClaims: EntitlementClaims = {
      v: 1,
      iss: 'https://licensing.test.farmax.local',
      aud: 'farmax-pos-test',
      entitlementId: randomUUID(),
      keyId,
      customerId: randomUUID(),
      branchLicenseId: randomUUID(),
      installationBindingId: randomUUID(),
      planType: 'monthly',
      status: 'active',
      paidThrough: '2099-01-01',
      iat: new Date().toISOString(),
      nbf: new Date(Date.now() - 60_000).toISOString(),
      exp: new Date(Date.now() + 3_600_000).toISOString(),
      terminalLimit: 3,
      revocationReason: null,
    };

    function signClaims(claims: EntitlementClaims): SignedEntitlement {
      const ordered = Object.keys(claims)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (claims as unknown as Record<string, unknown>)[k];
          return acc;
        }, {});
      const bytes = Buffer.from(JSON.stringify(ordered), 'utf8');
      const signature = sign(null, bytes, privateKey).toString('base64url');
      return { claims, signature };
    }

    const trusted = new Map([
      [keyId, createPublicKey({ key: Buffer.from(spki, 'base64url'), format: 'der', type: 'spki' })],
    ]);

    const expired = signClaims({
      ...baseClaims,
      exp: new Date(Date.now() - 1000).toISOString(),
    });
    expect(
      verifySignedEntitlement({
        document: expired,
        trustedKeys: trusted,
        effectiveNow: new Date(),
      }).ok,
    ).toBe(false);

    const wrongKey = signClaims({ ...baseClaims, keyId: 'unknown' });
    expect(
      verifySignedEntitlement({
        document: wrongKey,
        trustedKeys: trusted,
        effectiveNow: new Date(),
      }).ok,
    ).toBe(false);

    await LanEntitlementService.touchWatermark(restaurantId, new Date());
    const good = signClaims(baseClaims);
    const claims = await LanEntitlementService.assertUsableForLan({
      restaurantId,
      document: good,
    });
    expect(claims.terminalLimit).toBe(3);

    // Binding mismatch after watermark stored installation id
    const otherBind = signClaims({
      ...baseClaims,
      entitlementId: randomUUID(),
      installationBindingId: randomUUID(),
    });
    await expect(
      LanEntitlementService.assertUsableForLan({
        restaurantId,
        document: otherBind,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_ENTITLEMENT_INVALID });

    // Clock rollback: watermark in the future relative to wall clock simulation via touch
    const future = new Date(Date.now() + 86_400_000);
    await prisma.hostLicensingTrustState.update({
      where: { restaurantId },
      data: { lastTrustedUtc: future },
    });
    await expect(
      LanEntitlementService.assertUsableForLan({
        restaurantId,
        document: signClaims({ ...baseClaims, entitlementId: randomUUID() }),
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_CLOCK_ROLLBACK });
  });

  it('staff login still works; cashier cannot revoke terminals', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({
      username: (
        await prisma.user.findFirst({
          where: { restaurantId, name: 'LAN Cashier' },
        })
      )!.username,
      pin: '5678',
    });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();

    const terminalId = randomUUID();
    const keys = generateLanTerminalEd25519KeyPair();
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId,
      terminalId,
      publicKeySpki: keys.publicKeySpkiBase64Url,
    });
    const deny = await request(app)
      .post('/api/v1/lan/terminals/deny')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ terminalId, managerPin: '5678' });
    expect(deny.status).toBe(403);
  });

  it('does not leave cloud client injected across tests', () => {
    expect(getLicensingCloudClient()).toBeNull();
  });
});
