CREATE TYPE "CommunicationThreadKind" AS ENUM ('DIRECT','BOOKING','PROJECT','STUDIO','SUPPORT');
CREATE TYPE "CommunicationThreadState" AS ENUM ('OPEN','WAITING_ON_USER','RESOLVED','EXPIRED','ARCHIVED');
CREATE TYPE "CommunicationParticipantRole" AS ENUM ('OWNER','MEMBER','ASSIGNEE','OBSERVER','SUPPORT');
CREATE TYPE "CommunicationParticipantState" AS ENUM ('ACTIVE','REMOVED','EXPIRED');
CREATE TYPE "CommunicationEventKind" AS ENUM ('MESSAGE','FILE','ACTIVITY','ACTION_REQUESTED','DECISION_RECORDED','STATE_CHANGED','SYSTEM');

CREATE TABLE "communication_threads" (
  "id" TEXT NOT NULL,
  "kind" "CommunicationThreadKind" NOT NULL,
  "state" "CommunicationThreadState" NOT NULL DEFAULT 'OPEN',
  "subject" TEXT NOT NULL,
  "booking_id" TEXT,
  "project_id" TEXT,
  "connection_id" TEXT,
  "studio_id" TEXT,
  "created_by" TEXT NOT NULL,
  "waiting_on_user_id" TEXT,
  "expires_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "last_event_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_threads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "communication_threads_booking_id_key" ON "communication_threads"("booking_id");
CREATE UNIQUE INDEX "communication_threads_project_id_key" ON "communication_threads"("project_id");
CREATE UNIQUE INDEX "communication_threads_connection_id_key" ON "communication_threads"("connection_id");
CREATE INDEX "communication_threads_state_last_event_at_idx" ON "communication_threads"("state","last_event_at");
CREATE INDEX "communication_threads_studio_id_state_last_event_at_idx" ON "communication_threads"("studio_id","state","last_event_at");
CREATE INDEX "communication_threads_waiting_on_user_id_state_idx" ON "communication_threads"("waiting_on_user_id","state");

CREATE TABLE "communication_participants" (
  "id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "CommunicationParticipantRole" NOT NULL DEFAULT 'MEMBER',
  "state" "CommunicationParticipantState" NOT NULL DEFAULT 'ACTIVE',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removed_at" TIMESTAMP(3),
  "read_at" TIMESTAMP(3),
  CONSTRAINT "communication_participants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "communication_participants_thread_id_user_id_key" ON "communication_participants"("thread_id","user_id");
CREATE INDEX "communication_participants_user_id_state_thread_id_idx" ON "communication_participants"("user_id","state","thread_id");

CREATE TABLE "communication_events" (
  "id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "sender_id" TEXT,
  "kind" "CommunicationEventKind" NOT NULL DEFAULT 'MESSAGE',
  "body" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "communication_events_idempotency_key_key" ON "communication_events"("idempotency_key");
CREATE INDEX "communication_events_thread_id_created_at_idx" ON "communication_events"("thread_id","created_at");

ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "passport_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_waiting_on_user_id_fkey" FOREIGN KEY ("waiting_on_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_participants" ADD CONSTRAINT "communication_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "communication_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_participants" ADD CONSTRAINT "communication_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "communication_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_events" ADD CONSTRAINT "communication_events_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One canonical thread per existing booking, preserving studio scope.
INSERT INTO "communication_threads" ("id","kind","state","subject","booking_id","studio_id","created_by","last_event_at","created_at","updated_at")
SELECT gen_random_uuid()::text,'BOOKING','OPEN',COALESCE(s.name,'Studio session'),b.id,b.studio_id,a.user_id,COALESCE(MAX(m.created_at),b.updated_at),b.created_at,b.updated_at
FROM "bookings" b JOIN "artists" a ON a.id=b.artist_id LEFT JOIN "service_offerings" s ON s.id=b.service_id LEFT JOIN "booking_messages" m ON m.booking_id=b.id
GROUP BY b.id,s.name,a.user_id;

INSERT INTO "communication_threads" ("id","kind","state","subject","project_id","created_by","last_event_at","created_at","updated_at")
SELECT gen_random_uuid()::text,'PROJECT',CASE WHEN p.is_active THEN 'OPEN'::"CommunicationThreadState" ELSE 'ARCHIVED'::"CommunicationThreadState" END,p.title,p.id,pr.user_id,COALESCE(MAX(m.created_at),p.updated_at),p.created_at,p.updated_at
FROM "projects" p JOIN "producers" pr ON pr.id=p.producer_id LEFT JOIN "project_messages" m ON m.project_id=p.id GROUP BY p.id,pr.user_id;

INSERT INTO "communication_threads" ("id","kind","state","subject","connection_id","created_by","waiting_on_user_id","last_event_at","created_at","updated_at")
SELECT gen_random_uuid()::text,'DIRECT',CASE c.status WHEN 'PENDING' THEN 'WAITING_ON_USER'::"CommunicationThreadState" WHEN 'DECLINED' THEN 'ARCHIVED'::"CommunicationThreadState" ELSE 'OPEN'::"CommunicationThreadState" END,'Professional connection',c.id,ai.user_id,CASE WHEN c.status='PENDING' THEN ar.user_id ELSE NULL END,COALESCE(MAX(m.created_at),c.created_at),c.created_at,COALESCE(MAX(m.created_at),c.created_at)
FROM "passport_connections" c JOIN "artists" ai ON ai.id=c.initiator_id JOIN "artists" ar ON ar.id=c.recipient_id LEFT JOIN "connect_messages" m ON m.connection_id=c.id GROUP BY c.id,ai.user_id,ar.user_id;

-- Relationship-derived participants. ON CONFLICT makes overlapping roles safe.
INSERT INTO "communication_participants" ("id","thread_id","user_id","role") SELECT gen_random_uuid()::text,t.id,a.user_id,'OWNER' FROM "communication_threads" t JOIN "bookings" b ON b.id=t.booking_id JOIN "artists" a ON a.id=b.artist_id ON CONFLICT ("thread_id","user_id") DO NOTHING;
INSERT INTO "communication_participants" ("id","thread_id","user_id","role") SELECT gen_random_uuid()::text,t.id,e.user_id,'ASSIGNEE' FROM "communication_threads" t JOIN "bookings" b ON b.id=t.booking_id JOIN "engineers" e ON e.id=b.engineer_id WHERE e.user_id IS NOT NULL ON CONFLICT ("thread_id","user_id") DO NOTHING;
INSERT INTO "communication_participants" ("id","thread_id","user_id","role") SELECT gen_random_uuid()::text,t.id,ss.user_id,'MEMBER' FROM "communication_threads" t JOIN "studio_staff" ss ON ss.studio_id=t.studio_id WHERE t.booking_id IS NOT NULL ON CONFLICT ("thread_id","user_id") DO NOTHING;
INSERT INTO "communication_participants" ("id","thread_id","user_id","role") SELECT gen_random_uuid()::text,t.id,pr.user_id,'OWNER' FROM "communication_threads" t JOIN "projects" p ON p.id=t.project_id JOIN "producers" pr ON pr.id=p.producer_id ON CONFLICT ("thread_id","user_id") DO NOTHING;
INSERT INTO "communication_participants" ("id","thread_id","user_id","role") SELECT gen_random_uuid()::text,t.id,a.user_id,'MEMBER' FROM "communication_threads" t JOIN "projects" p ON p.id=t.project_id JOIN "artists" a ON a.id=p.artist_id WHERE p.artist_id IS NOT NULL ON CONFLICT ("thread_id","user_id") DO NOTHING;
INSERT INTO "communication_participants" ("id","thread_id","user_id","role") SELECT gen_random_uuid()::text,t.id,pp.participant_ref_id,'MEMBER' FROM "communication_threads" t JOIN "project_participants" pp ON pp.project_id=t.project_id WHERE pp.participant_type='OIANO_USER' AND pp.participant_ref_id IS NOT NULL ON CONFLICT ("thread_id","user_id") DO NOTHING;
INSERT INTO "communication_participants" ("id","thread_id","user_id","role") SELECT gen_random_uuid()::text,t.id,a.user_id,CASE WHEN a.id=c.initiator_id THEN 'OWNER'::"CommunicationParticipantRole" ELSE 'MEMBER'::"CommunicationParticipantRole" END FROM "communication_threads" t JOIN "passport_connections" c ON c.id=t.connection_id JOIN "artists" a ON a.id IN (c.initiator_id,c.recipient_id) ON CONFLICT ("thread_id","user_id") DO NOTHING;

-- Preserve legacy message identity, ordering and source keys exactly once.
INSERT INTO "communication_events" ("id","thread_id","sender_id","kind","body","payload","idempotency_key","created_at") SELECT gen_random_uuid()::text,t.id,m.sender_id,'MESSAGE',m.body,jsonb_build_object('legacy_table','booking_messages','legacy_id',m.id),'legacy:booking_message:'||m.id,m.created_at FROM "booking_messages" m JOIN "communication_threads" t ON t.booking_id=m.booking_id;
INSERT INTO "communication_events" ("id","thread_id","sender_id","kind","body","payload","idempotency_key","created_at") SELECT gen_random_uuid()::text,t.id,m.sender_id,'MESSAGE',m.body,jsonb_build_object('legacy_table','project_messages','legacy_id',m.id,'legacy_kind',m.kind),'legacy:project_message:'||m.id,m.created_at FROM "project_messages" m JOIN "communication_threads" t ON t.project_id=m.project_id;
INSERT INTO "communication_events" ("id","thread_id","sender_id","kind","body","payload","idempotency_key","created_at") SELECT gen_random_uuid()::text,t.id,a.user_id,'MESSAGE',m.body,jsonb_build_object('legacy_table','connect_messages','legacy_id',m.id),'legacy:connect_message:'||m.id,m.created_at FROM "connect_messages" m JOIN "artists" a ON a.id=m.sender_id JOIN "communication_threads" t ON t.connection_id=m.connection_id;
