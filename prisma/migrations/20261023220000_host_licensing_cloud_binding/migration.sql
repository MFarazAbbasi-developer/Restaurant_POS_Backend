-- Phase 2D.4: durable host licensing binding metadata (public only; no private keys).

ALTER TABLE "host_licensing_trust_states" ADD COLUMN "licenseId" TEXT;
ALTER TABLE "host_licensing_trust_states" ADD COLUMN "hostPublicKeySpkiB64" TEXT;
ALTER TABLE "host_licensing_trust_states" ADD COLUMN "hostKeyFingerprintSha256Hex" TEXT;
ALTER TABLE "host_licensing_trust_states" ADD COLUMN "installationNonce" TEXT;
ALTER TABLE "host_licensing_trust_states" ADD COLUMN "lastSuccessfulRefreshAt" TIMESTAMP(3);
ALTER TABLE "host_licensing_trust_states" ADD COLUMN "lastRefreshAttemptAt" TIMESTAMP(3);
ALTER TABLE "host_licensing_trust_states" ADD COLUMN "lastRefreshError" TEXT;
