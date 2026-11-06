"use client";

import { useState, type ReactNode } from "react";
import { fmtSec, type SceneView } from "@/lib/client";
import type { TimelineClip } from "@/lib/types";

export const PX_PER_SEC = 48;

export interface LaidClip {
  clip: TimelineClip;
  scene?: SceneView;
  start: number;
  duration: number;
}

export function clipDuration(c: TimelineClip, s?: SceneView) {
  const full = s?.duration ?? 5;
  const start = Math.min(c.trimStart || 0, full);
  const end = c.trimEnd && c.trimEnd > start ? Math.min(c.trimEnd, full) : full;
  return Math.max(0.1, end - start);
}

export function layout(clips: TimelineClip[], scenes: SceneView[]): LaidClip[] {
  let t = 0;
  return clips.map((clip) => {
    const scene = scenes.find((s) => s.id === clip.sceneId);
    const duration = clipDuration(clip, scene);
    const item = { clip, scene, start: t, duration };
    t += duration;
    return item;
  });
}

export function Ruler({ total }: { total: number }) {
  const marks = Math.ceil(total) + 1;
  return (
    <div className="relative h-5 border-b border-line text-[10px] text-white/40" style={{ width: Math.max(total, 1) * PX_PER_SEC }}>
      {Array.from({ length: marks }).map((_, i) => (
        <span key={i} className="absolute top-0 border-l border-line pl-0.5" style={{ left: i * PX_PER_SEC }}>
          {i % 5 === 0 ? fmtSec(i) : ""}
        </span>
      ))}
    </div>
  );
}

/** 映像トラック（ドラッグで並べ替え） */
export function VideoTrack({
  items,
  selectedId,
  onSelect,
  onReorder,
}: {
  items: LaidClip[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onReorder?: (from: number, to: number) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <div className="flex h-20">
      {items.map((it, i) => (
        <div
          key={it.clip.id}
          draggable={!!onReorder}
          onDragStart={() => setDrag(i)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(i);
          }}
          onDragEnd={() => {
            setDrag(null);
            setOver(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag !== null && drag !== i) onReorder?.(drag, i);
            setDrag(null);
            setOver(null);
          }}
          onClick={() => onSelect?.(it.clip.id)}
          className={`relative h-full shrink-0 cursor-pointer overflow-hidden rounded-md border-2 bg-black ${
            selectedId === it.clip.id ? "border-accent" : over === i ? "border-white/60" : "border-line"
          } ${drag === i ? "opacity-40" : ""}`}
          style={{ width: it.duration * PX_PER_SEC }}
          title={it.scene?.prompt}
        >
          {it.scene?.imageUrl && (
            <div
              className="absolute inset-0 bg-repeat-x opacity-80"
              style={{ backgroundImage: `url(${it.scene.imageUrl})`, backgroundSize: "auto 100%" }}
            />
          )}
          <span className="absolute bottom-0.5 left-1 rounded bg-black/70 px-1 text-[10px]">
            {i + 1} · {it.duration.toFixed(1)}s
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrackRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="sticky left-0 z-10 flex w-20 shrink-0 items-center bg-panel text-[11px] text-white/50">{label}</div>
      <div className="relative">{children}</div>
    </div>
  );
}
