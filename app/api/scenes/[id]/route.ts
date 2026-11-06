import { bad, json, normTags, viewScene } from "@/lib/api";
import { mutate } from "@/lib/db";
import { runInBackground } from "@/lib/jobs";
import { generateSceneImage } from "@/lib/generate";
import { removeFile } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** タグ・プロンプトの変更 / regenerateImage=true で画像を再生成 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { tags?: unknown; prompt?: string; regenerateImage?: boolean };
  const result = await mutate((db) => {
    const s = db.scenes.find((x) => x.id === id);
    if (!s) return null;
    if (body.tags !== undefined) s.tags = normTags(body.tags);
    if (typeof body.prompt === "string" && body.prompt.trim()) s.prompt = body.prompt.trim();
    if (body.regenerateImage) {
      s.imageStatus = "pending";
      s.imageError = undefined;
    }
    return { ...s };
  });
  if (!result) return bad("not found", 404);
  if (body.regenerateImage) runInBackground(`scene-image:${id}`, () => generateSceneImage(id));
  return json(viewScene(result));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const removed = await mutate((db) => {
    const i = db.scenes.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const [s] = db.scenes.splice(i, 1);
    for (const p of db.projects) p.clips = p.clips.filter((c) => c.sceneId !== id);
    return s;
  });
  if (!removed) return bad("not found", 404);
  await removeFile(removed.imagePath);
  await removeFile(removed.videoPath);
  return json({ ok: true });
}
