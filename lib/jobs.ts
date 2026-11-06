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

export function errorMessage(err: unknown): string {
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
