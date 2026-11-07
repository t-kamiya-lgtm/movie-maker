import { json } from "@/lib/api";
import { mutate } from "@/lib/db";
import { anchorOf, ensureProfiles } from "@/lib/profiles";
import { fileUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 人物・商品プロフィールの一覧（基準画像と画像数つき） */
export async function GET() {
  const list = await mutate((db) => {
    ensureProfiles(db);
    return db.profiles
      .map((p) => {
        const anchor = anchorOf(db, p);
        return {
          ...p,
          anchorUrl: fileUrl(anchor?.imagePath),
          imageCount: db.characters.filter((c) => c.name === p.name).length,
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });
  return json(list);
}
