import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { randomUUID, type KeyObject } from 'node:crypto';
import { LanPairingInvitationStatus, LanTerminalLocalStatus } from '@prisma/client';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import { assertDisposableTestDatabase } from '../helpers/seed-auth-fixture.js';
import {
  HostIdentityService,
  useMemoryHostSecretStore,
  setHostSecretStoreForTests,
} from '../../src/modules/lan/host-identity/host-identity.service.js';
import {
  setTlsSecretStoreForTests,
  TlsCertificateService,
  useMemoryTlsSecretStore,
} from '../../src/modules/lan/tls/tls-certificate.service.js';
import {
  isLanPairingProtocolReady,
  isRemoteLanPairingEnabled,
  setLanPairingProtocolReadyForTests,
  setLanTlsCertificateDer,
} from '../../src/modules/lan/lan-pairing-gate.js';
import { LanPairingInvitationService } from '../../src/modules/lan/lan-pairing-invitation.service.js';
import {
  LanPairingService,
  resetPairingRateLimitsForTests,
} from '../../src/modules/lan/lan-pairing.service.js';
import {
  generatePairingInvitationToken,
  hashPairingInvitationToken,
  LAN_PAIRING_PROTOCOL_VERSION,
  LAN_PAIRING_TOKEN_BYTES,
} from '../../src/modules/lan/crypto/pairing-invitation-token.js';
import {
  signPairingClientProof,
  signPairingStatusProof,
} from '../../src/modules/lan/crypto/pairing-client-proof.js';
import {
  evaluateRemoteExposureGate,
  REMOTE_LAN_EXPOSURE_READY,
} from '../../src/modules/lan/lan-pairing-gate.js';
import {
  rejectSameConnectionTrustBootstrap,
  verifyClientTrustBootstrap,
} from '../../src/modules/lan/crypto/client-trust-verify.js';
import { generateLanTerminalEd25519KeyPair } from '../../src/modules/lan/crypto/lan-client-request.js';
import { normalizeAndFingerprintTerminalPublicKey } from '../../src/modules/lan/crypto/terminal-device-key.js';
import { sha256HexOfDer } from '../../src/modules/lan/crypto/host-attestation.js';
import {
  setLicensingCloudClient,
  type CloudRegisterTerminalResult,
  type CloudTerminalListResult,
  type LicensingCloudClient,
} from '../../src/modules/lan/licensing-cloud.client.js';
import { LicensingCloudError } from '../../src/modules/lan/licensing-cloud.errors.js';

const TEST_DB =
  process.env.LAN_PAIRING_TEST_DATABASE_URL ??
  'postgresql://pos_admin:pos_password_123@localhost:5435/farmax_pos_backend_test?schema=public';

