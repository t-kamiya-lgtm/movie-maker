/**
 * 人物プロフィール（パーソナルデータ）の項目定義と、プロンプトへの組み込み。
 * サーバー・画面の両方から使う（Node 専用の import はしない）。
 */

export interface ProfileField {
  key: string;
  label: string;
  placeholder: string;
  /** 見た目に関わる項目か（false は雰囲気づけの参考情報として渡す） */
  visual: boolean;
}

export const PROFILE_FIELDS: ProfileField[] = [
  { key: "age", label: "年齢", placeholder: "例: 26歳", visual: true },
  { key: "gender", label: "性別", placeholder: "例: 女性", visual: true },
  { key: "height", label: "身長", placeholder: "例: 158cm", visual: true },
  { key: "weight", label: "体重", placeholder: "例: 48kg", visual: true },
  { key: "body", label: "体型", placeholder: "例: 健康的な細身", visual: true },
  { key: "hair", label: "髪型・髪の長さ", placeholder: "例: 黒髪ショート、前髪あり", visual: true },
  { key: "hairColor", label: "髪色", placeholder: "例: 黒", visual: true },
  { key: "face", label: "顔の特徴", placeholder: "例: 切れ長の目、そばかす少し", visual: true },
  { key: "style", label: "服装の傾向", placeholder: "例: スポーティ、キャミソール", visual: true },
  { key: "personality", label: "雰囲気・性格", placeholder: "例: 明るく親しみやすい", visual: false },
  { key: "hobby", label: "趣味", placeholder: "例: ランニング、自炊", visual: false },
  { key: "job", label: "職業", placeholder: "例: 会社員", visual: false },
  { key: "notes", label: "メモ", placeholder: "自由記入", visual: false },
];

export function cleanAttributes(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const f of PROFILE_FIELDS) {
    const v = (input as Record<string, unknown>)[f.key];
    if (typeof v === "string" && v.trim()) out[f.key] = v.trim().slice(0, 200);
  }
  return out;
}

/** 表示用: [{label, value}] */
export function attributeList(attrs?: Record<string, string>) {
  return PROFILE_FIELDS.filter((f) => attrs?.[f.key]).map((f) => ({ label: f.label, value: attrs![f.key] }));
}

export const PHOTO_STYLE =
  "Photo style: photorealistic candid snapshot with natural lighting and the look of a phone camera (unedited, everyday feel). " +
  "This describes only the photo quality: do not show a smartphone or camera in the image unless the description explicitly asks for it.";

/** ① の画像生成で AI に渡すプロンプトを組み立てる */
export function buildCharacterPrompt(opts: {
  name: string;
  kind: "character" | "item";
  prompt: string;
  attributes?: Record<string, string>;
  hasAnchor: boolean;
  framing?: "bust" | "free";
}): string {
  const lines: string[] = [];
  if (opts.kind === "item") {
    if (opts.hasAnchor) {
      lines.push(
        `Reference image 1 shows the product "${opts.name}". Create a new photo of exactly this product: keep its shape, package design, logo, colors and printed text identical.`,
      );
    }
    lines.push(opts.prompt);
  } else {
    if (opts.hasAnchor) {
      lines.push(
        `Reference image 1 shows the person "${opts.name}". Create a new photo of exactly the same person: keep the face, facial features, skin tone, hairstyle and overall identity identical. ` +
          "Pose, outfit and background should follow the description below, not the reference image.",
      );
    }
    lines.push(opts.prompt);
    const attrs = opts.attributes ?? {};
    const visual = PROFILE_FIELDS.filter((f) => f.visual && attrs[f.key]).map((f) => `${f.label}: ${attrs[f.key]}`);
    const background = PROFILE_FIELDS.filter((f) => !f.visual && attrs[f.key]).map((f) => `${f.label}: ${attrs[f.key]}`);
    if (visual.length) lines.push(`Person details: ${visual.join(" / ")}`);
    if (background.length) {
      lines.push(`Character background (use only for mood and expression; do not depict literally): ${background.join(" / ")}`);
    }
    if (opts.framing === "bust") {
      lines.push(
        "Framing: bust-up portrait from the chest up, face clearly visible, sharp and well lit, looking at the camera. " +
          "This image will be used as the face reference for this person.",
      );
    }
  }
  lines.push(PHOTO_STYLE);
  return lines.filter(Boolean).join("\n\n");
}
