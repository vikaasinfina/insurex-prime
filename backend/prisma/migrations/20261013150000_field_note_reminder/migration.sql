-- AlterTable
ALTER TABLE "field_notes" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "field_notes_followUpAt_reminderSentAt_idx" ON "field_notes"("followUpAt", "reminderSentAt");
