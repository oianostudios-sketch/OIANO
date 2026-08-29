CREATE TABLE "session_completion_requests" (
    "id" UUID NOT NULL,
    "booking_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_completion_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_completion_requests_booking_id_idempotency_key_key"
ON "session_completion_requests"("booking_id", "idempotency_key");

CREATE INDEX "session_completion_requests_booking_id_created_at_idx"
ON "session_completion_requests"("booking_id", "created_at");

ALTER TABLE "session_completion_requests"
ADD CONSTRAINT "session_completion_requests_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
