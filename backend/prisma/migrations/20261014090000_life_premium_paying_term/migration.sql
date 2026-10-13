-- LIFE policies: years premiums must be paid, and whether this sale is the last premium year.
ALTER TABLE "sold_policies" ADD COLUMN "premiumPayingTerm" INTEGER;
ALTER TABLE "sold_policies" ADD COLUMN "isFinalPremium" BOOLEAN NOT NULL DEFAULT false;
