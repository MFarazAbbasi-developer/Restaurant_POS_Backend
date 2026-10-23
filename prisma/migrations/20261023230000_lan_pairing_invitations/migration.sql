-- Phase 2D.7: short-lived single-use LAN pairing invitations.
-- Stores only a hash of the invitation secret — never the plaintext token.

CREATE TYPE "LanPairingInvitationStatus" AS ENUM (
  'OPEN',
  'AWAITING_APPROVAL',
  'REDEEMED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TABLE "lan_pairing_invitations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tokenHashSha256Hex" TEXT NOT NULL,
    "status" "LanPairingInvitationStatus" NOT NULL DEFAULT 'OPEN',
    "protocolVersion" INTEGER NOT NULL DEFAULT 1,
    "hostFingerprintSha256Hex" TEXT NOT NULL,
    "tlsCertificateFingerprintSha256Hex" TEXT NOT NULL,
    "installationBindingId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "createdByUserId" TEXT,
    "pendingClientPublicKeySpkiB64" TEXT,
    "pendingClientFingerprintSha256Hex" TEXT,
    "pendingClientLabel" TEXT,
    "redeemedTerminalId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lan_pairing_invitations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lan_pairing_invitations_restaurantId_status_idx" ON "lan_pairing_invitations"("restaurantId", "status");
CREATE INDEX "lan_pairing_invitations_expiresAt_idx" ON "lan_pairing_invitations"("expiresAt");
CREATE INDEX "lan_pairing_invitations_tokenHashSha256Hex_idx" ON "lan_pairing_invitations"("tokenHashSha256Hex");

ALTER TABLE "lan_pairing_invitations" ADD CONSTRAINT "lan_pairing_invitations_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
