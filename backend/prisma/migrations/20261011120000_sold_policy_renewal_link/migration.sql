-- Which earlier sale a sale renews. The renewed sale stops counting as expired.
ALTER TABLE "sold_policies" ADD COLUMN "renewedFromId" UUID;

ALTER TABLE "sold_policies"
  ADD CONSTRAINT "sold_policies_renewedFromId_fkey"
  FOREIGN KEY ("renewedFromId") REFERENCES "sold_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sold_policies_renewedFromId_idx" ON "sold_policies"("renewedFromId");

-- Existing data: the same customer selling the same policy again is a renewal of the previous one.
UPDATE "sold_policies" AS s
SET "renewedFromId" = x."previousId"
FROM (
  SELECT id, LAG(id) OVER (
    PARTITION BY "customerId", "policyId" ORDER BY "issueDate", "createdAt"
  ) AS "previousId"
  FROM "sold_policies"
  WHERE "policyStatus" <> 'CANCELLED'
) AS x
WHERE s.id = x.id AND x."previousId" IS NOT NULL;
