import fs from "fs/promises";
import path from "path";
import { fal } from "@fal-ai/client";
import { absPath } from "../storage";
import { nearestRatio, sizeFor } from "../aspect";
import {
  AMBIENT_AUDIO_ENDPOINT,
  AMBIENT_NEGATIVE,
  AMBIENT_PROMPT_SUFFIX,
  type ImageModelDef,
  type VideoModelDef,
} from "./catalog";

let configured = false;
function client() {
  if (!process.env.FAL_KEY) throw new Error("FAL_KEY が設定されていません（.env を確認してください）");
  if (!configured) {
    fal.config({ credentials: process.env.FAL_KEY });
    configured = true;
  }
  return fal;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

/** ローカルファイルを fal のストレージにアップロードして URL を得る */
export async function uploadToFal(rel: string): Promise<string> {
  const buf = await fs.readFile(absPath(rel));
  const type = MIME[path.extname(rel).toLowerCase()] ?? "application/octet-stream";
  return client().storage.upload(new Blob([new Uint8Array(buf)], { type }));
}

async function call<T>(endpoint: string, input: Record<string, unknown>): Promise<T> {
  const res = await client().subscribe(endpoint, { input, logs: false });
  return res.data as T;
}

export async function falImage(
  model: ImageModelDef,
  prompt: string,
  aspect: string,
  referencePaths: string[],
): Promise<string> {
  const useEdit = referencePaths.length > 0 && !!model.editEndpoint;
  const input: Record<string, unknown> = { prompt, num_images: 1 };
  if (model.sizeMode === "aspect_ratio") {
    input.aspect_ratio = nearestRatio(aspect, model.ratios ?? ["1:1"]);
    input.output_format = "png";
  } else {
    input.image_size = sizeFor(aspect, 1536);
  }
  if (useEdit) {
    input.image_urls = await Promise.all(referencePaths.map(uploadToFal));
  }
  const data = await call<{ images?: { url: string }[] }>(useEdit ? model.editEndpoint! : model.endpoint, input);
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("画像が返されませんでした");
  return url;
}

export async function falVideo(
  model: VideoModelDef,
  prompt: string,
  imageRel: string,
  duration: number,
): Promise<string> {
  const image_url = await uploadToFal(imageRel);
  const input: Record<string, unknown> = {
    prompt: model.nativeAudio ? `${prompt}. ${AMBIENT_PROMPT_SUFFIX}` : prompt,
    image_url,
    duration: model.durationFormat === "seconds-suffix" ? `${duration}s` : String(duration),
    ...(model.extraInput ?? {}),
  };
  const data = await call<{ video?: { url: string } }>(model.endpoint, input);
  const url = data.video?.url;
  if (!url) throw new Error("動画が返されませんでした");
  return url;
}

/** 無音動画に環境音を付与（MMAudio） */
export async function falAddAmbient(videoRel: string, prompt: string, duration: number): Promise<string> {
  const video_url = await uploadToFal(videoRel);
  const data = await call<{ video?: { url: string } }>(AMBIENT_AUDIO_ENDPOINT, {
    video_url,
    prompt: `${prompt}. ${AMBIENT_PROMPT_SUFFIX}`,
    negative_prompt: AMBIENT_NEGATIVE,
    duration: Math.ceil(duration),
  });
  const url = data.video?.url;
  if (!url) throw new Error("環境音付き動画が返されませんでした");
  return url;
}
