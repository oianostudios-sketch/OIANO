-- CreateEnum
CREATE TYPE "WeaveNodeType" AS ENUM ('ARTIST', 'STUDIO');

-- CreateEnum
CREATE TYPE "WeaveNodeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "WeaveConnectionType" AS ENUM ('RECORDED_AT');

-- CreateTable
CREATE TABLE "weave_nodes" (
    "id" TEXT NOT NULL,
    "type" "WeaveNodeType" NOT NULL,
    "status" "WeaveNodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weave_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weave_connections" (
    "id" TEXT NOT NULL,
    "source_node_id" TEXT NOT NULL,
    "target_node_id" TEXT NOT NULL,
    "type" "WeaveConnectionType" NOT NULL,
    "activity_count" INTEGER NOT NULL DEFAULT 1,
    "first_activity_at" TIMESTAMP(3) NOT NULL,
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weave_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weave_connection_evidence" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weave_connection_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weave_nodes_type_idx" ON "weave_nodes"("type");

-- CreateIndex
CREATE INDEX "weave_connections_target_node_id_type_idx" ON "weave_connections"("target_node_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "weave_connections_source_node_id_target_node_id_type_key" ON "weave_connections"("source_node_id", "target_node_id", "type");

-- CreateIndex
CREATE INDEX "weave_connection_evidence_booking_id_idx" ON "weave_connection_evidence"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "weave_connection_evidence_connection_id_booking_id_key" ON "weave_connection_evidence"("connection_id", "booking_id");

-- AddForeignKey
ALTER TABLE "weave_connections" ADD CONSTRAINT "weave_connections_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "weave_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weave_connections" ADD CONSTRAINT "weave_connections_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "weave_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weave_connection_evidence" ADD CONSTRAINT "weave_connection_evidence_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "weave_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weave_connection_evidence" ADD CONSTRAINT "weave_connection_evidence_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
