import { z } from 'zod';
import { LAN_PAIRING_PROTOCOL_VERSION } from './crypto/pairing-invitation-token.js';

export const denyLanTerminalBodySchema = z
  .object({
    terminalId: z.string().uuid(),
    managerPin: z.string().min(4).max(12),
    reason: z.string().min(1).max(500).optional(),
    installationId: z.string().uuid().optional(),
  })
  .strict();

export const retryLanTerminalSyncBodySchema = z
  .object({
    terminalId: z.string().uuid(),
    managerPin: z.string().min(4).max(12),
    installationId: z.string().uuid(),
  })
  .strict();

export const upsertLanTerminalBodySchema = z
  .object({
    terminalId: z.string().uuid(),
    publicKeySpki: z.string().min(40).max(200),
    label: z.string().min(1).max(200).optional(),
  })
  .strict();

export const createLanPairingInvitationBodySchema = z
  .object({
    managerPin: z.string().min(4).max(12),
    httpsBaseHint: z.string().min(8).max(200).optional(),
  })
  .strict();

export const cancelLanPairingInvitationBodySchema = z
  .object({
    managerPin: z.string().min(4).max(12),
    invitationId: z.string().uuid().optional(),
  })
  .strict();

export const approveLanPairingBodySchema = z
  .object({
    invitationId: z.string().uuid(),
    managerPin: z.string().min(4).max(12),
  })
  .strict();

export const pairingHelloBodySchema = z
  .object({
    protocolVersion: z.number().int().positive().default(LAN_PAIRING_PROTOCOL_VERSION),
    invitationId: z.string().uuid(),
  })
  .strict();

export const pairingCompleteBodySchema = z
  .object({
    protocolVersion: z.number().int().positive().default(LAN_PAIRING_PROTOCOL_VERSION),
    invitationId: z.string().uuid(),
    invitationToken: z.string().min(16).max(64),
    clientPublicKey: z.string().min(40).max(200),
    clientProofSignature: z.string().min(40).max(200),
    label: z.string().min(1).max(200).optional(),
  })
  .strict();

/** Authenticated status / recovery poll — no invitation token; possession proof required. */
export const pairingStatusBodySchema = z
  .object({
    protocolVersion: z.number().int().positive().default(LAN_PAIRING_PROTOCOL_VERSION),
    invitationId: z.string().uuid(),
    clientPublicKey: z.string().min(40).max(200),
    clientProofSignature: z.string().min(40).max(200),
  })
  .strict();
