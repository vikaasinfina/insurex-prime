-- First time the policy was issued (before renewals). Optional; null = new policy.
ALTER TABLE "sold_policies" ADD COLUMN "inceptionDate" DATE;
