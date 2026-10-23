import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import https from 'node:https';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { isWindowsPlatform } from '../../src/modules/lan/host-identity/windows-dpapi.js';
import {
  generateSelfSignedHostTlsCredential,
  materializeCredential,
} from '../../src/modules/lan/tls/tls-cert-generate.js';
import {
  MemoryTlsSecretStore,
  WindowsDpapiTlsSecretStore,
  wipeTlsSecretStoreFiles,
} from '../../src/modules/lan/tls/tls-secret-store.js';
import {
  getClientTrustPinMaterial,
  setTlsSecretStoreForTests,
  TlsCertificateService,
  useMemoryTlsSecretStore,
} from '../../src/modules/lan/tls/tls-certificate.service.js';
import {
  assertLoopbackHost,
  isLoopbackBindAddress,
  startLoopbackHttpsServer,
} from '../../src/modules/lan/tls/https-server.js';
import {
  createHostAttestationOrThrow,
  isRemoteLanPairingEnabled,
  setLanTlsCertificateDer,
} from '../../src/modules/lan/lan-pairing-gate.js';
import {
  verifyHostAttestation,
  sha256HexOfDer,
} from '../../src/modules/lan/crypto/host-attestation.js';
import {
  HostIdentityService,
  useMemoryHostSecretStore,
} from '../../src/modules/lan/host-identity/host-identity.service.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('Phase 2D.6 TLS provisioning and client trust foundation', () => {
  beforeEach(() => {
    setTlsSecretStoreForTests(null);
    useMemoryTlsSecretStore();
    useMemoryHostSecretStore();
    setLanTlsCertificateDer(null);
  });

  afterAll(() => {
    setTlsSecretStoreForTests(null);
    setLanTlsCertificateDer(null);
  });

  const requireWindows = () => {
    if (!isWindowsPlatform()) {
      return false;
    }
    return true;
  };

  describe('certificate generation and persistence', () => {
    it('generates a self-signed RSA cert and DPAPI-persists across reload on Windows', function () {
      if (!requireWindows()) {
        // eslint-disable-next-line no-invalid-this
        this.skip();
        return;
      }

      const dir = mkdtempSync(join(tmpdir(), 'farmax-tls-'));
      wipeTlsSecretStoreFiles(dir);
      const store = new WindowsDpapiTlsSecretStore(dir);
      setTlsSecretStoreForTests(store);

      const first = TlsCertificateService.ensureCertificate();
      expect(first.fingerprintSha256Hex).toHaveLength(64);

      const again = TlsCertificateService.ensureCertificate();
      expect(again.fingerprintSha256Hex).toBe(first.fingerprintSha256Hex);

      setTlsSecretStoreForTests(new WindowsDpapiTlsSecretStore(dir));
      const reloaded = TlsCertificateService.getPublicMeta();
      expect(reloaded?.fingerprintSha256Hex).toBe(first.fingerprintSha256Hex);
      const der = TlsCertificateService.getCertificateDer();
      expect(sha256HexOfDer(der)).toBe(first.fingerprintSha256Hex);

      wipeTlsSecretStoreFiles(dir);
    });

    it('fingerprint stays stable until explicit rotation', () => {
      useMemoryTlsSecretStore();
      const a = TlsCertificateService.ensureCertificate();
      const b = TlsCertificateService.ensureCertificate();
      expect(b.fingerprintSha256Hex).toBe(a.fingerprintSha256Hex);

      const rotated = TlsCertificateService.rotateCertificate();
      expect(rotated.fingerprintSha256Hex).not.toBe(a.fingerprintSha256Hex);
      expect(rotated.previousFingerprintSha256Hex).toBe(a.fingerprintSha256Hex);
    });
  });

  describe('fail-closed storage and validation', () => {
    it('rejects corrupted certificate DER', () => {
      useMemoryTlsSecretStore();
      expect(() =>
        materializeCredential(Buffer.from('not-a-cert'), Buffer.from('not-a-key')),
      ).toThrow(/corrupt|valid/i);
    });

    it('rejects mismatched cert/key and fingerprint metadata drift', () => {
      const store = useMemoryTlsSecretStore();
      const credA = generateSelfSignedHostTlsCredential();
      const credB = generateSelfSignedHostTlsCredential();
      expect(() =>
        materializeCredential(credA.certificateDer, credB.privateKeyPkcs8Der),
      ).toThrow(/does not match/i);

      TlsCertificateService.importCredential({
        certificateDer: credA.certificateDer,
        privateKeyPkcs8Der: credA.privateKeyPkcs8Der,
      });
      store.writeMeta({
        version: 1,
        fingerprintSha256Hex: '0'.repeat(64),
        subject: 'CN=tampered',
        notBefore: new Date().toISOString(),
        notAfter: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      });
      expect(() => TlsCertificateService.getCertificateDer()).toThrow(/fingerprint/i);
    });

    it('fails closed when private key is missing from store', () => {
      const store = new MemoryTlsSecretStore();
      setTlsSecretStoreForTests(store);
      store.writeMeta({
        version: 1,
        fingerprintSha256Hex: 'ab'.repeat(32),
        subject: 'CN=missing-key',
        notBefore: new Date().toISOString(),
        notAfter: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      });
      store.storeCertificateDer(Buffer.from('x'));
      expect(() => TlsCertificateService.getHttpsCredentials()).toThrow();
    });
  });

  describe('attestation binding and verification', () => {
    it('signs attestation bound to active TLS cert and verifies with out-of-band pin', () => {
      useMemoryTlsSecretStore();
      useMemoryHostSecretStore();
      const tls = TlsCertificateService.ensureCertificate();
      HostIdentityService.ensureKeyPair();
      const invitationId = randomUUID();
      const att = createHostAttestationOrThrow({ invitationId });

      expect(att.claims.tlsCertificateFingerprintSha256Hex).toBe(tls.fingerprintSha256Hex);
      expect(att.claims.hostFingerprintSha256Hex).toBe(
        HostIdentityService.getPublicMeta()!.fingerprintSha256Hex,
      );

      const hostPub = HostIdentityService.getPublicMeta()!.publicKeySpkiB64;
      const ok = verifyHostAttestation({
        document: att,
        hostPublicKeySpkiB64: hostPub,
        expectedInvitationId: invitationId,
        expectedTlsCertificateFingerprintSha256Hex: tls.fingerprintSha256Hex,
        presentedTlsCertificateDer: TlsCertificateService.getCertificateDer(),
      });
      expect(ok.ok).toBe(true);

      const badPin = verifyHostAttestation({
        document: att,
        hostPublicKeySpkiB64: hostPub,
        expectedInvitationId: invitationId,
        expectedTlsCertificateFingerprintSha256Hex: 'ff'.repeat(32),
      });
      expect(badPin.ok).toBe(false);
      if (!badPin.ok) expect(badPin.reason).toBe('TLS_FINGERPRINT_MISMATCH');

      const badSig = {
        claims: att.claims,
        signature: 'AAAA',
      };
      const sigFail = verifyHostAttestation({
        document: badSig,
        hostPublicKeySpkiB64: hostPub,
        expectedInvitationId: invitationId,
        expectedTlsCertificateFingerprintSha256Hex: tls.fingerprintSha256Hex,
      });
      expect(sigFail.ok).toBe(false);
    });

    it('trust pin material never includes private keys', () => {
      useMemoryTlsSecretStore();
      TlsCertificateService.ensureCertificate();
      const pin = getClientTrustPinMaterial();
      expect(pin.tlsCertificateFingerprintSha256Hex).toHaveLength(64);
      expect(pin.tlsCertificateDerBase64.length).toBeGreaterThan(20);
      expect(JSON.stringify(pin).toLowerCase()).not.toContain('private');
      expect(pin.note).toMatch(/out-of-band/i);
    });
  });

  describe('HTTPS listener', () => {
    it('starts loopback HTTPS with a valid certificate', async () => {
      useMemoryTlsSecretStore();
      TlsCertificateService.ensureCertificate();
      const mini = express();
      mini.get('/health', (_req, res) => res.status(200).json({ ok: true }));

      const listened = await startLoopbackHttpsServer({
        app: mini,
        host: '127.0.0.1',
        port: 0,
      });
      const addr = listened.server.address();
      expect(addr).toBeTruthy();
      if (addr && typeof addr === 'object') {
        expect(addr.address === '127.0.0.1' || addr.address === '::ffff:127.0.0.1').toBe(true);
      }

      await new Promise<void>((resolve, reject) => {
        const port = typeof addr === 'object' && addr ? addr.port : listened.port;
        const req = https.get(
          {
            host: '127.0.0.1',
            port,
            path: '/health',
            rejectUnauthorized: false,
            servername: 'localhost',
          },
          (res) => {
            expect(res.statusCode).toBe(200);
            res.resume();
            resolve();
          },
        );
        req.on('error', reject);
      });

      await new Promise<void>((resolve) => listened.server.close(() => resolve()));
    });

    it('refuses non-loopback HTTPS bind', () => {
      expect(() => assertLoopbackHost('0.0.0.0')).toThrow(/non-loopback/i);
      expect(() => assertLoopbackHost('192.168.1.10')).toThrow(/non-loopback/i);
      expect(isLoopbackBindAddress('127.0.0.1')).toBe(true);
      expect(isLoopbackBindAddress('0.0.0.0')).toBe(false);
    });
  });

  describe('remote pairing remains gated', () => {
    it('keeps pairing protocol disabled without activated host even when TLS exists', async () => {
      useMemoryTlsSecretStore();
      TlsCertificateService.ensureCertificate();
      // Remote non-loopback stays off; protocol also requires activated host identity.
      expect(isRemoteLanPairingEnabled()).toBe(false);
      const res = await request(app).post('/api/v1/lan/v1/pairing/hello').send({});
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(ErrorCode.LAN_PAIRING_DISABLED);
    });
  });
});
