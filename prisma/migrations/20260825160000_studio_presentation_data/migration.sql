ALTER TABLE "studios"
  ADD COLUMN "hero_image_url" TEXT,
  ADD COLUMN "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "rooms"
  ADD COLUMN "image_url" TEXT,
  ADD COLUMN "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "studios" SET
  "hero_image_url" = '/images/studios/dreamz-hero-v1.webp',
  "amenities" = ARRAY['Main recording room','Studio-assigned producer','Wi-Fi','Lefkoşa location']
WHERE "slug" = 'dreamz-music-lab';

UPDATE "studios" SET
  "hero_image_url" = '/images/studios/northlight-hero-v1.webp',
  "amenities" = ARRAY['Daylight rooms','Artist lounge','Wi-Fi','Freight elevator']
WHERE "slug" = 'northlight-sound-house';

UPDATE "rooms" SET "image_url" = '/images/studios/dreamz-studio-a-v1.webp', "amenities" = ARRAY['Recording setup','Production workstation','Monitoring','Studio-assigned producer'] WHERE "id" = 'room-studio-a';
UPDATE "rooms" SET "image_url" = '/images/studios/dreamz-studio-b-v1.webp', "amenities" = ARRAY['Production workstation','Analog outboard','Nearfield monitors','Writing sofa'] WHERE "id" = 'room-studio-b';
UPDATE "rooms" SET "image_url" = '/images/studios/dreamz-vocal-booth-v1.webp', "amenities" = ARRAY['Condenser microphone','Pop shield','Headphone mix','Isolation'] WHERE "id" = 'room-vocal-booth';
UPDATE "rooms" SET "image_url" = '/images/studios/northlight-live-room-v1.webp', "amenities" = ARRAY['Grand piano','Drum kit','Guitar amps','Acoustic gobos'] WHERE "id" = 'northlight-live-room';
UPDATE "rooms" SET "image_url" = '/images/studios/northlight-writing-suite-v1.webp', "amenities" = ARRAY['Vocal corner','Modular synth','Production desk','Writing lounge'] WHERE "id" = 'northlight-writing-suite';
