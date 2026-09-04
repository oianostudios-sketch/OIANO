// apps/api/src/lib/imageUpload.ts
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { AppError } from './errors';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function getImageUpload(folder = 'avatars') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const multer = require('multer');
    const fileFilter = (_req: any, file: any, cb: any) => cb(null, ALLOWED_IMAGE_TYPES.has(file.mimetype));

    // Always buffer images so the caller can decode and re-encode them before
    // persistence. Browser MIME and filename values are not security checks.
    return multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter,
    });
  } catch { return null; }
}

export async function normalizeImageUpload(file: any): Promise<{ buffer: Buffer; filename: string; mimeType: 'image/webp' }> {
  if (!file?.buffer) throw new AppError('Image bytes were not received', 400);
  // Decoding is the real content check. Re-encoding removes EXIF/GPS metadata,
  // animation and polyglot payloads while bounding dimensions and storage use.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sharp = require('sharp');
  try {
    const buffer = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
    return { buffer, filename: `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.webp`, mimeType: 'image/webp' };
  } catch {
    throw new AppError('The selected file is not a valid supported image', 400);
  }
}

export function writeNormalizedImageLocally(folder: string, filename: string, buffer: Buffer): string {
  const uploadDir = path.join(process.cwd(), 'uploads', folder);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), buffer, { flag: 'wx' });
  return `/uploads/${folder}/${filename}`;
}
