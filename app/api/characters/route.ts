import { randomUUID } from "crypto";
import { bad, json, normTags, viewCharacter } from "@/lib/api";
import { mutate, now, readDb } from "@/lib/db";
import { runInBackground } from "@/lib/jobs";
import { generateCharacter } from "@/lib/generate";
import { saveBuffer } from "@/lib/storage";
import { DEFAULT_ASPECT } from "@/lib/aspect";
import { getImageModel } from "@/lib/providers/catalog";
import { cleanAttributes } from "@/lib/profile";
import { anchorOf, ensureProfiles, findProfile } from "@/lib/profiles";
import type { AssetKind, Character } from "@/lib/types";

const kindOf = (v: unknown): AssetKind => (v === "item" ? "item" : "character");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const tag = sp.get("tag");
  const kind = sp.get("kind");
  const db = await readDb();
  const list = db.characters
    .filter((c) => !tag || c.tags.includes(tag) || c.name === tag)
    .filter((c) => !kind || (c.kind ?? "character") === kind)
    .sort((a, b) => b.createdAt - a.createdAt);
  return json(list.map(viewCharacter));
}

function extOf(file: File) {
  const m = file.name.match(/\.(png|jpe?g|webp)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

/**
 * multipart/form-data
 *  mode=generate : name, kind, prompt, attributes(JSON), useAnchor(1/0), model, aspect, count, tags, references(File[])
 *  mode=upload   : name, kind, attributes(JSON), tags, file(File)  … 手持ちの画像を登録
 *
 * 同じ名前のプロフィールがあれば「既存の人物」として、基準画像を顔の見本にして生成する。
 * 新しい名前なら、プロフィールを作り、顔を確認しやすいバストアップで生成する。
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const mode = String(form.get("mode") || "generate");
  const name = String(form.get("name") || "").trim();
  const tags = normTags(form.get("tags"));
  const formKind = kindOf(form.get("kind"));
  let attributes: Record<string, string> = {};
  try {
    attributes = cleanAttributes(JSON.parse(String(form.get("attributes") || "{}")));
  } catch {
    /* 不正な JSON は無視 */
  }
  if (!name) return bad("名前を入力してください");

  if (mode === "upload") {
    const file = form.get("file");
    if (!(file instanceof File)) return bad("画像ファイルを選択してください");
    const imagePath = await saveBuffer("characters", extOf(file), Buffer.from(await file.arrayBuffer()));
    const c = await mutate((db) => {
      const existing = findProfile(db, name);
      if (existing && Object.keys(attributes).length) {
        existing.attributes = attributes;
        existing.updatedAt = now();
      }
      const c: Character = {
        id: randomUUID(),
        kind: existing?.kind ?? formKind,
        name,
        tags,
        prompt: "(アップロード)",
        model: "upload",
        aspect: String(form.get("aspect") || DEFAULT_ASPECT),
        imagePath,
        status: "ready",
        createdAt: now(),
        attributes: existing?.attributes ?? attributes,
      };
      db.characters.push(c);
      if (!existing) {
        db.profiles.push({ id: randomUUID(), name, kind: formKind, prompt: "", attributes, createdAt: now(), updatedAt: now() });
      }
      ensureProfiles(db);
      return c;
    });
    return json([viewCharacter(c)]);
  }

  const prompt = String(form.get("prompt") || "").trim();
  const model = String(form.get("model") || "nano-banana");
  const aspect = String(form.get("aspect") || DEFAULT_ASPECT);
  const count = Math.min(8, Math.max(1, Number(form.get("count") || 1)));
  const useAnchor = String(form.get("useAnchor") ?? "1") !== "0";
  if (!prompt) return bad("プロンプトを入力してください");
  if (!getImageModel(model)) return bad("画像モデルが不正です");

  const refFiles = form.getAll("references").filter((f): f is File => f instanceof File && f.size > 0);
  const created = await mutate((db) => {
    ensureProfiles(db);
    let profile = findProfile(db, name);
    if (!profile) {
      profile = { id: randomUUID(), name, kind: formKind, prompt, attributes, createdAt: now(), updatedAt: now() };
      db.profiles.push(profile);
    } else {
      // 入力欄で編集した内容を、次回のためにプロフィールへ保存
      Object.assign(profile, { prompt, attributes, updatedAt: now() });
    }
    const anchor = useAnchor ? anchorOf(db, profile) : undefined;
    const kind = profile.kind;
    const list: Character[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        id: randomUUID(),
        kind,
        name,
        tags,
        prompt,
        model,
        aspect,
        status: "pending",
        createdAt: now() + i,
        attributes,
        refCharacterId: anchor?.id,
        // 基準画像のない人物（新しい人物）は、顔を確認しやすいバストアップで生成
        framing: kind === "character" && !anchor ? "bust" : "free",
      });
    }
    db.characters.push(...list);
    return list;
  });

  for (const c of created) {
    const refs: string[] = [];
    for (const f of refFiles) refs.push(await saveBuffer("tmp", extOf(f), Buffer.from(await f.arrayBuffer())));
    runInBackground(`character:${c.id}`, () => generateCharacter(c.id, refs));
  }
  return json(created.map(viewCharacter));
}