describe('Phase 2D.7 secure LAN pairing protocol', () => {
  let restaurantId: string;
  let managerToken: string;
  let cashierToken: string;
  let managerPin: string;
  let installationId: string;
  let licenseId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    assertDisposableTestDatabase(process.env.DATABASE_URL);

    await prisma.permission.upsert({
      where: { key: 'terminals.pair' },
      create: {
        key: 'terminals.pair',
        description: 'Create pairing invitations and approve joining LAN terminals',
      },
      update: {},
    });
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
        name: 'LAN Pairing Test',
        slug: `lan-pairing-${Date.now()}`,
        currency: 'PKR',
      },
    });
    restaurantId = rest.id;

    const permissions = await prisma.permission.findMany();
    const managerRole = await prisma.role.create({
      data: {
        restaurantId,
        name: 'PAIR_MGR_' + Date.now(),
        rolePermissions: {
          create: permissions
            .filter((p) =>
              ['terminals.pair', 'terminals.revoke', 'settings.view'].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });
    const cashierRole = await prisma.role.create({
      data: {
        restaurantId,
        name: 'PAIR_CASH_' + Date.now(),
        rolePermissions: {
          create: permissions
            .filter((p) => p.key === 'orders.view')
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    managerPin = '4321';
    const manager = await prisma.user.create({
      data: {
        restaurantId,
        name: 'Pair Manager',
        username: `pairmgr_${Date.now()}`,
        pinHash: await bcrypt.hash(managerPin, 10),
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
    });
    await prisma.user.create({
      data: {
        restaurantId,
        name: 'Pair Cashier',
        username: `paircash_${Date.now()}`,
        pinHash: await bcrypt.hash('9999', 10),
        userRoles: { create: [{ roleId: cashierRole.id }] },
      },
    });

    const loginMgr = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: manager.username, pin: managerPin });
    expect(loginMgr.status).toBe(200);
    managerToken = loginMgr.body.data.accessToken;

    const cashier = await prisma.user.findFirstOrThrow({
      where: { restaurantId, name: 'Pair Cashier' },
    });
    const loginCash = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: cashier.username, pin: '9999' });
    expect(loginCash.status).toBe(200);
    cashierToken = loginCash.body.data.accessToken;
  });

  beforeEach(async () => {
    setHostSecretStoreForTests(null);
    setTlsSecretStoreForTests(null);
    setLanTlsCertificateDer(null);
    setLanPairingProtocolReadyForTests(null);
    resetPairingRateLimitsForTests();
    useMemoryHostSecretStore();
    useMemoryTlsSecretStore();
    setLicensingCloudClient(null);

    await prisma.lanPairingInvitation.deleteMany({ where: { restaurantId } });
    await prisma.lanTerminal.deleteMany({ where: { restaurantId } });

    TlsCertificateService.ensureCertificate();
    HostIdentityService.ensureKeyPair();
    installationId = randomUUID();
    licenseId = randomUUID();
    HostIdentityService.markActivated({
      installationId,
      licenseId,
      restaurantId,
    });
  });

  afterAll(async () => {
    setLicensingCloudClient(null);
    setLanPairingProtocolReadyForTests(null);
    setHostSecretStoreForTests(null);
    setTlsSecretStoreForTests(null);
  });

  function mockCloudRegister(opts?: {
    failFirst?: boolean;
    seatExceeded?: boolean;
    listAfterTimeout?: boolean;
  }): {
    client: LicensingCloudClient;
    registerCalls: number;
    registeredKeys: string[];
  } {
    const registeredKeys: string[] = [];
    let registerCalls = 0;
    let failOnce = opts?.failFirst ?? false;
    const terminals: CloudTerminalListResult['terminals'] = [];

    const seats = {
      seatLimit: 3,
      hostCountsAsSeat: true as const,
      hostSeatsUsed: 1 as const,
      additionalTerminalsActive: 0,
      additionalTerminalsAllowed: 2,
      seatsUsed: 1,
      seatsAvailable: 2,
    };

    const client: LicensingCloudClient = {
      redeemActivation: async () => {
        throw new Error('unused');
      },
      refreshEntitlement: async () => {
        throw new Error('unused');
      },
      listTerminals: async () => ({
        installationId,
        licenseId,
        host: {
          countsAsSeat: true,
          status: 'ACTIVE',
          activatedAt: new Date().toISOString(),
          hostLabel: null,
        },
        terminals: [...terminals],
        seats: {
          ...seats,
          additionalTerminalsActive: terminals.filter((t) => t.status === 'ACTIVE').length,
          seatsUsed: 1 + terminals.filter((t) => t.status === 'ACTIVE').length,
          seatsAvailable:
            3 - (1 + terminals.filter((t) => t.status === 'ACTIVE').length),
        },
        serverTime: new Date().toISOString(),
      }),
      registerTerminal: async (input) => {
        registerCalls += 1;
        if (opts?.seatExceeded) {
          throw new LicensingCloudError({
            kind: 'denied',
            message: 'Seat limit exceeded',
            remoteCode: 'TERMINAL_SEAT_LIMIT_EXCEEDED',
            httpStatus: 409,
            retryable: false,
          });
        }
        if (failOnce) {
          failOnce = false;
          throw new LicensingCloudError({
            kind: 'timeout',
            message: 'Licensing cloud request timed out',
            retryable: true,
          });
        }
        const identity = normalizeAndFingerprintTerminalPublicKey(input.terminalPublicKey);
        const existing = terminals.find(
          (t) =>
            t.status === 'ACTIVE' &&
            t.deviceFingerprintPrefix === identity.fingerprintSha256Hex.slice(0, 12),
        );
        if (existing) {
          registeredKeys.push(input.terminalPublicKey);
          return {
            idempotent: true,
            terminal: existing,
            seats,
          } satisfies CloudRegisterTerminalResult;
        }
        const terminalId = randomUUID();
        const row = {
          terminalId,
          label: input.label ?? null,
          status: 'ACTIVE',
          activatedAt: new Date().toISOString(),
          deactivatedAt: null,
          deviceFingerprintPrefix: identity.fingerprintSha256Hex.slice(0, 12),
        };
        terminals.push(row);
        registeredKeys.push(input.terminalPublicKey);
        return { idempotent: false, terminal: row, seats };
      },
      deactivateTerminal: async () => undefined,
      replaceTerminal: async () => {
        throw new Error('unused');
      },
    };

    setLicensingCloudClient(client);
    return {
      client,
      get registerCalls() {
        return registerCalls;
      },
      registeredKeys,
    };
  }

  async function createInvitationViaApi() {
    const res = await request(app)
      .post('/api/v1/lan/pairing/invitations')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ managerPin });
    expect(res.status).toBe(201);
    expect(res.body.data.invitationToken).toBeTruthy();
    expect(res.body.data.invitationId).toBeTruthy();
    // Token must not appear in structured error-shaped fields
    expect(JSON.stringify(res.body.error ?? {})).not.toContain(res.body.data.invitationToken);
    return res.body.data as {
      invitationId: string;
      invitationToken: string;
      hostFingerprintSha256Hex: string;
      hostPublicKeySpkiB64: string;
      tlsCertificateFingerprintSha256Hex: string;
      restaurantId: string;
      installationBindingId: string;
      licenseId: string;
      protocolVersion: number;
    };
  }

  function clientProof(
    invitationId: string,
    client: { privateKey: KeyObject; publicKeySpkiBase64Url: string },
    hostFp: string,
    tlsFp: string,
  ) {
    const identity = normalizeAndFingerprintTerminalPublicKey(client.publicKeySpkiBase64Url);
    return signPairingClientProof(
      {
        invitationId,
        clientPublicKeySpkiB64: identity.publicKeySpkiB64,
        clientFingerprintSha256Hex: identity.fingerprintSha256Hex,
        hostFingerprintSha256Hex: hostFp,
        tlsCertificateFingerprintSha256Hex: tlsFp,
      },
      client.privateKey,
    );
  }

  function statusProof(
    invitationId: string,
    client: { privateKey: KeyObject; publicKeySpkiBase64Url: string },
  ) {
    const identity = normalizeAndFingerprintTerminalPublicKey(client.publicKeySpkiBase64Url);
    return signPairingStatusProof(
      {
        invitationId,
        clientFingerprintSha256Hex: identity.fingerprintSha256Hex,
      },
      client.privateKey,
    );
  }

  describe('gates', () => {
    it('keeps remote non-loopback pairing disabled while protocol can be ready', () => {
      expect(isRemoteLanPairingEnabled()).toBe(false);
      expect(isLanPairingProtocolReady()).toBe(true);
    });

    it('refuses pairing hello without activated host even if TLS exists', async () => {
      useMemoryHostSecretStore();
      HostIdentityService.ensureKeyPair(); // not activated
      expect(isLanPairingProtocolReady()).toBe(false);
      const res = await request(app).post('/api/v1/lan/v1/pairing/hello').send({});
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.LAN_PAIRING_DISABLED);
    });
  });

  describe('invitation entropy / storage / lifecycle', () => {
    it('generates ≥128-bit tokens and persists only a hash', async () => {
      const token = generatePairingInvitationToken();
      const decoded = Buffer.from(token, 'base64url');
      expect(decoded.length).toBeGreaterThanOrEqual(LAN_PAIRING_TOKEN_BYTES);

      const material = await LanPairingInvitationService.createInvitation({
        restaurantId,
        managerPin,
      });
      const row = await prisma.lanPairingInvitation.findUniqueOrThrow({
        where: { id: material.invitationId },
      });
      expect(row.tokenHashSha256Hex).toBe(hashPairingInvitationToken(material.invitationToken));
      expect(JSON.stringify(row)).not.toContain(material.invitationToken);
      expect(row.hostFingerprintSha256Hex).toBe(
        HostIdentityService.getPublicMeta()!.fingerprintSha256Hex,
      );
      expect(row.tlsCertificateFingerprintSha256Hex).toBe(
        TlsCertificateService.getPublicMeta()!.fingerprintSha256Hex,
      );
    });

    it('cancels previous OPEN invitation when creating a new one', async () => {
      const first = await LanPairingInvitationService.createInvitation({
        restaurantId,
        managerPin,
      });
      const second = await LanPairingInvitationService.createInvitation({
        restaurantId,
        managerPin,
      });
      const prev = await prisma.lanPairingInvitation.findUniqueOrThrow({
        where: { id: first.invitationId },
      });
      expect(prev.status).toBe(LanPairingInvitationStatus.CANCELLED);
      const cur = await prisma.lanPairingInvitation.findUniqueOrThrow({
        where: { id: second.invitationId },
      });
      expect(cur.status).toBe(LanPairingInvitationStatus.OPEN);
    });

    it('expires invitations and rejects reuse after redeem', async () => {
      mockCloudRegister();
      const material = await LanPairingInvitationService.createInvitation({
        restaurantId,
        managerPin,
        ttlMs: 1,
      });
      await new Promise((r) => setTimeout(r, 5));
      await expect(
        LanPairingService.hello({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: material.invitationId,
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_PAIRING_EXPIRED });

      const fresh = await createInvitationViaApi();
      const client = generateLanTerminalEd25519KeyPair();
      // Host private key must not equal client key
      const hostPub = HostIdentityService.getPublicMeta()!.publicKeySpkiB64;
      expect(client.publicKeySpkiBase64Url).not.toBe(hostPub);

      const hello = await LanPairingService.hello({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: fresh.invitationId,
      });
      expect(hello.attestation.claims.invitationId).toBe(fresh.invitationId);

      const pending = await LanPairingService.complete({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: fresh.invitationId,
        invitationToken: fresh.invitationToken,
        clientPublicKey: client.publicKeySpkiBase64Url,
        clientProofSignature: clientProof(
          fresh.invitationId,
          client,
          fresh.hostFingerprintSha256Hex,
          fresh.tlsCertificateFingerprintSha256Hex,
        ),
        label: 'Front Counter',
      });
      expect(pending.status).toBe('AWAITING_APPROVAL');

      const approved = await LanPairingService.approve({
        restaurantId,
        invitationId: fresh.invitationId,
        managerPin,
      });
      expect(approved.status).toBe('REDEEMED');
      expect(approved.terminalId).toBeTruthy();

      const local = await prisma.lanTerminal.findUniqueOrThrow({
        where: {
          restaurantId_terminalId: {
            restaurantId,
            terminalId: approved.terminalId,
          },
        },
      });
      expect(local.localStatus).toBe(LanTerminalLocalStatus.ACTIVE);
      expect(local.publicKeySpkiB64).toBe(
        normalizeAndFingerprintTerminalPublicKey(client.publicKeySpkiBase64Url)
          .publicKeySpkiB64,
      );

      // Replay complete after redeem
      await expect(
        LanPairingService.complete({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: fresh.invitationId,
          invitationToken: fresh.invitationToken,
          clientPublicKey: client.publicKeySpkiBase64Url,
          clientProofSignature: clientProof(
            fresh.invitationId,
            client,
            fresh.hostFingerprintSha256Hex,
            fresh.tlsCertificateFingerprintSha256Hex,
          ),
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_PAIRING_INVALID });
    });

    it('rate-limits bad token attempts and locks the invitation', async () => {
      const material = await LanPairingInvitationService.createInvitation({
        restaurantId,
        managerPin,
      });
      const client = generateLanTerminalEd25519KeyPair();
      let lastErr: unknown;
      for (let i = 0; i < 5; i++) {
        try {
          await LanPairingService.complete({
            protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
            invitationId: material.invitationId,
            invitationToken: 'wrong-token-value-xxxx',
            clientPublicKey: client.publicKeySpkiBase64Url,
            clientProofSignature: 'AAAA',
          });
        } catch (err) {
          lastErr = err;
        }
      }
      expect(lastErr).toMatchObject({ errorCode: ErrorCode.LAN_PAIRING_RATE_LIMITED });

      await expect(
        LanPairingService.complete({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: material.invitationId,
          invitationToken: material.invitationToken,
          clientPublicKey: client.publicKeySpkiBase64Url,
          clientProofSignature: clientProof(
            material.invitationId,
            client,
            material.hostFingerprintSha256Hex,
            material.tlsCertificateFingerprintSha256Hex,
          ),
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_PAIRING_RATE_LIMITED });
    });
  });

  describe('manager authorization', () => {
    it('rejects cashier creating invitations', async () => {
      const res = await request(app)
        .post('/api/v1/lan/pairing/invitations')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ managerPin: '9999' });
      expect(res.status).toBe(403);
    });

    it('rejects wrong manager PIN', async () => {
      await expect(
        LanPairingInvitationService.createInvitation({
          restaurantId,
          managerPin: '0000',
        }),
      ).rejects.toThrow(/Manager authorization failed/i);
    });
  });

  describe('OOB TLS pin and attestation', () => {
    it('client trust verify accepts matching OOB pin and rejects mismatch', async () => {
      const material = await createInvitationViaApi();
      const hello = await LanPairingService.hello({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: material.invitationId,
      });
      const der = TlsCertificateService.getCertificateDer();

      const ok = verifyClientTrustBootstrap({
        outOfBand: {
          protocolVersion: material.protocolVersion,
          invitationId: material.invitationId,
          hostFingerprintSha256Hex: material.hostFingerprintSha256Hex,
          tlsCertificateFingerprintSha256Hex: material.tlsCertificateFingerprintSha256Hex,
          hostPublicKeySpkiB64: material.hostPublicKeySpkiB64,
          restaurantId: material.restaurantId,
          installationBindingId: material.installationBindingId,
          licenseId: material.licenseId,
        },
        presentedTlsCertificateDer: der,
        attestation: hello.attestation,
        presentedRestaurantId: hello.restaurantId,
        presentedInstallationBindingId: hello.installationBindingId,
        presentedLicenseId: hello.licenseId,
      });
      expect(ok.ok).toBe(true);

      const badPin = verifyClientTrustBootstrap({
        outOfBand: {
          protocolVersion: material.protocolVersion,
          invitationId: material.invitationId,
          hostFingerprintSha256Hex: material.hostFingerprintSha256Hex,
          tlsCertificateFingerprintSha256Hex: 'ab'.repeat(32),
          hostPublicKeySpkiB64: material.hostPublicKeySpkiB64,
        },
        presentedTlsCertificateDer: der,
        attestation: hello.attestation,
      });
      expect(badPin.ok).toBe(false);
      if (!badPin.ok) expect(badPin.reason).toBe('TLS_PIN_MISMATCH');

      const antiPattern = rejectSameConnectionTrustBootstrap({
        hasIndependentOutOfBandTlsPin: false,
      });
      expect(antiPattern?.ok).toBe(false);
    });

    it('rejects unsupported protocol version', async () => {
      const material = await createInvitationViaApi();
      await expect(
        LanPairingService.hello({
          protocolVersion: 99,
          invitationId: material.invitationId,
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_PAIRING_PROTOCOL });
    });

    it('certificate rotation invalidates open invitations', async () => {
      const material = await LanPairingInvitationService.createInvitation({
        restaurantId,
        managerPin,
      });
      TlsCertificateService.rotateCertificate();
      await LanPairingInvitationService.invalidateForRotatedTrust({ restaurantId });

      await expect(
        LanPairingService.hello({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: material.invitationId,
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_PAIRING_INVALID });

      // Even without explicit invalidate, binding check fails closed
      const material2 = await LanPairingInvitationService.createInvitation({
        restaurantId,
        managerPin,
      });
      TlsCertificateService.rotateCertificate();
      await expect(
        LanPairingService.hello({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: material2.invitationId,
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_TLS_PIN_MISMATCH });
    });
  });

  describe('registration recovery and cloud outage', () => {
    it('retries idempotent register after lost response', async () => {
      const mock = mockCloudRegister({ failFirst: true });
      const material = await createInvitationViaApi();
      const client = generateLanTerminalEd25519KeyPair();

      await LanPairingService.complete({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: material.invitationId,
        invitationToken: material.invitationToken,
        clientPublicKey: client.publicKeySpkiBase64Url,
        clientProofSignature: clientProof(
          material.invitationId,
          client,
          material.hostFingerprintSha256Hex,
          material.tlsCertificateFingerprintSha256Hex,
        ),
      });

      const approved = await LanPairingService.approve({
        restaurantId,
        invitationId: material.invitationId,
        managerPin,
      });
      expect(approved.terminalId).toBeTruthy();
      expect(mock.registerCalls).toBeGreaterThanOrEqual(2);
      expect(mock.registeredKeys.length).toBeGreaterThanOrEqual(1);
    });

    it('fails closed on cloud outage without marking local ACTIVE', async () => {
      setLicensingCloudClient({
        redeemActivation: async () => {
          throw new Error('unused');
        },
        refreshEntitlement: async () => {
          throw new Error('unused');
        },
        listTerminals: async () => {
          throw new LicensingCloudError({
            kind: 'network',
            message: 'cloud down',
            retryable: true,
          });
        },
        registerTerminal: async () => {
          throw new LicensingCloudError({
            kind: 'network',
            message: 'cloud down',
            retryable: true,
          });
        },
        deactivateTerminal: async () => undefined,
        replaceTerminal: async () => {
          throw new Error('unused');
        },
      });

      const material = await createInvitationViaApi();
      const client = generateLanTerminalEd25519KeyPair();
      await LanPairingService.complete({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: material.invitationId,
        invitationToken: material.invitationToken,
        clientPublicKey: client.publicKeySpkiBase64Url,
        clientProofSignature: clientProof(
          material.invitationId,
          client,
          material.hostFingerprintSha256Hex,
          material.tlsCertificateFingerprintSha256Hex,
        ),
      });

      await expect(
        LanPairingService.approve({
          restaurantId,
          invitationId: material.invitationId,
          managerPin,
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LICENSING_CLOUD_NETWORK });

      const terminals = await prisma.lanTerminal.findMany({ where: { restaurantId } });
      expect(terminals).toHaveLength(0);
      const inv = await prisma.lanPairingInvitation.findUniqueOrThrow({
        where: { id: material.invitationId },
      });
      expect(inv.status).toBe(LanPairingInvitationStatus.AWAITING_APPROVAL);
    });
  });

  describe('host status UI surface', () => {
    it('returns status without secrets and lists roster prefixes only', async () => {
      mockCloudRegister();
      const statusRes = await request(app)
        .get('/api/v1/lan/status')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.httpsLoopbackOnly).toBe(true);
      expect(statusRes.body.data.remoteLanPairingEnabled).toBe(false);
      expect(statusRes.body.data.remoteExposureGate?.featureReadyLatch).toBe(false);
      expect(statusRes.body.data.pairingProtocolReady).toBe(true);
      expect(JSON.stringify(statusRes.body)).not.toMatch(/invitationToken/i);
      expect(JSON.stringify(statusRes.body).toLowerCase()).not.toContain('private');

      const material = await createInvitationViaApi();
      const client = generateLanTerminalEd25519KeyPair();
      await LanPairingService.complete({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: material.invitationId,
        invitationToken: material.invitationToken,
        clientPublicKey: client.publicKeySpkiBase64Url,
        clientProofSignature: clientProof(
          material.invitationId,
          client,
          material.hostFingerprintSha256Hex,
          material.tlsCertificateFingerprintSha256Hex,
        ),
        label: 'UI Pending',
      });
      await LanPairingService.approve({
        restaurantId,
        invitationId: material.invitationId,
        managerPin,
      });

      const roster = await request(app)
        .get('/api/v1/lan/terminals')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(roster.status).toBe(200);
      expect(roster.body.data.length).toBeGreaterThanOrEqual(1);
      expect(roster.body.data[0].fingerprintPrefix).toHaveLength(12);
      expect(JSON.stringify(roster.body)).not.toMatch(/publicKeySpki/i);
    });

    it('rejects cashier from LAN status', async () => {
      const res = await request(app)
        .get('/api/v1/lan/status')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('HTTP pairing surfaces', () => {
    it('end-to-end staff create → hello → complete → approve', async () => {
      mockCloudRegister();
      const created = await createInvitationViaApi();
      expect(created.tlsCertificateFingerprintSha256Hex).toBe(
        sha256HexOfDer(TlsCertificateService.getCertificateDer()),
      );

      const helloRes = await request(app)
        .post('/api/v1/lan/v1/pairing/hello')
        .send({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: created.invitationId,
        });
      expect(helloRes.status).toBe(200);
      expect(helloRes.body.data.attestation.claims.tlsCertificateFingerprintSha256Hex).toBe(
        created.tlsCertificateFingerprintSha256Hex,
      );
      expect(JSON.stringify(helloRes.body)).not.toMatch(/invitationToken/i);

      const client = generateLanTerminalEd25519KeyPair();
      const completeRes = await request(app)
        .post('/api/v1/lan/v1/pairing/complete')
        .send({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: created.invitationId,
          invitationToken: created.invitationToken,
          clientPublicKey: client.publicKeySpkiBase64Url,
          clientProofSignature: clientProof(
            created.invitationId,
            client,
            created.hostFingerprintSha256Hex,
            created.tlsCertificateFingerprintSha256Hex,
          ),
          label: 'Bar',
        });
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.status).toBe('AWAITING_APPROVAL');
      expect(JSON.stringify(completeRes.body)).not.toContain(created.invitationToken);

      const approveRes = await request(app)
        .post('/api/v1/lan/pairing/approve')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ invitationId: created.invitationId, managerPin });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('REDEEMED');
      expect(approveRes.body.data.terminalId).toMatch(
        /^[0-9a-f-]{36}$/i,
      );
    });

    it('cancel via staff route', async () => {
      const created = await createInvitationViaApi();
      const cancel = await request(app)
        .post('/api/v1/lan/pairing/invitations/cancel')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ managerPin, invitationId: created.invitationId });
      expect(cancel.status).toBe(200);
      expect(cancel.body.data.cancelledCount).toBe(1);

      const hello = await request(app)
        .post('/api/v1/lan/v1/pairing/hello')
        .send({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: created.invitationId,
        });
      expect(hello.status).toBe(409);
    });

    it('remote pairing/cancel stays disabled', async () => {
      const res = await request(app).post('/api/v1/lan/v1/pairing/cancel').send({});
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.LAN_PAIRING_DISABLED);
    });
  });

  describe('Phase 2D.9 status recovery / approval polling', () => {
    it('polls AWAITING then REDEEMED without registering a second seat', async () => {
      const mock = mockCloudRegister();
      const material = await createInvitationViaApi();
      const client = generateLanTerminalEd25519KeyPair();

      await LanPairingService.complete({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: material.invitationId,
        invitationToken: material.invitationToken,
        clientPublicKey: client.publicKeySpkiBase64Url,
        clientProofSignature: clientProof(
          material.invitationId,
          client,
          material.hostFingerprintSha256Hex,
          material.tlsCertificateFingerprintSha256Hex,
        ),
        label: 'Poll Client',
      });

      const pendingStatus = await LanPairingService.getStatus({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: material.invitationId,
        clientPublicKey: client.publicKeySpkiBase64Url,
        clientProofSignature: statusProof(material.invitationId, client),
      });
      expect(pendingStatus.status).toBe('AWAITING_APPROVAL');
      expect(pendingStatus.terminalId).toBeNull();

      const httpPending = await request(app)
        .post('/api/v1/lan/v1/pairing/status')
        .send({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: material.invitationId,
          clientPublicKey: client.publicKeySpkiBase64Url,
          clientProofSignature: statusProof(material.invitationId, client),
        });
      expect(httpPending.status).toBe(200);
      expect(httpPending.body.data.status).toBe('AWAITING_APPROVAL');
      expect(httpPending.body.data.terminalId).toBeNull();

      const approved = await LanPairingService.approve({
        restaurantId,
        invitationId: material.invitationId,
        managerPin,
      });
      expect(mock.registerCalls).toBe(1);

      // Repeated polls (lost responses / restart) — same terminalId, no new register.
      for (let i = 0; i < 3; i++) {
        const st = await LanPairingService.getStatus({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: material.invitationId,
          clientPublicKey: client.publicKeySpkiBase64Url,
          clientProofSignature: statusProof(material.invitationId, client),
        });
        expect(st.status).toBe('REDEEMED');
        if (st.status === 'REDEEMED') {
          expect(st.terminalId).toBe(approved.terminalId);
        }
      }
      expect(mock.registerCalls).toBe(1);

      const locals = await prisma.lanTerminal.findMany({ where: { restaurantId } });
      expect(locals).toHaveLength(1);

      // Idempotent re-approve (lost manager response) must not add a seat.
      const again = await LanPairingService.approve({
        restaurantId,
        invitationId: material.invitationId,
        managerPin,
      });
      expect(again.idempotent).toBe(true);
      expect(again.terminalId).toBe(approved.terminalId);
      expect(mock.registerCalls).toBe(1);
    });

    it('rejects wrong-session / wrong-key status lookups without leaking terminalId', async () => {
      mockCloudRegister();
      const material = await createInvitationViaApi();
      const client = generateLanTerminalEd25519KeyPair();
      const other = generateLanTerminalEd25519KeyPair();

      await LanPairingService.complete({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: material.invitationId,
        invitationToken: material.invitationToken,
        clientPublicKey: client.publicKeySpkiBase64Url,
        clientProofSignature: clientProof(
          material.invitationId,
          client,
          material.hostFingerprintSha256Hex,
          material.tlsCertificateFingerprintSha256Hex,
        ),
      });
      const approved = await LanPairingService.approve({
        restaurantId,
        invitationId: material.invitationId,
        managerPin,
      });

      // Wrong key with valid proof for that wrong key
      await expect(
        LanPairingService.getStatus({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: material.invitationId,
          clientPublicKey: other.publicKeySpkiBase64Url,
          clientProofSignature: statusProof(material.invitationId, other),
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_PAIRING_INVALID });

      // Invalid proof signature
      await expect(
        LanPairingService.getStatus({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: material.invitationId,
          clientPublicKey: client.publicKeySpkiBase64Url,
          clientProofSignature: 'AAAA',
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_PAIRING_INVALID });

      // Wrong invitation id
      const otherInv = await createInvitationViaApi();
      await expect(
        LanPairingService.getStatus({
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          invitationId: otherInv.invitationId,
          clientPublicKey: client.publicKeySpkiBase64Url,
          clientProofSignature: statusProof(otherInv.invitationId, client),
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.LAN_PAIRING_INVALID });

      // Unauthenticated-shaped HTTP without proof fields
      const bare = await request(app)
        .post('/api/v1/lan/v1/pairing/status')
        .send({ invitationId: material.invitationId });
      expect(bare.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(bare.body)).not.toContain(approved.terminalId);
    });

    it('status after deny reports REJECTED and does not expose a usable ACTIVE seat', async () => {
      mockCloudRegister();
      const material = await createInvitationViaApi();
      const client = generateLanTerminalEd25519KeyPair();
      await LanPairingService.complete({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: material.invitationId,
        invitationToken: material.invitationToken,
        clientPublicKey: client.publicKeySpkiBase64Url,
        clientProofSignature: clientProof(
          material.invitationId,
          client,
          material.hostFingerprintSha256Hex,
          material.tlsCertificateFingerprintSha256Hex,
        ),
      });
      const approved = await LanPairingService.approve({
        restaurantId,
        invitationId: material.invitationId,
        managerPin,
      });

      await prisma.lanTerminal.update({
        where: {
          restaurantId_terminalId: {
            restaurantId,
            terminalId: approved.terminalId,
          },
        },
        data: {
          localStatus: LanTerminalLocalStatus.DENIED,
          deniedAt: new Date(),
          deniedReason: 'pilot_deny',
        },
      });

      const st = await LanPairingService.getStatus({
        protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
        invitationId: material.invitationId,
        clientPublicKey: client.publicKeySpkiBase64Url,
        clientProofSignature: statusProof(material.invitationId, client),
      });
      expect(st.status).toBe('REJECTED');
      expect(st.terminalId).toBeNull();
    });

    it('keeps remote exposure gated; env alone cannot enable', () => {
      expect(REMOTE_LAN_EXPOSURE_READY).toBe(false);
      expect(isRemoteLanPairingEnabled()).toBe(false);
      const prev = process.env.FARMAX_POS_ALLOW_REMOTE_LAN;
      process.env.FARMAX_POS_ALLOW_REMOTE_LAN = '1';
      try {
        expect(isRemoteLanPairingEnabled()).toBe(false);
        const gate = evaluateRemoteExposureGate();
        expect(gate.featureReadyLatch).toBe(false);
        expect(gate.operatorAllowEnv).toBe(true);
        expect(gate.blockingReasons.some((r) => r.includes('feature_ready_latch'))).toBe(
          true,
        );
      } finally {
        if (prev === undefined) delete process.env.FARMAX_POS_ALLOW_REMOTE_LAN;
        else process.env.FARMAX_POS_ALLOW_REMOTE_LAN = prev;
      }
    });
  });
});
