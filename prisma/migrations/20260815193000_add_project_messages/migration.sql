CREATE TABLE "project_messages" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'MESSAGE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_messages_project_id_created_at_idx" ON "project_messages"("project_id", "created_at");
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
