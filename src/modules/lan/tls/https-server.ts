import https from 'node:https';
import type { Server as HttpsServer } from 'node:https';
import type { Application } from 'express';
import { AppError } from '../../../common/errors/app-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { TlsCertificateService } from './tls-certificate.service.js';

/**
 * Loopback-only HTTPS listener (Phase 2D.6).
 * Never binds non-loopback addresses here — remote LAN exposure stays gated on
 * client trust distribution + pairing (still disabled).
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export type LanHttpsListenResult = {
  server: HttpsServer;
  host: string;
  port: number;
  fingerprintSha256Hex: string;
};

export function assertLoopbackHost(host: string): void {
  const normalized = host.trim().toLowerCase();
  if (!LOOPBACK_HOSTS.has(normalized)) {
    throw new AppError(
      `Refusing HTTPS bind to non-loopback host "${host}". Remote LAN exposure is not enabled.`,
      500,
      ErrorCode.LAN_TLS_REQUIRED,
    );
  }
}

/**
 * Create and listen on HTTPS using the provisioned host TLS credential.
 * @param host must be loopback (127.0.0.1 / ::1 / localhost)
 */
export function startLoopbackHttpsServer(input: {
  app: Application;
  host: string;
  port: number;
}): Promise<LanHttpsListenResult> {
  assertLoopbackHost(input.host);
  const creds = TlsCertificateService.getHttpsCredentials();

  const server = https.createServer(
    {
      cert: creds.cert,
      key: creds.key,
      minVersion: 'TLSv1.2',
    },
    input.app,
  );

  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve({
        server,
        host: input.host,
        port: input.port,
        fingerprintSha256Hex: creds.fingerprintSha256Hex,
      });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(input.port, input.host);
  });
}

/** True when address is loopback-only (for tests / introspection). */
export function isLoopbackBindAddress(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}
