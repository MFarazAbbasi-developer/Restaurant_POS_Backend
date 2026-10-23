-- Phase 2D.3: host-local LAN terminal roster, Plane B nonces, licensing trust watermark.
-- Does not touch licensing-cloud databases. Never stores client private keys.

CREATE TYPE "LanTerminalLocalStatus" AS ENUM ('ACTIVE', 'DENIED');
CREATE TYPE "LanCloudSyncStatus" AS ENUM ('IN_SYNC', 'PENDING_DEACTIVATE', 'SYNC_FAILED');

CREATE TABLE "lan_terminals" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "publicKeySpkiB64" TEXT NOT NULL,
    "fingerprintSha256Hex" TEXT NOT NULL,
    "label" TEXT,
    "localStatus" "LanTerminalLocalStatus" NOT NULL DEFAULT 'ACTIVE',
    "cloudSyncStatus" "LanCloudSyncStatus" NOT NULL DEFAULT 'IN_SYNC',
    "deniedAt" TIMESTAMP(3),
    "deniedReason" TEXT,
    "deniedByUserId" TEXT,
    "lastCloudSyncAt" TIMESTAMP(3),
    "cloudSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lan_terminals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lan_terminal_request_nonces" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lan_terminal_request_nonces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "host_licensing_trust_states" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "lastTrustedUtc" TIMESTAMP(3) NOT NULL,
    "installationBindingId" TEXT,
    "cachedEntitlement" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "host_licensing_trust_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lan_terminals_restaurantId_terminalId_key" ON "lan_terminals"("restaurantId", "terminalId");
CREATE INDEX "lan_terminals_restaurantId_localStatus_idx" ON "lan_terminals"("restaurantId", "localStatus");
CREATE INDEX "lan_terminals_restaurantId_fingerprintSha256Hex_idx" ON "lan_terminals"("restaurantId", "fingerprintSha256Hex");
CREATE INDEX "lan_terminals_cloudSyncStatus_idx" ON "lan_terminals"("cloudSyncStatus");

CREATE UNIQUE INDEX "lan_terminal_request_nonces_restaurantId_terminalId_nonce_key" ON "lan_terminal_request_nonces"("restaurantId", "terminalId", "nonce");
CREATE INDEX "lan_terminal_request_nonces_expiresAt_idx" ON "lan_terminal_request_nonces"("expiresAt");
CREATE INDEX "lan_terminal_request_nonces_restaurantId_terminalId_idx" ON "lan_terminal_request_nonces"("restaurantId", "terminalId");

CREATE UNIQUE INDEX "host_licensing_trust_states_restaurantId_key" ON "host_licensing_trust_states"("restaurantId");

ALTER TABLE "lan_terminals" ADD CONSTRAINT "lan_terminals_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lan_terminal_request_nonces" ADD CONSTRAINT "lan_terminal_request_nonces_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "host_licensing_trust_states" ADD CONSTRAINT "host_licensing_trust_states_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
