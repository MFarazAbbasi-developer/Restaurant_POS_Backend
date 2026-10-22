-- FARMAX POS naming release: loyalty program default + legacy default-name conversion.
-- Historical migrations are immutable; this migration is additive only.
--
-- 1) New installs / omitted programName → FARMAX Rewards Club
-- 2) Existing rows updated ONLY when programName exactly matches known legacy defaults.
--    Custom operator-configured names are preserved.

ALTER TABLE "loyalty_programs" ALTER COLUMN "programName" SET DEFAULT 'FARMAX Rewards Club';

UPDATE "loyalty_programs"
SET "programName" = 'FARMAX Rewards Club'
WHERE "programName" IN ('Faraz Rewards', 'Faraz Rewards Club');
