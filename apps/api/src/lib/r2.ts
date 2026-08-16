/**
 * Cloudflare R2 storage client.
 * R2 is S3-compatible — we use the AWS SDK v3 pointed at the R2 endpoint.
 *
 * Required env vars (in apps/api/.env):
 *   R2_ACCOUNT_ID        — Cloudflare account ID (from R2 dashboard URL)
 *   R2_ACCESS_KEY_ID     — R2 API token Access Key ID
 *   R2_SECRET_ACCESS_KEY — R2 API token Secret Access Key
 *   R2_BUCKET_NAME       — bucket name
 *   R2_PUBLIC_URL        — public URL for the bucket, e.g. https://files.yourdomain.com
 *                          (set this after enabling public access or connecting a custom domain)
 *
 * When env vars are absent the helpers no-op and the caller falls back to local disk.
 */

import crypto from 'crypto';
import path from 'path';

export const isR2Configured = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
);

// Lazy client — only instantiated when R2 is configured
let _client: any = null;

function getClient() {
  if (_client) return _client;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Client } = require('@aws-sdk/client-s3');
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

/**
 * Upload a buffer to R2 and return the public URL.
 *
 * @param buffer   File content
 * @param prefix   Path prefix, e.g. "avatars/artist-123" or "files/artist-123"
 * @param filename Original filename (used for extension)
 * @param mimeType MIME type string
 */
export async function uploadToR2(
  buffer: Buffer,
  prefix: string,
  filename: string,
  mimeType: string,
): Promise<string> {
  if (!isR2Configured) throw new Error('R2 is not configured');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PutObjectCommand } = require('@aws-sdk/client-s3');

  const ext = path.extname(filename) || '';
  const uid = crypto.randomBytes(8).toString('hex');
  const key = `${prefix}/${Date.now()}-${uid}${ext}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket:      process.env.R2_BUCKET_NAME!,
      Key:         key,
      Body:        buffer,
      ContentType: mimeType,
    }),
  );

  return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, '')}/${key}`;
}

/**
 * Delete an object from R2 by its public URL.
 * Silently no-ops if the URL isn't an R2 URL or R2 isn't configured.
 */
export async function deleteFromR2(publicUrl: string): Promise<void> {
  if (!isR2Configured) return;
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!base || !publicUrl.startsWith(base + '/')) return;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

  const key = publicUrl.slice(base.length + 1);
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key:    key,
    }),
  );
}

/**
 * Fetch an object's bytes + content type from R2 by its stored public URL.
 * Used by the ticket-gated content route so private files are streamed
 * through the API rather than handing the client the raw bucket URL.
 */
export async function getFromR2(publicUrl: string): Promise<{ body: NodeJS.ReadableStream; contentType?: string }> {
  if (!isR2Configured) throw new Error('R2 is not configured');
  const base = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');
  if (!publicUrl.startsWith(base + '/')) throw new Error('URL is not an R2 object');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GetObjectCommand } = require('@aws-sdk/client-s3');

  const key = publicUrl.slice(base.length + 1);
  const result = await getClient().send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key:    key,
    }),
  );

  return { body: result.Body, contentType: result.ContentType };
}
