import { bad, json } from "@/lib/api";
import { mutate } from "@/lib/db";
import { runInBackground } from "@/lib/jobs";
import { generateNarration } from "@/lib/generate";
import { removeFile } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; nid: string }> };

/** 開始位置の変更 / 原稿・ボイス変更時は再生成 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id, nid } = await ctx.params;
  const body = (await req.json()) as { text?: string; voiceId?: string; voiceName?: string; start?: number };
  const regen = await mutate((db) => {
    const n = db.projects.find((x) => x.id === id)?.narrations.find((x) => x.id === nid);
    if (!n) return null;
    let changed = false;
    if (typeof body.start === "number") n.start = Math.max(0, body.start);
    if (typeof body.text === "string" && body.text.trim() && body.text.trim() !== n.text) {
      n.text = body.text.trim();
      changed = true;
    }
    if (body.voiceId && body.voiceId !== n.voiceId) {
      n.voiceId = body.voiceId;
      n.voiceName = body.voiceName || body.voiceId;
      changed = true;
    }
    if (changed) {
      n.status = "pending";
      n.error = undefined;
    }
    return { changed };
  });
  if (!regen) return bad("not found", 404);
  if (regen.changed) runInBackground(`narration:${nid}`, () => generateNarration(id, nid));
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, nid } = await ctx.params;
  const removed = await mutate((db) => {
    const p = db.projects.find((x) => x.id === id);
    const i = p?.narrations.findIndex((x) => x.id === nid) ?? -1;
    return p && i >= 0 ? p.narrations.splice(i, 1)[0] : null;
  });
  if (!removed) return bad("not found", 404);
  await removeFile(removed.audioPath);
  return json({ ok: true });
}
