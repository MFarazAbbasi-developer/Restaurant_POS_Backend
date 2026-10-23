import { randomUUID, type KeyObject } from 'node:crypto';
import {
  buildHostRequestCanonicalString,
  hashActivationCodePlaintext,
  sha256Hex,
  signActivationRecovery,
  signHostRequestCanonical,
} from './crypto/host-request.js';
import type { SignedEntitlement } from './crypto/entitlement-verify.js';
import {
  isLicensingCloudError,
  isUnsafeBlindRetry,
  LicensingCloudError,
} from './licensing-cloud.errors.js';

/**
 * Plane A licensing-cloud adapter (Phase 2D.4).
 * Uses FARMAX-HOST-REQUEST-V1 exactly as documented by farmax-licensing-api.
 */

export type CloudDeactivateTerminalInput = {
  installationId: string;
  terminalId: string;
  reason?: string;
};

export type CloudRedeemActivationInput = {
  activationCode: string;
  installationNonce: string;
  hostPublicKey: string;
  hostLabel?: string;
  /** Required when recovering a lost first-redeem response. */
  hostProofSignature?: string;
  /** Private key used only to mint recovery proof when hostProofSignature omitted. */
  hostPrivateKey?: KeyObject;
};

export type CloudRedeemActivationResult = {
  installationId: string;
  licenseId: string;
  seatLimit: number;
  hostCountsAsSeat: true;
  recovered: boolean;
  entitlement: SignedEntitlement;
  serverTime: string;
};

export type CloudRefreshEntitlementResult = {
  installationId: string;
  licenseId: string;
  entitlementIssueId: string;
  entitlement: SignedEntitlement;
  serverTime: string;
  paidThroughUnchanged: true;
};

export type CloudTerminalSummary = {
  terminalId: string;
  label: string | null;
  status: string;
  activatedAt: string;
  deactivatedAt: string | null;
  deviceFingerprintPrefix: string | null;
};

export type CloudTerminalListResult = {
  installationId: string;
  licenseId: string;
  host: {
    countsAsSeat: true;
    status: string;
    activatedAt: string;
    hostLabel: string | null;
  };
  terminals: CloudTerminalSummary[];
  seats: {
    seatLimit: number;
    hostCountsAsSeat: true;
    hostSeatsUsed: 1;
    additionalTerminalsActive: number;
    additionalTerminalsAllowed: number;
    seatsUsed: number;
    seatsAvailable: number;
  };
  serverTime: string;
};

export type CloudRegisterTerminalResult = {
  idempotent: boolean;
  terminal: CloudTerminalSummary;
  seats: CloudTerminalListResult['seats'];
};

export type CloudDeactivateTerminalResult = {
  idempotent: boolean;
  terminal: CloudTerminalSummary;
  seats: CloudTerminalListResult['seats'];
};

export type CloudReplaceTerminalResult = {
  replacedTerminal: CloudTerminalSummary;
  terminal: CloudTerminalSummary;
  seats: CloudTerminalListResult['seats'];
};

export interface LicensingCloudClient {
  redeemActivation(input: CloudRedeemActivationInput): Promise<CloudRedeemActivationResult>;
  refreshEntitlement(input: {
    installationId: string;
  }): Promise<CloudRefreshEntitlementResult>;
  listTerminals(input: { installationId: string }): Promise<CloudTerminalListResult>;
  registerTerminal(input: {
    installationId: string;
    terminalPublicKey: string;
    label?: string;
  }): Promise<CloudRegisterTerminalResult>;
  deactivateTerminal(
    input: CloudDeactivateTerminalInput,
  ): Promise<CloudDeactivateTerminalResult | void>;
  replaceTerminal(input: {
    installationId: string;
    terminalId: string;
    newTerminalPublicKey: string;
    reason?: string;
  }): Promise<CloudReplaceTerminalResult>;
}

export type HttpLicensingCloudClientOptions = {
  baseUrl: string;
  /** Signer for authenticated host routes. */
  getPrivateKey: () => KeyObject;
  connectTimeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
};

type EnvelopeSuccess<T> = { success: true; data: T };
type EnvelopeError = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};

let injected: LicensingCloudClient | null = null;

/** Test / wiring: inject a client (or real HTTP client at boot). */
export function setLicensingCloudClient(client: LicensingCloudClient | null): void {
  injected = client;
}

