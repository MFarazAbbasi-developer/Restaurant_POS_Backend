import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  X509Certificate,
  type KeyObject,
} from 'node:crypto';
import { sha256HexOfDer } from '../crypto/host-attestation.js';

/**
 * Generate a host TLS credential (RSA) distinct from the Ed25519 licensing host key.
 * Pure Node implementation — no PowerShell/.NET PKCS#8 export dependency.
 */

export type GeneratedTlsCredential = {
  /** X.509 certificate DER (public). */
  certificateDer: Buffer;
  /** PKCS#8 RSA private key DER. */
  privateKeyPkcs8Der: Buffer;
  fingerprintSha256Hex: string;
  notBefore: Date;
  notAfter: Date;
  subject: string;
};

function derLen(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  if (n < 0x100) return Buffer.from([0x81, n]);
  if (n < 0x10000) return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]);
  throw new Error('DER length too large');
}

function derTlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}

function derOid(oid: string): Buffer {
  const parts = oid.split('.').map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts[0] === undefined || parts[1] === undefined) {
    throw new Error('Invalid OID');
  }
  const body: number[] = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i]!;
    if (v < 0) throw new Error('Invalid OID component');
    const stack: number[] = [];
    stack.push(v & 0x7f);
    v >>= 7;
    while (v > 0) {
      stack.push(0x80 | (v & 0x7f));
      v >>= 7;
    }
    for (let j = stack.length - 1; j >= 0; j--) body.push(stack[j]!);
  }
  return derTlv(0x06, Buffer.from(body));
}

function derIntegerBytes(bytes: Buffer): Buffer {
  let b = bytes;
  while (b.length > 1 && b[0] === 0x00 && (b[1]! & 0x80) === 0) {
    b = b.subarray(1);
  }
  if (b[0]! & 0x80) {
    b = Buffer.concat([Buffer.from([0x00]), b]);
  }
  return derTlv(0x02, b);
}

function derPrintableOrUtf8(cn: string): Buffer {
  // UTF8String
  return derTlv(0x0c, Buffer.from(cn, 'utf8'));
}

function derName(cn: string): Buffer {
  const attrType = derOid('2.5.4.3'); // commonName
  const attrValue = derPrintableOrUtf8(cn);
  const atv = derTlv(0x30, Buffer.concat([attrType, attrValue]));
  const rdn = derTlv(0x31, atv);
  return derTlv(0x30, rdn);
}

function derTime(d: Date): Buffer {
  // GeneralizedTime YYYYMMDDHHmmssZ
  const iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // toISOString → 20261023T182600Z → need 20261023182600Z
  const g = iso.replace('T', '').replace('Z', '') + 'Z';
  return derTlv(0x18, Buffer.from(g, 'ascii'));
}

function derExtension(oid: string, critical: boolean, value: Buffer): Buffer {
  const parts = [derOid(oid)];
  if (critical) parts.push(Buffer.from([0x01, 0x01, 0xff])); // BOOLEAN TRUE
  parts.push(derTlv(0x04, value)); // OCTET STRING wrapping extension value
  return derTlv(0x30, Buffer.concat(parts));
}

function buildSanExtension(): Buffer {
  // GeneralNames: [2] DNS localhost, [7] IP 127.0.0.1
  const dns = derTlv(0x82, Buffer.from('localhost', 'ascii'));
  const ip = derTlv(0x87, Buffer.from([127, 0, 0, 1]));
  const generalNames = derTlv(0x30, Buffer.concat([dns, ip]));
  return derExtension('2.5.29.17', false, generalNames);
}

function buildBasicConstraints(): Buffer {
  // SEQUENCE { cA FALSE } — empty sequence is fine for end-entity
  const seq = derTlv(0x30, Buffer.alloc(0));
  return derExtension('2.5.29.19', true, seq);
}

function buildKeyUsage(): Buffer {
  // digitalSignature (0) + keyEncipherment (2) → bits 0 and 2 → 0b10100000 = 0xa0, unused bits 5
  const bitString = Buffer.from([0x03, 0x02, 0x05, 0xa0]);
  return derExtension('2.5.29.15', true, bitString);
}

function buildEkuServerAuth(): Buffer {
  const serverAuth = derOid('1.3.6.1.5.5.7.3.1');
  const seq = derTlv(0x30, serverAuth);
  return derExtension('2.5.29.37', false, seq);
}

/**
 * Create a self-signed RSA-2048 certificate for loopback LAN HTTPS.
 * SAN: DNS:localhost, IP:127.0.0.1. Validity default 825 days.
 */
