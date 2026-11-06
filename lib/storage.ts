import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"));

export type Bucket = "characters" | "scenes" | "videos" | "audio" | "renders" | "tmp";

/** ストレージ内の相対パスを絶対パスに変換（ディレクトリ外は拒否） */
export function absPath(rel: string): string {
  const p = path.resolve(STORAGE_DIR, rel);
  if (p !== STORAGE_DIR && !p.startsWith(STORAGE_DIR + path.sep)) {
    throw new Error("invalid storage path");
  }
  return p;
}

export function fileUrl(rel?: string): string | undefined {
  return rel ? `/api/files/${rel}` : undefined;
}

export async function newPath(bucket: Bucket, ext: string): Promise<string> {
  await fs.mkdir(path.join(STORAGE_DIR, bucket), { recursive: true });
  return `${bucket}/${randomUUID()}.${ext.replace(/^\./, "")}`;
}

export async function saveBuffer(bucket: Bucket, ext: string, buf: Buffer): Promise<string> {
  const rel = await newPath(bucket, ext);
  await fs.writeFile(absPath(rel), buf);
  return rel;
}

export async function removeFile(rel?: string) {
  if (!rel) return;
  await fs.rm(absPath(rel), { force: true });
}

export function extFromContentType(ct: string | null, fallback: string): string {
  if (!ct) return fallback;
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  if (ct.includes("wav")) return "wav";
  return fallback;
}

export async function download(url: string): Promise<{ buffer: Buffer; contentType: string | null }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
}
