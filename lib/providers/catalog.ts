/**
 * 利用できる AI モデルの一覧。
 * fal.ai のエンドポイント名はここで管理しているので、新しいモデルを追加する場合はこのファイルに追記する。
 * https://fal.ai/models
 */

export type ImageSizeMode = "aspect_ratio" | "image_size";

export interface ImageModelDef {
  id: string;
  label: string;
  provider: "fal" | "mock";
  /** テキスト→画像 */
  endpoint: string;
  /** 参照画像（キャラクター）付きで生成するエンドポイント。input.image_urls を受け取る */
  editEndpoint?: string;
  sizeMode: ImageSizeMode;
  /** sizeMode = aspect_ratio のときに対応している比率 */
  ratios?: string[];
  note?: string;
}

export interface VideoModelDef {
  id: string;
  label: string;
  provider: "fal" | "mock";
  /** 画像→動画 */
  endpoint: string;
  /** 選択可能な秒数 */
  durations: number[];
  /** duration の渡し方 */
  durationFormat: "number-string" | "seconds-suffix";
  /** モデル自体が音声を生成するか（しない場合は MMAudio で環境音を付与） */
  nativeAudio: boolean;
  /** 追加の固定入力 */
  extraInput?: Record<string, unknown>;
  note?: string;
}

const NB_RATIOS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"];

export const IMAGE_MODELS: ImageModelDef[] = [
  {
    id: "nano-banana",
    label: "Nano Banana (Gemini 2.5 Flash Image)",
    provider: "fal",
    endpoint: "fal-ai/nano-banana",
    editEndpoint: "fal-ai/nano-banana/edit",
    sizeMode: "aspect_ratio",
    ratios: NB_RATIOS,
    note: "キャラクターの一貫性が高い",
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro (Gemini 3 Pro Image)",
    provider: "fal",
    endpoint: "fal-ai/nano-banana-pro",
    editEndpoint: "fal-ai/nano-banana-pro/edit",
    sizeMode: "aspect_ratio",
    ratios: NB_RATIOS,
    note: "高品質・高解像度",
  },
  {
    id: "seedream-v4",
    label: "Seedream 4.0 (ByteDance)",
    provider: "fal",
    endpoint: "fal-ai/bytedance/seedream/v4/text-to-image",
    editEndpoint: "fal-ai/bytedance/seedream/v4/edit",
    sizeMode: "image_size",
    note: "写実的・自由なサイズ指定",
  },
  {
    id: "flux-dev",
    label: "FLUX.1 [dev]",
    provider: "fal",
    endpoint: "fal-ai/flux/dev",
    sizeMode: "image_size",
    note: "参照画像なし（新規キャラクター向け）",
  },
  {
    id: "mock-image",
    label: "モック（APIキー不要・動作確認用）",
    provider: "mock",
    endpoint: "mock",
    editEndpoint: "mock",
    sizeMode: "image_size",
  },
];

export const VIDEO_MODELS: VideoModelDef[] = [
  {
    id: "seedance-pro",
    label: "Seedance 1.0 Pro (ByteDance)",
    provider: "fal",
    endpoint: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    durations: [5, 10],
    durationFormat: "number-string",
    nativeAudio: false,
    extraInput: { resolution: "1080p" },
  },
  {
    id: "seedance-lite",
    label: "Seedance 1.0 Lite (ByteDance)",
    provider: "fal",
    endpoint: "fal-ai/bytedance/seedance/v1/lite/image-to-video",
    durations: [5, 10],
    durationFormat: "number-string",
    nativeAudio: false,
    extraInput: { resolution: "720p" },
  },
  {
    id: "kling-2.1-master",
    label: "Kling 2.1 Master",
    provider: "fal",
    endpoint: "fal-ai/kling-video/v2.1/master/image-to-video",
    durations: [5, 10],
    durationFormat: "number-string",
    nativeAudio: false,
  },
  {
    id: "hailuo-02",
    label: "MiniMax Hailuo 02",
    provider: "fal",
    endpoint: "fal-ai/minimax/hailuo-02/standard/image-to-video",
    durations: [6, 10],
    durationFormat: "number-string",
    nativeAudio: false,
  },
  {
    id: "veo3-fast",
    label: "Google Veo 3 Fast（音声付き）",
    provider: "fal",
    endpoint: "fal-ai/veo3/fast/image-to-video",
    durations: [8],
    durationFormat: "seconds-suffix",
    nativeAudio: true,
    extraInput: { generate_audio: true, resolution: "720p" },
  },
  {
    id: "mock-video",
    label: "モック（APIキー不要・動作確認用）",
    provider: "mock",
    endpoint: "mock",
    durations: [3, 5],
    durationFormat: "number-string",
    nativeAudio: true,
  },
];

/** 無音動画に環境音を付けるモデル */
export const AMBIENT_AUDIO_ENDPOINT = "fal-ai/mmaudio-v2";
export const AMBIENT_PROMPT_SUFFIX = "ambient environmental sound only, natural room tone, no speech, no music";
export const AMBIENT_NEGATIVE = "speech, voice, talking, narration, dialogue, music, singing";

export function getImageModel(id: string) {
  return IMAGE_MODELS.find((m) => m.id === id);
}
export function getVideoModel(id: string) {
  return VIDEO_MODELS.find((m) => m.id === id);
}

export function hasFalKey() {
  return !!process.env.FAL_KEY;
}
export function hasFishKey() {
  return !!process.env.FISH_AUDIO_API_KEY;
}
