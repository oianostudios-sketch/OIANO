CREATE TABLE "admin_audit_logs" (
  "id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "method" TEXT,
  "path" TEXT,
  "ip_hash" TEXT,
  "user_agent" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "admin_audit_logs_actor_id_created_at_idx" ON "admin_audit_logs"("actor_id", "created_at");
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

CREATE OR REPLACE FUNCTION prevent_admin_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Administrative audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_audit_logs_no_update
BEFORE UPDATE ON "admin_audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();

CREATE TRIGGER admin_audit_logs_no_delete
BEFORE DELETE ON "admin_audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();
