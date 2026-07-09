-- AlterTable
ALTER TABLE "studios" ADD COLUMN "mint_letter" TEXT NOT NULL DEFAULT 'Z';
ALTER TABLE "studios" ADD COLUMN "passport_seq" INTEGER NOT NULL DEFAULT 0;
