import { randomUUID } from "crypto";
import { json, viewProject } from "@/lib/api";
import { mutate, now, readDb } from "@/lib/db";
import { DEFAULT_ASPECT, getAspect } from "@/lib/aspect";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await readDb();
  return json(db.projects.sort((a, b) => b.updatedAt - a.updatedAt).map(viewProject));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; aspect?: string; sceneIds?: string[] };
  const db = await readDb();
  const p: Project = {
    id: randomUUID(),
    name: body.name?.trim() || `プロジェクト ${db.projects.length + 1}`,
    aspect: getAspect(body.aspect || DEFAULT_ASPECT).id,
    fit: "cover",
    clips: (body.sceneIds ?? [])
      .filter((id) => db.scenes.some((s) => s.id === id && s.videoStatus === "ready"))
      .map((sceneId) => ({ id: randomUUID(), sceneId, trimStart: 0 })),
    narrations: [],
    ambientVolume: 0.35,
    narrationVolume: 1,
    renderStatus: "none",
    createdAt: now(),
    updatedAt: now(),
  };
  await mutate((d) => void d.projects.push(p));
  return json(viewProject(p));
}
