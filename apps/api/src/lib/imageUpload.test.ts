import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeImageUpload } from './imageUpload';

test('normalizes uploaded images to bounded metadata-free WebP', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sharp = require('sharp');
  const source = await sharp({ create: { width: 3000, height: 1200, channels: 3, background: '#234567' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const normalized = await normalizeImageUpload({ buffer: source });
  const metadata = await sharp(normalized.buffer).metadata();
  assert.equal(normalized.mimeType, 'image/webp');
  assert.match(normalized.filename, /\.webp$/);
  assert.ok((metadata.width ?? 0) <= 2048);
  assert.ok((metadata.height ?? 0) <= 2048);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.exif, undefined);
});

test('rejects content that only claims to be an image', async () => {
  await assert.rejects(
    () => normalizeImageUpload({ buffer: Buffer.from('<script>alert(1)</script>') }),
    /not a valid supported image/,
  );
});
