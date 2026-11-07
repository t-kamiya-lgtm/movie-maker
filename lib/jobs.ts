/**
 * 生成処理をバックグラウンドで実行する（レスポンスは即返し、クライアントはポーリング）。
 * ローカル実行（next dev / next start）を前提としたシンプルな仕組み。
 */
export function runInBackground(name: string, fn: () => Promise<void>) {
  setImmediate(() => {
    fn().catch((err) => {
      console.error(`[job:${name}]`, err);
    });
  });
}

function rawMessage(err: unknown): string {
  if (err instanceof Error) {
    const body = (err as { body?: unknown }).body;
    if (body) {
      try {
        return `${err.message}: ${JSON.stringify(body).slice(0, 500)}`;
      } catch {
        /* ignore */
      }
    }
    return err.message;
  }
  return String(err);
}

/** よくあるエラーを日本語の「原因と対処」に言い換える */
const HINTS: { test: RegExp; message: string }[] = [
  {
    test: /free_tier|check your plan and billing/i,
    message:
      "無料枠のため使えません（Google の課金が有効になっていません）。AI Studio の API キー一覧で、このキーのプロジェクトの「請求階層」が無料枠になっていないか確認してください。",
  },
  {
    test: /Gemini API 429|RESOURCE_EXHAUSTED/i,
    message: "Google の利用上限に達しました。少し時間をおいてから、もう一度試してください。",
  },
  {
    test: /API_KEY_INVALID|API key not valid/i,
    message: "Google の API キーが正しくありません。.env の GEMINI_API_KEY を確認してください。",
  },
  {
    test: /SERVICE_DISABLED|has not been used in project|PERMISSION_DENIED/i,
    message:
      "このプロジェクトで Gemini API（Generative Language API）が有効になっていないか、権限がありません。Google Cloud コンソールで API を有効にしてください。",
  },
  {
    test: /Gemini API 404|NOT_FOUND|is not found for API version/i,
    message:
      "AI モデルが見つかりません（モデル名が変わった可能性があります）。lib/providers/catalog.ts のモデル ID を確認してください。",
  },
  {
    test: /Exhausted balance|insufficient.*(balance|credit)|: 402\b|status 402\b/i,
    message: "サービスの残高（クレジット）が不足しています。fal.ai または Fish Audio の残高を確認してください。",
  },
  {
    test: /Fish Audio .*: 401\b|FISH_AUDIO_API_KEY/i,
    message: "Fish Audio の API キーが正しくないか、未設定です。.env の FISH_AUDIO_API_KEY を確認してください。",
  },
  {
    test: /Unauthorized|: 401\b|status 401\b/i,
    message: "API キーが正しくないか、未設定です。.env を確認してください。",
  },
  {
    test: /spawn ffmpeg|spawn ffprobe|ENOENT.*ff(mpeg|probe)/i,
    message: "ffmpeg が見つかりません。ffmpeg をインストールして、PowerShell を開き直してください。",
  },
];

export function errorMessage(err: unknown): string {
  const raw = rawMessage(err);
  const hint = HINTS.find((h) => h.test.test(raw));
  // 原因が分かるものは日本語で先に示し、元のメッセージは短く添える
  return hint ? `${hint.message}\n（詳細: ${raw.slice(0, 160)}）` : raw.slice(0, 600);
}
