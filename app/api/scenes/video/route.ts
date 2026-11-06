import { bad, json } from "@/lib/api";
import { mutate } from "@/lib/db";
import { runInBackground } from "@/lib/jobs";
import { generateSceneVideo } from "@/lib/generate";
import { getVideoModel } from "@/lib/providers/catalog";

export const runtime = "nodejs";

/** 選択したシーン画像をまとめて動画化（環境音のみ） */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    sceneIds?: string[];
    videoModel?: string;
    motionPrompt?: string;
    duration?: number;
  };
  const model = getVideoModel(body.videoModel || "");
  if (!model) return bad("動画モデルを選択してください");
  const ids = body.sceneIds ?? [];
  if (!ids.length) return bad("シーンを選択してください");
  const duration = model.durations.includes(Number(body.duration)) ? Number(body.duration) : model.durations[0];

  const started = await mutate((db) => {
    const out: string[] = [];
    for (const id of ids) {
      const s = db.scenes.find((x) => x.id === id);
      if (!s || s.imageStatus !== "ready" || s.videoStatus === "pending") continue;
      s.videoModel = model.id;
      s.motionPrompt = body.motionPrompt?.trim() || undefined;
      s.duration = duration;
      s.videoStatus = "pending";
      s.videoError = undefined;
      out.push(id);
    }
    return out;
  });
  for (const id of started) runInBackground(`scene-video:${id}`, () => generateSceneVideo(id));
  return json({ started });
}
