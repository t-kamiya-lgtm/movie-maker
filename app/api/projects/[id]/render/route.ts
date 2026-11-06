import { bad, json } from "@/lib/api";
import { mutate } from "@/lib/db";
import { runInBackground } from "@/lib/jobs";
import { renderProject } from "@/lib/generate";

export const runtime = "nodejs";

/** target=base: ③ 結合動画 / target=final: ④ ナレーション付き */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { target?: "base" | "final" };
  const target = body.target === "final" ? "final" : "base";
  const ok = await mutate((db) => {
    const p = db.projects.find((x) => x.id === id);
    if (!p || p.renderStatus === "pending") return false;
    if (!p.clips.length) return false;
    p.renderStatus = "pending";
    p.renderTarget = target;
    p.renderError = undefined;
    return true;
  });
  if (!ok) return bad("書き出しできません（クリップが空、または処理中です）");
  runInBackground(`render:${id}`, () => renderProject(id, target));
  return json({ ok: true });
}