export function getLicensingCloudClient(): LicensingCloudClient | null {
  return injected;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyHttpFailure(status: number, remoteCode?: string): {
  kind: LicensingCloudError['kind'];
  retryable: boolean;
} {
  if (status === 401 || remoteCode?.startsWith('HOST_AUTH_')) {
    return { kind: 'auth', retryable: false };
  }
  if (status === 429) {
    return { kind: 'denied', retryable: true };
  }
  if (status >= 500) {
    return { kind: 'network', retryable: true };
  }
  if (
    remoteCode === 'LICENSE_SUSPENDED' ||
    remoteCode === 'ACTIVATION_CODE_INVALID' ||
    remoteCode === 'ACTIVATION_CODE_EXPIRED' ||
    remoteCode === 'ACTIVATION_CODE_REVOKED' ||
    remoteCode === 'ACTIVATION_CODE_CONSUMED' ||
    remoteCode === 'LICENSE_NOT_ISSUABLE' ||
    remoteCode === 'SUBSCRIPTION_EXPIRED' ||
    remoteCode === 'SUBSCRIPTION_PAST_DUE' ||
    remoteCode === 'INSTALLATION_REVOKED' ||
    remoteCode === 'ENTITLEMENT_REVOKED' ||
    remoteCode === 'FORBIDDEN'
  ) {
    return { kind: 'denied', retryable: false };
  }
  if (status === 409) {
    return { kind: 'conflict', retryable: false };
  }
  if (status >= 400) {
    return { kind: 'denied', retryable: false };
  }
  return { kind: 'unknown', retryable: false };
}

/**
 * Production HTTP client for farmax-licensing-api `/v1` host routes.
 */
export class HttpLicensingCloudClient implements LicensingCloudClient {
  private readonly baseUrl: string;
  private readonly getPrivateKey: () => KeyObject;
  private readonly connectTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpLicensingCloudClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getPrivateKey = options.getPrivateKey;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async redeemActivation(
    input: CloudRedeemActivationInput,
  ): Promise<CloudRedeemActivationResult> {
    let hostProofSignature = input.hostProofSignature;
    if (!hostProofSignature && input.hostPrivateKey) {
      hostProofSignature = signActivationRecovery(
        {
          codeHash: hashActivationCodePlaintext(input.activationCode),
          installationNonce: input.installationNonce,
          hostPublicKeySpkiB64: input.hostPublicKey,
        },
        input.hostPrivateKey,
      );
    }

    const bodyObj: Record<string, string> = {
      activationCode: input.activationCode,
      installationNonce: input.installationNonce,
      hostPublicKey: input.hostPublicKey,
    };
    if (input.hostLabel) bodyObj.hostLabel = input.hostLabel;
    if (hostProofSignature) bodyObj.hostProofSignature = hostProofSignature;

    // Redeem is unauthenticated; recovery proof makes lost-response retry safe.
    // Do not blind-retry without proof after a timeout (may have committed).
    return this.requestJson<CloudRedeemActivationResult>({
      method: 'POST',
      path: '/v1/activations/redeem',
      body: bodyObj,
      signed: false,
      idempotent: Boolean(hostProofSignature),
      allowRetryWithoutIdempotency: false,
    });
  }

  public async refreshEntitlement(input: {
    installationId: string;
  }): Promise<CloudRefreshEntitlementResult> {
    return this.requestJson<CloudRefreshEntitlementResult>({
      method: 'POST',
      path: `/v1/installations/${input.installationId}/entitlements/refresh`,
      body: {},
      signed: true,
      installationId: input.installationId,
      idempotent: true,
    });
  }

  public async listTerminals(input: {
    installationId: string;
  }): Promise<CloudTerminalListResult> {
    return this.requestJson<CloudTerminalListResult>({
      method: 'GET',
      path: `/v1/installations/${input.installationId}/terminals`,
      signed: true,
      installationId: input.installationId,
      idempotent: true,
    });
  }

  public async registerTerminal(input: {
    installationId: string;
    terminalPublicKey: string;
    label?: string;
  }): Promise<CloudRegisterTerminalResult> {
    const body: Record<string, string> = {
      terminalPublicKey: input.terminalPublicKey,
    };
    if (input.label) body.label = input.label;
    // Same ACTIVE fingerprint is idempotent on the server (200).
    // Lost response: safe to retry with same key.
    return this.requestJson<CloudRegisterTerminalResult>({
      method: 'POST',
      path: `/v1/installations/${input.installationId}/terminals`,
      body,
      signed: true,
      installationId: input.installationId,
      idempotent: true,
    });
  }

  public async deactivateTerminal(
    input: CloudDeactivateTerminalInput,
  ): Promise<CloudDeactivateTerminalResult> {
    const body: Record<string, string> = {};
    if (input.reason) body.reason = input.reason;
    // Already-inactive is idempotent on the server.
    return this.requestJson<CloudDeactivateTerminalResult>({
      method: 'POST',
      path: `/v1/installations/${input.installationId}/terminals/${input.terminalId}/deactivate`,
      body,
      signed: true,
      installationId: input.installationId,
      idempotent: true,
    });
  }

  public async replaceTerminal(input: {
    installationId: string;
    terminalId: string;
    newTerminalPublicKey: string;
    reason?: string;
  }): Promise<CloudReplaceTerminalResult> {
    const body: Record<string, string> = {
      newTerminalPublicKey: input.newTerminalPublicKey,
    };
    if (input.reason) body.reason = input.reason;
    // Replace is NOT idempotent. Never blind-retry on timeout — caller must list + recover.
    try {
      return await this.requestJson<CloudReplaceTerminalResult>({
        method: 'POST',
        path: `/v1/installations/${input.installationId}/terminals/${input.terminalId}/replace`,
        body,
        signed: true,
        installationId: input.installationId,
        idempotent: false,
        allowRetryWithoutIdempotency: false,
        maxRetriesOverride: 0,
      });
    } catch (err) {
      if (isUnsafeBlindRetry(err) || (isLicensingCloudError(err) && err.kind === 'timeout')) {
        throw new LicensingCloudError({
          kind: 'timeout',
          message:
            'Terminal replace response lost; do not retry blindly — reconcile via list + local key knowledge',
          retryable: false,
          cause: err,
        });
      }
      throw err;
    }
  }

  private async requestJson<T>(args: {
    method: 'GET' | 'POST';
    path: string;
    query?: string;
    body?: unknown;
    signed: boolean;
    installationId?: string;
    idempotent: boolean;
    allowRetryWithoutIdempotency?: boolean;
    maxRetriesOverride?: number;
  }): Promise<T> {
    const maxRetries = args.maxRetriesOverride ?? this.maxRetries;
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      try {
        return await this.once<T>(args);
      } catch (err) {
        lastError = err;
        const retryable =
          isLicensingCloudError(err) &&
          err.retryable &&
          (args.idempotent || args.allowRetryWithoutIdempotency === true);
        if (!retryable || attempt >= maxRetries) {
          throw err;
        }
        await sleep(100 * 2 ** attempt);
        attempt += 1;
      }
    }
    throw lastError;
  }

  private async once<T>(args: {
    method: 'GET' | 'POST';
    path: string;
    query?: string;
    body?: unknown;
    signed: boolean;
    installationId?: string;
  }): Promise<T> {
    const query = args.query ?? '';
    const rawBody =
      args.method === 'GET' || args.body === undefined
        ? Buffer.alloc(0)
        : Buffer.from(JSON.stringify(args.body), 'utf8');

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (rawBody.length > 0) {
      headers['Content-Type'] = 'application/json';
    }

    if (args.signed) {
      if (!args.installationId) {
        throw new LicensingCloudError({
          kind: 'malformed',
          message: 'installationId required for signed host request',
          retryable: false,
        });
      }
      const timestamp = new Date().toISOString();
      const nonce = randomUUID();
      const canonical = buildHostRequestCanonicalString({
        method: args.method,
        path: args.path,
        query,
        installationId: args.installationId,
        timestamp,
        nonce,
        bodySha256Hex: sha256Hex(rawBody),
      });
      const signature = signHostRequestCanonical(canonical, this.getPrivateKey());
      headers['X-Farmax-Installation-Id'] = args.installationId;
      headers['X-Farmax-Timestamp'] = timestamp;
      headers['X-Farmax-Nonce'] = nonce;
      headers['X-Farmax-Signature'] = signature;
    }

    const url = `${this.baseUrl}${args.path}${query ? `?${query}` : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.connectTimeoutMs);

    let response: Response;
    try {
      const init: RequestInit = {
        method: args.method,
        headers,
        signal: controller.signal,
      };
      if (rawBody.length > 0) {
        init.body = rawBody;
      }
      response = await this.fetchImpl(url, init);
    } catch (err) {
      clearTimeout(timer);
      const aborted =
        (err instanceof Error && err.name === 'AbortError') ||
        (typeof err === 'object' &&
          err !== null &&
          'name' in err &&
          (err as { name: string }).name === 'AbortError');
      throw new LicensingCloudError({
        kind: aborted ? 'timeout' : 'network',
        message: aborted
          ? 'Licensing cloud request timed out'
          : 'Licensing cloud network failure',
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    const text = await response.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new LicensingCloudError({
        kind: 'malformed',
        message: 'Licensing cloud returned non-JSON body',
        httpStatus: response.status,
        retryable: false,
      });
    }

    if (!response.ok) {
      const env = json as EnvelopeError | null;
      const remoteCode = env?.error?.code;
      const remoteMessage = env?.error?.message ?? `HTTP ${response.status}`;
      const classified = classifyHttpFailure(response.status, remoteCode);
      throw new LicensingCloudError({
        kind: classified.kind,
        message: remoteMessage,
        httpStatus: response.status,
        ...(remoteCode !== undefined ? { remoteCode } : {}),
        retryable: classified.retryable,
      });
    }

    const env = json as EnvelopeSuccess<T> | null;
    if (!env || env.success !== true || env.data === undefined) {
      throw new LicensingCloudError({
        kind: 'malformed',
        message: 'Licensing cloud success envelope missing data',
        httpStatus: response.status,
        retryable: false,
      });
    }
    return env.data;
  }
}
