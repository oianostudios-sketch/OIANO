UPDATE "studios" SET "timezone"='Asia/Nicosia', "currency"='EUR', "address"='Lefkoşa, TRNC' WHERE "slug"='dreamz-music-lab';
UPDATE "rooms" SET "name"='Main Studio', "capacity"=8, "description"='Dreamz Music Lab main recording and production room', "hourly_rate"=45 WHERE "id"='room-studio-a';
UPDATE "bookings" SET "room_id"='room-studio-a' WHERE "studio_id"=(SELECT "id" FROM "studios" WHERE "slug"='dreamz-music-lab') AND "room_id"<>'room-studio-a';
DELETE FROM "availability_slots" WHERE "room_id" IN ('room-studio-b','room-vocal-booth');
DELETE FROM "rooms" WHERE "id" IN ('room-studio-b','room-vocal-booth');