export function generateSelfSignedHostTlsCredential(input?: {
  commonName?: string;
  validityDays?: number;
}): GeneratedTlsCredential {
  const cn = (input?.commonName ?? 'farmax-pos-lan-host').replace(/[^a-zA-Z0-9._-]/g, '');
  const days = Math.min(Math.max(input?.validityDays ?? 825, 1), 825);

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });

  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const notBefore = new Date(Date.now() - 5 * 60 * 1000);
  const notAfter = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const serial = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) serial[i] = Math.floor(Math.random() * 256);
  serial[0] = (serial[0]! & 0x7f) || 0x01;

  const version = derTlv(0xa0, derTlv(0x02, Buffer.from([0x02]))); // v3
  const serialTlv = derIntegerBytes(serial);
  const sigAlg = derTlv(
    0x30,
    Buffer.concat([derOid('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00])]),
  ); // sha256WithRSAEncryption + NULL
  const issuer = derName(cn);
  const validity = derTlv(0x30, Buffer.concat([derTime(notBefore), derTime(notAfter)]));
  const subject = derName(cn);
  // SubjectPublicKeyInfo is already a full DER SEQUENCE
  const spkiTlv = spki;
  const extensions = derTlv(
    0xa3,
    derTlv(
      0x30,
      Buffer.concat([
        buildBasicConstraints(),
        buildKeyUsage(),
        buildEkuServerAuth(),
        buildSanExtension(),
      ]),
    ),
  );

  const tbs = derTlv(
    0x30,
    Buffer.concat([version, serialTlv, sigAlg, issuer, validity, subject, spkiTlv, extensions]),
  );

  const signature = sign('sha256', tbs, privateKey);
  // BIT STRING: unused bits 0 + signature
  const sigBitString = derTlv(0x03, Buffer.concat([Buffer.from([0x00]), signature]));
  const certificateDer = derTlv(0x30, Buffer.concat([tbs, sigAlg, sigBitString]));
  const privateKeyPkcs8Der = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;

  return materializeCredential(certificateDer, privateKeyPkcs8Der);
}

/** Validate cert DER + PKCS8 key pair and compute public metadata. */
export function materializeCredential(
  certificateDer: Buffer,
  privateKeyPkcs8Der: Buffer,
): GeneratedTlsCredential {
  if (!certificateDer.length || !privateKeyPkcs8Der.length) {
    throw new Error('TLS credential buffers must be non-empty');
  }

  let x509: X509Certificate;
  try {
    x509 = new X509Certificate(certificateDer);
  } catch {
    throw new Error('TLS certificate DER is corrupt or not a valid X.509 certificate');
  }

  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: privateKeyPkcs8Der, format: 'der', type: 'pkcs8' });
  } catch {
    throw new Error('TLS private key PKCS#8 DER is corrupt or inaccessible');
  }

  if (privateKey.asymmetricKeyType === 'ed25519') {
    throw new Error('TLS private key must not be the Ed25519 licensing host key');
  }
  if (privateKey.asymmetricKeyType !== 'rsa' && privateKey.asymmetricKeyType !== 'ec') {
    throw new Error(`Unsupported TLS private key type: ${privateKey.asymmetricKeyType}`);
  }

  // Node X509Certificate.publicKey is already a public KeyObject.
  const certPublic: KeyObject = x509.publicKey;
  const certSpki = certPublic.export({ type: 'spki', format: 'der' }) as Buffer;
  const keyPublic = createPublicKey(privateKey);
  const keySpki = keyPublic.export({ type: 'spki', format: 'der' }) as Buffer;
  if (!certSpki.equals(keySpki)) {
    throw new Error('TLS certificate public key does not match private key');
  }

  // Ensure the certificate verifies against its own public key (self-signed).
  const ok = x509.verify(certPublic);
  if (!ok) {
    throw new Error('TLS certificate signature does not verify with its public key');
  }

  return {
    certificateDer: Buffer.from(certificateDer),
    privateKeyPkcs8Der: Buffer.from(privateKeyPkcs8Der),
    fingerprintSha256Hex: sha256HexOfDer(certificateDer),
    notBefore: new Date(x509.validFrom),
    notAfter: new Date(x509.validTo),
    subject: x509.subject,
  };
}

export function tlsCredentialToPem(credential: GeneratedTlsCredential): {
  certPem: string;
  keyPem: string;
} {
  const certPem =
    '-----BEGIN CERTIFICATE-----\n' +
    credential.certificateDer.toString('base64').match(/.{1,64}/g)!.join('\n') +
    '\n-----END CERTIFICATE-----\n';
  const keyPem = createPrivateKey({
    key: credential.privateKeyPkcs8Der,
    format: 'der',
    type: 'pkcs8',
  })
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  return { certPem, keyPem };
}
