-- CreateEnum
CREATE TYPE "GoalCadence" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "FieldNoteStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'POSTPONED');

-- CreateTable
CREATE TABLE "sales_goals" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "cadence" "GoalCadence" NOT NULL,
    "category" "InsuranceType" NOT NULL,
    "targetPolicies" INTEGER NOT NULL,
    "targetPremium" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "clientName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "coverage" TEXT NOT NULL DEFAULT '',
    "category" "InsuranceType" NOT NULL,
    "note" TEXT NOT NULL,
    "tag" TEXT NOT NULL DEFAULT '',
    "status" "FieldNoteStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "followUpAt" TIMESTAMP(3),
    "followUpLabel" TEXT NOT NULL DEFAULT '',
    "recurring" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_goals_tenantId_idx" ON "sales_goals"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_goals_agentId_cadence_category_key" ON "sales_goals"("agentId", "cadence", "category");

-- CreateIndex
CREATE INDEX "field_notes_agentId_loggedAt_idx" ON "field_notes"("agentId", "loggedAt");

-- CreateIndex
CREATE INDEX "field_notes_agentId_status_idx" ON "field_notes"("agentId", "status");

-- CreateIndex
CREATE INDEX "field_notes_agentId_followUpAt_idx" ON "field_notes"("agentId", "followUpAt");

-- CreateIndex
CREATE INDEX "field_notes_tenantId_idx" ON "field_notes"("tenantId");

-- AddForeignKey
ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_notes" ADD CONSTRAINT "field_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_notes" ADD CONSTRAINT "field_notes_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

