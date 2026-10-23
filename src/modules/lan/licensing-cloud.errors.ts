/**
 * Classified failures from the host → licensing-cloud HTTP client.
 * Callers must not treat network outage as licensing denial (and vice versa).
 */

export type LicensingCloudFailureKind =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'denied'
  | 'malformed'
  | 'conflict'
  | 'unknown';

export class LicensingCloudError extends Error {
  public readonly kind: LicensingCloudFailureKind;
  public readonly httpStatus?: number;
  public readonly remoteCode?: string;
  public readonly retryable: boolean;

  constructor(args: {
    kind: LicensingCloudFailureKind;
    message: string;
    httpStatus?: number;
    remoteCode?: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(args.message, args.cause !== undefined ? { cause: args.cause } : undefined);
    this.name = 'LicensingCloudError';
    this.kind = args.kind;
    if (args.httpStatus !== undefined) this.httpStatus = args.httpStatus;
    if (args.remoteCode !== undefined) this.remoteCode = args.remoteCode;
    this.retryable =
      args.retryable ??
      (args.kind === 'network' || args.kind === 'timeout' || args.httpStatus === 429);
  }
}

export function isLicensingCloudError(err: unknown): err is LicensingCloudError {
  return err instanceof LicensingCloudError;
}

/** True when a blind retry of a non-idempotent mutation is unsafe (result may have committed). */
export function isUnsafeBlindRetry(err: unknown): boolean {
  if (!(err instanceof LicensingCloudError)) return false;
  // Timeout / aborted after request may have been accepted by the server.
  return err.kind === 'timeout' || (err.kind === 'network' && err.message.includes('aborted'));
}
