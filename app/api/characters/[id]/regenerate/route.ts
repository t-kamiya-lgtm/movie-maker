import { randomUUID } from "crypto";
import { bad, json, viewCharacter } from "@/lib/api";
import { mutate, now } from "@/lib/db";
import { runInBackground } from "@/lib/jobs";
import { generateCharacter } from "@/lib/generate";
import { anchorOf, ensureProfiles, findProfile } from "@/lib/profiles";
import { getImageModel } from "@/lib/providers/catalog";
import type { Character } from "@/lib/types";

export const runtime = "nodejs";

/**
 * 画像の再生成。元の画像は残し、同じ設定（またはプロンプトを修正して）で新しい画像を追加する。
 * body: { prompt?: string }
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { prompt?: string };

  const created = await mutate((db) => {
    ensureProfiles(db);
    const src = db.characters.find((x) => x.id === id);
    if (!src) return { error: "not found" as const };
    if (src.model === "upload" || !getImageModel(src.model)) return { error: "upload" as const };
    const profile = findProfile(db, src.name);
    const anchor = profile ? anchorOf(db, profile) : undefined;
    const prompt = body.prompt?.trim() || src.prompt;
    const c: Character = {
      id: randomUUID(),
      kind: src.kind,
      name: src.name,
      tags: [...src.tags],
      prompt,
      model: src.model,
      aspect: src.aspect,
      status: "pending",
      createdAt: now(),
      attributes: src.attributes ?? profile?.attributes,
      refCharacterId: anchor?.id,
      framing: src.framing ?? (anchor ? "free" : "bust"),
    };
    db.characters.push(c);
    return { c };
  });

  if ("error" in created) {
    return created.error === "upload"
      ? bad("アップロードした画像は再生成できません。「AIで生成」から同じ名前で生成してください")
      : bad("not found", 404);
  }
  runInBackground(`character:${created.c.id}`, () => generateCharacter(created.c.id, []));
  return json(viewCharacter(created.c));
}
