CREATE TABLE "deliverables" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "created_by" TEXT NOT NULL,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "deliverable_versions" (
  "id" TEXT NOT NULL,
  "deliverable_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "file_urls" TEXT[] NOT NULL,
  "notes" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deliverable_versions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "deliverable_reviews" (
  "id" TEXT NOT NULL,
  "deliverable_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "decision" TEXT NOT NULL,
  "note" TEXT,
  "reviewed_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deliverable_reviews_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deliverables_booking_id_status_idx" ON "deliverables"("booking_id", "status");
CREATE UNIQUE INDEX "deliverable_versions_deliverable_id_version_number_key" ON "deliverable_versions"("deliverable_id", "version_number");
CREATE INDEX "deliverable_reviews_deliverable_id_created_at_idx" ON "deliverable_reviews"("deliverable_id", "created_at");
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deliverable_reviews" ADD CONSTRAINT "deliverable_reviews_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
