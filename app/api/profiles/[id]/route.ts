import { bad, json } from "@/lib/api";
import { mutate, now } from "@/lib/db";
import { cleanAttributes } from "@/lib/profile";
import { ensureProfiles } from "@/lib/profiles";

export const runtime = "nodejs";

/**
 * プロフィールの更新
 * body: { prompt?, attributes?, anchorId?（基準画像にする画像の ID） }
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { prompt?: string; attributes?: unknown; anchorId?: string };
  const result = await mutate((db) => {
    const p = db.profiles.find((x) => x.id === id);
    if (!p) return "not found";
    if (typeof body.prompt === "string") p.prompt = body.prompt.trim();
    if (body.attributes !== undefined) p.attributes = cleanAttributes(body.attributes);
    if (body.anchorId) {
      const c = db.characters.find((x) => x.id === body.anchorId);
      if (!c || c.name !== p.name || c.status !== "ready") return "基準画像には、同じ名前の完成した画像を選んでください";
      p.anchorId = c.id;
    }
    p.updatedAt = now();
    ensureProfiles(db);
    return { ...p };
  });
  if (typeof result === "string") return bad(result, result === "not found" ? 404 : 400);
  return json(result);
}
