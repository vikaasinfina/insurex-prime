-- Field notes belong to a user (agent or admin) instead of only an agent.
ALTER TABLE "field_notes" ADD COLUMN "userId" UUID;

UPDATE "field_notes" SET "userId" = (SELECT a."userId" FROM "agents" a WHERE a."id" = "field_notes"."agentId");

ALTER TABLE "field_notes" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "field_notes" ALTER COLUMN "agentId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "field_notes_userId_loggedAt_idx" ON "field_notes"("userId", "loggedAt");
CREATE INDEX "field_notes_userId_status_idx" ON "field_notes"("userId", "status");
CREATE INDEX "field_notes_userId_followUpAt_idx" ON "field_notes"("userId", "followUpAt");

-- AddForeignKey
ALTER TABLE "field_notes" ADD CONSTRAINT "field_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
