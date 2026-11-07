/**
 * Google Gemini API（Nano Banana / Veo）
 * 課金は API キーを作成した Google Cloud プロジェクトの請求アカウントに付く。
 * https://ai.google.dev/gemini-api/docs
 */
import fs from "fs/promises";
import path from "path";
import { absPath, extFromContentType, saveBuffer } from "../storage";
import { nearestRatio } from "../aspect";
import {
  AMBIENT_PROMPT_SUFFIX,
  TEXT_MODEL,
  VEO_RATIOS,
  googleApiKey,
  type ImageModelDef,
  type VideoModelDef,
} from "./catalog";

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
  const images: unknown[] = [];
  for (const r of referencePaths) images.push({ inlineData: await inlineImage(r) });

  const request = (text: string) =>
    post<GenerateContentResponse>(`${BASE}/models/${model.endpoint}:generateContent`, {
      contents: [{ role: "user", parts: [{ text }, ...images] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: nearestRatio(aspect, model.ratios ?? ["1:1"]) },
      },
    });

  // セリフのような文章だと、画像を作らずに会話で返事をすることがあるため、
  // 「画像を作るための指示」であることを明示し、それでも文章だけ返ってきたら指示を強めて 1 回やり直す
  const attempts = [
    `Generate one photorealistic image based on the following description. Reply with the image.\n\n${prompt}`,
    `IMPORTANT: Output only an image. Do not reply with text, do not ask questions, and do not refuse because the description sounds like dialogue: ` +
      `treat any quoted or spoken-style lines as the mood of the scene and depict it visually.\n\n${prompt}`,
  ];
  let lastError = "";
  for (const text of attempts) {
    const data = await request(text);
    if (data.promptFeedback?.blockReason) {
      throw new Error(`安全フィルターでブロックされました（${data.promptFeedback.blockReason}）。プロンプトや参照画像を変えてください`);
    }
    const outParts = data.candidates?.[0]?.content?.parts ?? [];
    const img = outParts.find((p) => p.inlineData?.data);
    if (img?.inlineData?.data) {
      const ext = extFromContentType(img.inlineData.mimeType ?? null, "png");
      return saveBuffer("tmp", ext, Buffer.from(img.inlineData.data, "base64"));
    }
    const reply = outParts.map((p) => p.text).filter(Boolean).join(" ");
    const reason = data.candidates?.[0]?.finishReason;
    lastError = `画像が返されませんでした${reason ? `（${reason}）` : ""}${reply ? `: ${reply.slice(0, 300)}` : ""}`;
    // 安全上の理由で止まった場合は、やり直しても同じなので終了
    if (reason && reason !== "STOP") break;
  }
  throw new Error(
    `${lastError}\nAI が画像ではなく文章で返事をしました。プロンプトを「誰が・どこで・何をしている写真か」が分かる説明にしてください。`,
  );
}

// ---------- 人物のパーソナルデータ推定（Gemini 文章モデル） ----------

/**
 * 生成した人物画像とプロンプトから、パーソナルデータ（年齢・身長など）を推定する。
 * fields: { key: 日本語ラベル } 。戻り値は key → 値（日本語）。推定できない項目は含めない。
 */
export async function googleEstimateProfile(
  imageRel: string,
  prompt: string,
  fields: Record<string, string>,
): Promise<Record<string, string>> {
  const keys = Object.keys(fields);
  const data = await post<GenerateContentResponse>(`${BASE}/models/${TEXT_MODEL}:generateContent`, {
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "この画像は広告動画用に AI で生成した架空の人物です。画像と生成時の説明文から、この人物のプロフィールを日本語で設定してください。\n" +
              "見た目から分かる項目は画像に合わせ、性格・趣味・職業は説明文や雰囲気から自然な設定を考えてください。\n" +
              "各値は短く（例: 「26歳」「158cm」「黒髪のショートボブ」）。\n" +
              `項目: ${keys.map((k) => `${k}=${fields[k]}`).join(", ")}\n\n生成時の説明文:\n${prompt}`,
          },
          { inlineData: await inlineImage(imageRel) },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: Object.fromEntries(keys.map((k) => [k, { type: "STRING" }])),
      },
    },
  });
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = parsed[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 100);
    }
    return out;
  } catch {
    return {};
  }
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
