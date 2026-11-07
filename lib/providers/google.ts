/**
 * Google Gemini API（Nano Banana / Veo）
 * 課金は API キーを作成した Google Cloud プロジェクトの請求アカウントに付く。
 * https://ai.google.dev/gemini-api/docs
 */
import fs from "fs/promises";
import path from "path";
import { absPath, extFromContentType, saveBuffer } from "../storage";
import { nearestRatio } from "../aspect";
import { AMBIENT_PROMPT_SUFFIX, VEO_RATIOS, googleApiKey, type ImageModelDef, type VideoModelDef } from "./catalog";

// GEMINI_API_BASE はテスト用（通常は設定不要）
const BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";

function key() {
  const k = googleApiKey();
  if (!k) throw new Error("GEMINI_API_KEY が設定されていません（.env を確認してください）");
  return k;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function inlineImage(rel: string) {
  const buf = await fs.readFile(absPath(rel));
  return { mimeType: MIME[path.extname(rel).toLowerCase()] ?? "image/png", data: buf.toString("base64") };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text) as T;
}

// ---------- 画像（Nano Banana） ----------

interface GenerateContentResponse {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

/** 生成した画像を storage/tmp に保存して相対パスを返す */
export async function googleImage(
  model: ImageModelDef,
  prompt: string,
  aspect: string,
  referencePaths: string[],
): Promise<string> {
  const parts: unknown[] = [{ text: prompt }];
  for (const r of referencePaths) parts.push({ inlineData: await inlineImage(r) });

  const data = await post<GenerateContentResponse>(`${BASE}/models/${model.endpoint}:generateContent`, {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: nearestRatio(aspect, model.ratios ?? ["1:1"]) },
    },
  });

  if (data.promptFeedback?.blockReason) {
    throw new Error(`安全フィルターでブロックされました（${data.promptFeedback.blockReason}）。プロンプトや参照画像を変えてください`);
  }
  const outParts = data.candidates?.[0]?.content?.parts ?? [];
  const img = outParts.find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) {
    const text = outParts.map((p) => p.text).filter(Boolean).join(" ");
    const reason = data.candidates?.[0]?.finishReason;
    throw new Error(`画像が返されませんでした${reason ? `（${reason}）` : ""}${text ? `: ${text.slice(0, 300)}` : ""}`);
  }
  const ext = extFromContentType(img.inlineData.mimeType ?? null, "png");
  return saveBuffer("tmp", ext, Buffer.from(img.inlineData.data, "base64"));
}

// ---------- 動画（Veo） ----------

interface Operation {
  name: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: { video?: { uri?: string } }[];
      raiMediaFilteredCount?: number;
      raiMediaFilteredReasons?: string[];
    };
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startVeo(model: VideoModelDef, body: { instances: unknown[]; parameters: Record<string, unknown> }) {
  const url = `${BASE}/models/${model.endpoint}:predictLongRunning`;
  try {
    return await post<Operation>(url, body);
  } catch (err) {
    // personGeneration の指定を受け付けないモデル・地域の場合は外して再試行
    if (String(err).includes("personGeneration")) {
      const { personGeneration: _omit, ...rest } = body.parameters;
      void _omit;
      return post<Operation>(url, { ...body, parameters: rest });
    }
    throw err;
  }
}

async function downloadVideo(uri: string): Promise<Buffer> {
  let res = await fetch(uri, { headers: { "x-goog-api-key": key() }, redirect: "follow" });
  if (!res.ok) {
    const withKey = `${uri}${uri.includes("?") ? "&" : "?"}key=${encodeURIComponent(key())}`;
    res = await fetch(withKey, { redirect: "follow" });
  }
  if (!res.ok) throw new Error(`動画のダウンロードに失敗しました: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 画像→動画（Veo は環境音も同時に生成）。storage/tmp に保存して相対パスを返す */
export async function googleVideo(
  model: VideoModelDef,
  prompt: string,
  imageRel: string,
  aspect: string,
  duration: number,
): Promise<string> {
  const image = await inlineImage(imageRel);
  let op = await startVeo(model, {
    instances: [
      {
        prompt: `${prompt}. ${AMBIENT_PROMPT_SUFFIX}`,
        image: { bytesBase64Encoded: image.data, mimeType: image.mimeType },
      },
    ],
    parameters: {
      aspectRatio: nearestRatio(aspect, VEO_RATIOS),
      durationSeconds: duration,
      personGeneration: "allow_adult",
      negativePrompt: "speech, talking, narration, dialogue, music, singing, subtitles, text overlay",
    },
  });

  // 生成には数十秒〜数分かかる（最大 15 分待つ）
  const deadline = Date.now() + 15 * 60 * 1000;
  while (!op.done) {
    if (Date.now() > deadline) throw new Error("動画生成がタイムアウトしました（15分）");
    await sleep(10_000);
    const res = await fetch(`${BASE}/${op.name}`, { headers: { "x-goog-api-key": key() } });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    op = (await res.json()) as Operation;
  }

  if (op.error) throw new Error(`Veo エラー: ${op.error.message ?? op.error.code}`);
  const gv = op.response?.generateVideoResponse;
  const uri = gv?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reasons = gv?.raiMediaFilteredReasons?.join(" / ");
    throw new Error(
      reasons
        ? `安全フィルターで動画が除外されました: ${reasons}`
        : "動画が返されませんでした（安全フィルターの可能性があります。画像や動きの指示を変えてください）",
    );
  }
  return saveBuffer("tmp", "mp4", await downloadVideo(uri));
}
