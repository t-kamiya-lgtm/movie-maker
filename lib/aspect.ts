export interface AspectPreset {
  id: string;
  label: string;
  /** 用途の説明 */
  usage: string;
  width: number;
  height: number;
}

/** 出力サイズのプリセット（SNS 向け） */
export const ASPECTS: AspectPreset[] = [
  { id: "9:16", label: "9:16 縦", usage: "TikTok / Reels / Shorts / ストーリーズ", width: 1080, height: 1920 },
  { id: "16:9", label: "16:9 横", usage: "YouTube / X / Web", width: 1920, height: 1080 },
  { id: "1:1", label: "1:1 正方形", usage: "Instagram / X / Facebook", width: 1080, height: 1080 },
  { id: "4:5", label: "4:5 縦長", usage: "Instagram フィード / Facebook", width: 1080, height: 1350 },
  { id: "3:4", label: "3:4 縦", usage: "Instagram（新グリッド）/ Threads", width: 1080, height: 1440 },
  { id: "2:3", label: "2:3 縦", usage: "Pinterest", width: 1000, height: 1500 },
  { id: "21:9", label: "21:9 シネマ", usage: "シネマスコープ / バナー", width: 2520, height: 1080 },
];

export const DEFAULT_ASPECT = "9:16";

export function getAspect(id: string): AspectPreset {
  return ASPECTS.find((a) => a.id === id) ?? ASPECTS[0];
}

function ratioValue(id: string): number {
  const [w, h] = id.split(":").map(Number);
  return w / h;
}

/** モデルが対応している比率の中から最も近いものを選ぶ */
export function nearestRatio(target: string, supported: string[]): string {
  if (supported.includes(target)) return target;
  const t = Math.log(ratioValue(target));
  let best = supported[0];
  let bestDiff = Infinity;
  for (const s of supported) {
    const d = Math.abs(Math.log(ratioValue(s)) - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = s;
    }
  }
  return best;
}

/** モデルに渡すピクセルサイズ（長辺 maxSide、16 の倍数） */
export function sizeFor(id: string, maxSide = 1536): { width: number; height: number } {
  const r = ratioValue(id);
  const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
  return r >= 1
    ? { width: round16(maxSide), height: round16(maxSide / r) }
    : { width: round16(maxSide * r), height: round16(maxSide) };
}
