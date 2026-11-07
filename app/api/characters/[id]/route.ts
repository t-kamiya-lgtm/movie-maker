import { bad, json, normTags, viewCharacter } from "@/lib/api";
import { mutate } from "@/lib/db";
import { ensureProfiles, findProfile } from "@/lib/profiles";
import { removeFile } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** 名前・タグの変更 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { name?: string; tags?: unknown; kind?: string };
  const result = await mutate((db) => {
    const c = db.characters.find((x) => x.id === id);
    if (!c) return null;
    if (typeof body.name === "string" && body.name.trim()) c.name = body.name.trim();
    if (body.tags !== undefined) c.tags = normTags(body.tags);
    ensureProfiles(db); // 名前を変えた場合は、その名前のプロフィールに移る
    if (body.kind === "character" || body.kind === "item") {
      // 種類は名前（プロフィール）単位でそろえる
      const kind = body.kind;
      for (const x of db.characters) if (x.name === c.name) x.kind = kind;
      const p = findProfile(db, c.name);
      if (p) p.kind = kind;
    }
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
    ensureProfiles(db); // 基準画像を消した場合は付け直す
    return c;
  });
  if (!removed) return bad("not found", 404);
  await removeFile(removed.imagePath);
  return json({ ok: true });
}
