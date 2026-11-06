import { NextResponse } from "next/server";
import { fileUrl } from "./storage";
import type { Character, Project, Scene } from "./types";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export function normTags(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,、\s]+/) : [];
  return [...new Set(arr.map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean))].slice(0, 30);
}

export const viewCharacter = (c: Character) => ({ ...c, imageUrl: fileUrl(c.imagePath) });
export const viewScene = (s: Scene) => ({ ...s, imageUrl: fileUrl(s.imagePath), videoUrl: fileUrl(s.videoPath) });
export const viewProject = (p: Project) => ({
  ...p,
  baseVideoUrl: fileUrl(p.baseVideoPath),
  finalVideoUrl: fileUrl(p.finalVideoPath),
  narrations: p.narrations.map((n) => ({ ...n, audioUrl: fileUrl(n.audioPath) })),
});
