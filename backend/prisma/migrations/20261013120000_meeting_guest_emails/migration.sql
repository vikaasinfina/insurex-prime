-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "guestEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
