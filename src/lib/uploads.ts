/**
 * Local-disk photo storage for asset registration. Files are written under
 * /public/uploads and served by Next as static assets at /uploads/<name> — no
 * cloud bucket, no external dependency. The returned web path is what gets
 * persisted on assets.photo_path.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ValidationError } from "@/core/errors";

/** Directory on disk that backs the public /uploads route. */
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Accepted image MIME types → file extension. */
const ALLOWED: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * Persist an uploaded image to /public/uploads and return its public web path
 * (e.g. "/uploads/ab12….png"). Throws {@link ValidationError} on a missing
 * file, an unsupported type, or an oversized upload.
 */
export async function saveAssetPhoto(file: File): Promise<string> {
  if (!file || file.size === 0) {
    throw new ValidationError("No photo file was provided.");
  }
  if (file.size > MAX_BYTES) {
    throw new ValidationError("Photo must be 5 MB or smaller.");
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    throw new ValidationError("Photo must be a PNG, JPEG, WebP, or GIF image.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = `${randomUUID()}${ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), bytes);

  return `/uploads/${filename}`;
}
