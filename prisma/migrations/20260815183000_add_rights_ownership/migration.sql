CREATE TABLE "rights_agreements" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "agreement_type" TEXT NOT NULL,
  "title" TEXT NOT NULL, "terms_note" TEXT, "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "created_by" TEXT NOT NULL, "responded_by" TEXT, "response_note" TEXT,
  "responded_at" TIMESTAMP(3), "effective_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rights_agreements_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "rights_shares" (
  "id" TEXT NOT NULL, "agreement_id" TEXT NOT NULL, "holder_name" TEXT NOT NULL,
  "holder_type" TEXT NOT NULL, "holder_ref_id" TEXT, "role" TEXT NOT NULL,
  "percentage" DECIMAL(5,2) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rights_shares_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "rights_agreements_project_id_agreement_type_status_idx" ON "rights_agreements"("project_id", "agreement_type", "status");
CREATE INDEX "rights_shares_agreement_id_idx" ON "rights_shares"("agreement_id");
ALTER TABLE "rights_agreements" ADD CONSTRAINT "rights_agreements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rights_shares" ADD CONSTRAINT "rights_shares_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "rights_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
