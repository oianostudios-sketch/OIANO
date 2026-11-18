-- An artist can start a project of their own, before any producer is involved.
--
-- Only a producer could create a project, because every project needed a producer.
-- A project an artist starts has no producer, so the column becomes nullable. The
-- foreign key is unchanged, and every existing row keeps its producer.
ALTER TABLE "projects" ALTER COLUMN "producer_id" DROP NOT NULL;
