import { randomUUID } from "crypto";
import { bad, json, normTags, viewCharacter } from "@/lib/api";
import { mutate, now, readDb } from "@/lib/db";
import { runInBackground } from "@/lib/jobs";
import { generateCharacter } from "@/lib/generate";
import { saveBuffer } from "@/lib/storage";
import { DEFAULT_ASPECT } from "@/lib/aspect";
import { getImageModel } from "@/lib/providers/catalog";
import type { Character } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const tag = new URL(req.url).searchParams.get("tag");
  const db = await readDb();
  const list = db.characters
    .filter((c) => !tag || c.tags.includes(tag) || c.name === tag)
    .sort((a, b) => b.createdAt - a.createdAt);
  return json(list.map(viewCharacter));
}

function extOf(file: File) {
  const m = file.name.match(/\.(png|jpe?g|webp)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

/**
 * multipart/form-data
 *  mode=generate : name, prompt, model, aspect, count, tags, references(File[])
 *  mode=upload   : name, tags, file(File)  … 手持ちの画像をキャラクターとして登録
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const mode = String(form.get("mode") || "generate");
  const name = String(form.get("name") || "").trim();
  const tags = normTags(form.get("tags"));
  if (!name) return bad("キャラクター名を入力してください");

  if (mode === "upload") {
    const file = form.get("file");
    if (!(file instanceof File)) return bad("画像ファイルを選択してください");
    const imagePath = await saveBuffer("characters", extOf(file), Buffer.from(await file.arrayBuffer()));
    const c: Character = {
      id: randomUUID(),
      name,
      tags,
      prompt: "(アップロード)",
      model: "upload",
      aspect: String(form.get("aspect") || DEFAULT_ASPECT),
      imagePath,
      status: "ready",
      createdAt: now(),
    };
    await mutate((db) => void db.characters.push(c));
    return json([viewCharacter(c)]);
  }

  const prompt = String(form.get("prompt") || "").trim();
  const model = String(form.get("model") || "nano-banana");
  const aspect = String(form.get("aspect") || DEFAULT_ASPECT);
  const count = Math.min(8, Math.max(1, Number(form.get("count") || 1)));
  if (!prompt) return bad("プロンプトを入力してください");
  if (!getImageModel(model)) return bad("画像モデルが不正です");

  const refFiles = form.getAll("references").filter((f): f is File => f instanceof File && f.size > 0);
  const created: Character[] = [];
  for (let i = 0; i < count; i++) {
    created.push({
      id: randomUUID(),
      name,
      tags,
      prompt,
      model,
      aspect,
      status: "pending",
      createdAt: now() + i,
    });
  }
  await mutate((db) => void db.characters.push(...created));

  for (const c of created) {
    const refs: string[] = [];
    for (const f of refFiles) refs.push(await saveBuffer("tmp", extOf(f), Buffer.from(await f.arrayBuffer())));
    runInBackground(`character:${c.id}`, () => generateCharacter(c.id, refs));
  }
  return json(created.map(viewCharacter));
}
