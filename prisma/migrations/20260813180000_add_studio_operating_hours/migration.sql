ALTER TABLE "studios"
ADD COLUMN "operating_open_hour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN "operating_close_hour" INTEGER NOT NULL DEFAULT 22;

ALTER TABLE "studios"
ADD CONSTRAINT "studios_operating_hours_check"
CHECK (
  "operating_open_hour" >= 0 AND
  "operating_close_hour" <= 24 AND
  "operating_close_hour" > "operating_open_hour"
);
