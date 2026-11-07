import { randomUUID } from "crypto";
import { bad, json, normTags, viewScene } from "@/lib/api";
import { mutate, now, readDb } from "@/lib/db";
import { runInBackground } from "@/lib/jobs";
import { generateSceneImage } from "@/lib/generate";
import { DEFAULT_ASPECT } from "@/lib/aspect";
import { getImageModel, getVideoModel } from "@/lib/providers/catalog";
import type { Scene } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ?tag=a&tag=b  … すべてのタグを含むもの（AND）
 * ?video=1      … 動画が完成しているもののみ
 * ?character=ID … キャラクターで絞り込み
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const tags = sp.getAll("tag").filter(Boolean);
  const videoOnly = sp.get("video") === "1";
  const character = sp.get("character");
  const db = await readDb();
  const list = db.scenes
    .filter((s) => tags.every((t) => s.tags.includes(t)))
    .filter((s) => !videoOnly || s.videoStatus === "ready")
    .filter((s) => !character || s.characterIds.includes(character))
    .sort((a, b) => b.createdAt - a.createdAt);
  return json(list.map(viewScene));
}

/** シーン画像の量産：prompts × countPerPrompt 枚を生成 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    characterIds?: string[];
    prompts?: string[];
    countPerPrompt?: number;
    imageModel?: string;
    aspect?: string;
    tags?: unknown;
    /** 画像ができたら続けて動画化する */
    video?: { videoModel?: string; motionPrompt?: string; duration?: number } | null;
  };
  const prompts = (body.prompts ?? []).map((p) => p.trim()).filter(Boolean);
  if (!prompts.length) return bad("シーンのプロンプトを入力してください");
  const imageModel = body.imageModel || "nano-banana";
  if (!getImageModel(imageModel)) return bad("画像モデルが不正です");
  const vModel = body.video ? getVideoModel(body.video.videoModel || "") : undefined;
  if (body.video && !vModel) return bad("動画モデルを選択してください");
  const vDuration =
    vModel && vModel.durations.includes(Number(body.video?.duration)) ? Number(body.video?.duration) : vModel?.durations[0];
  const count = Math.min(8, Math.max(1, Number(body.countPerPrompt || 1)));
  if (prompts.length * count > 40) return bad("一度に生成できるのは 40 枚までです");

  const db = await readDb();
  const characterIds = (body.characterIds ?? []).filter((id) =>
    db.characters.some((c) => c.id === id && c.status === "ready"),
  );
  const tags = normTags(body.tags);
  const t0 = now();
  const created: Scene[] = [];
  prompts.forEach((prompt, pi) => {
    for (let i = 0; i < count; i++) {
      created.push({
        id: randomUUID(),
        characterIds,
        prompt,
        aspect: body.aspect || DEFAULT_ASPECT,
        imageModel,
        imageStatus: "pending",
        videoStatus: "none",
        ...(vModel
          ? {
              autoVideo: true,
              videoModel: vModel.id,
              motionPrompt: body.video?.motionPrompt?.trim() || undefined,
              duration: vDuration,
            }
          : {}),
        tags,
        createdAt: t0 + pi * count + i,
      });
    }
  });
  await mutate((d) => void d.scenes.push(...created));
  for (const s of created) runInBackground(`scene-image:${s.id}`, () => generateSceneImage(s.id));
  return json(created.map(viewScene));
}
