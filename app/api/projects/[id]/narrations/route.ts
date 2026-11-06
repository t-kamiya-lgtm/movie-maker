import { randomUUID } from "crypto";
import { bad, json } from "@/lib/api";
import { mutate } from "@/lib/db";
import { runInBackground } from "@/lib/jobs";
import { generateNarration } from "@/lib/generate";
import type { Narration } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { text?: string; voiceId?: string; voiceName?: string; start?: number };
  const text = body.text?.trim();
  if (!text) return bad("ナレーション原稿を入力してください");
  if (!body.voiceId) return bad("ボイスを選択してください");
  const n: Narration = {
    id: randomUUID(),
    text,
    voiceId: body.voiceId,
    voiceName: body.voiceName || body.voiceId,
    start: Math.max(0, Number(body.start) || 0),
    status: "pending",
  };
  const ok = await mutate((db) => {
    const p = db.projects.find((x) => x.id === id);
    if (!p) return false;
    p.narrations.push(n);
    p.updatedAt = Date.now();
    return true;
  });
  if (!ok) return bad("not found", 404);
  runInBackground(`narration:${n.id}`, () => generateNarration(id, n.id));
  return json(n);
}
