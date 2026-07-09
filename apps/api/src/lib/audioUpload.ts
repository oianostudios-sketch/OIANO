// apps/api/src/lib/audioUpload.ts
import path from 'path';
import fs from 'fs';
import { isR2Configured } from './r2';

export function getAudioUpload() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const multer = require('multer');
    const fileFilter = (_req: any, file: any, cb: any) => {
      cb(null, /audio\//.test(file.mimetype));
    };

    if (isR2Configured) {
      return multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
        fileFilter,
      });
    }

    // Local disk fallback
    const uploadDir = path.join(process.cwd(), 'uploads', 'tracks');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const storage = multer.diskStorage({
      destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
      filename:    (_req: any, file: any, cb: any) => {
        const ext = path.extname(file.originalname) || '.mp3';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    });
    return multer({ storage, limits: { fileSize: 30 * 1024 * 1024 }, fileFilter });
  } catch { return null; }
}
