import { bad, json, normTags, viewCharacter } from "@/lib/api";
import { mutate } from "@/lib/db";
import { removeFile } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** 名前・タグの変更 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { name?: string; tags?: unknown };
  const result = await mutate((db) => {
    const c = db.characters.find((x) => x.id === id);
    if (!c) return null;
    if (typeof body.name === "string" && body.name.trim()) c.name = body.name.trim();
    if (body.tags !== undefined) c.tags = normTags(body.tags);
    return { ...c };
  });
  return result ? json(viewCharacter(result)) : bad("not found", 404);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const removed = await mutate((db) => {
    const i = db.characters.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const [c] = db.characters.splice(i, 1);
    for (const s of db.scenes) s.characterIds = s.characterIds.filter((x) => x !== id);
    return c;
  });
  if (!removed) return bad("not found", 404);
  await removeFile(removed.imagePath);
  return json({ ok: true });
}
