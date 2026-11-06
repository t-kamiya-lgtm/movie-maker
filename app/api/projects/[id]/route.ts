import { randomUUID } from "crypto";
import { bad, json, viewProject, viewScene } from "@/lib/api";
import { mutate, now, readDb } from "@/lib/db";
import { getAspect } from "@/lib/aspect";
import { removeFile } from "@/lib/storage";
import type { FitMode, TimelineClip } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = await readDb();
  const p = db.projects.find((x) => x.id === id);
  if (!p) return bad("not found", 404);
  const ids = new Set(p.clips.map((c) => c.sceneId));
  return json({
    ...viewProject(p),
    scenes: db.scenes.filter((s) => ids.has(s.id)).map(viewScene),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    name?: string;
    aspect?: string;
    fit?: FitMode;
    clips?: Partial<TimelineClip>[];
    addSceneIds?: string[];
    ambientVolume?: number;
    narrationVolume?: number;
  };
  const result = await mutate((db) => {
    const p = db.projects.find((x) => x.id === id);
    if (!p) return null;
    if (typeof body.name === "string" && body.name.trim()) p.name = body.name.trim();
    if (body.aspect) p.aspect = getAspect(body.aspect).id;
    if (body.fit === "cover" || body.fit === "contain") p.fit = body.fit;
    if (Array.isArray(body.clips)) {
      p.clips = body.clips
        .filter((c) => c.sceneId && db.scenes.some((s) => s.id === c.sceneId))
        .map((c) => ({
          id: c.id || randomUUID(),
          sceneId: c.sceneId!,
          trimStart: Math.max(0, Number(c.trimStart) || 0),
          trimEnd: c.trimEnd ? Math.max(0, Number(c.trimEnd)) : undefined,
        }));
    }
    for (const sceneId of body.addSceneIds ?? []) {
      if (db.scenes.some((s) => s.id === sceneId && s.videoStatus === "ready"))
        p.clips.push({ id: randomUUID(), sceneId, trimStart: 0 });
    }
    if (typeof body.ambientVolume === "number") p.ambientVolume = Math.min(1, Math.max(0, body.ambientVolume));
    if (typeof body.narrationVolume === "number")
      p.narrationVolume = Math.min(2, Math.max(0, body.narrationVolume));
    p.updatedAt = now();
    return structuredClone(p);
  });
  return result ? json(viewProject(result)) : bad("not found", 404);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const removed = await mutate((db) => {
    const i = db.projects.findIndex((x) => x.id === id);
    return i < 0 ? null : db.projects.splice(i, 1)[0];
  });
  if (!removed) return bad("not found", 404);
  await removeFile(removed.baseVideoPath);
  if (removed.finalVideoPath !== removed.baseVideoPath) await removeFile(removed.finalVideoPath);
  for (const n of removed.narrations) await removeFile(n.audioPath);
  return json({ ok: true });
}
