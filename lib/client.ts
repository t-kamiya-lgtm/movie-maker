"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AspectPreset } from "./aspect";
import type { Character, Narration, Project, Scene } from "./types";

export type CharacterView = Character & { imageUrl?: string };
export type SceneView = Scene & { imageUrl?: string; videoUrl?: string };
export type NarrationView = Narration & { audioUrl?: string };
export type ProjectView = Omit<Project, "narrations"> & {
  baseVideoUrl?: string;
  finalVideoUrl?: string;
  narrations: NarrationView[];
  scenes?: SceneView[];
};

export interface ModelInfo {
  aspects: AspectPreset[];
  defaultAspect: string;
  keys: { fal: boolean; google: boolean; fish: boolean };
  imageModels: { id: string; label: string; note?: string; provider: string; supportsReference: boolean; available: boolean }[];
  videoModels: {
    id: string;
    label: string;
    note?: string;
    provider: string;
    durations: number[];
    nativeAudio: boolean;
    available: boolean;
  }[];
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    ...(json !== undefined
      ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) } }
      : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

/** データ取得＋処理中（pending）の間は自動でポーリング */
export function usePolled<T>(url: string | null, isPending: (data: T) => boolean, interval = 2500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(isPending);
  pendingRef.current = isPending;

  const reload = useCallback(async () => {
    if (!url) return;
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!data || !pendingRef.current(data)) return;
    const t = setTimeout(reload, interval);
    return () => clearTimeout(t);
  }, [data, reload, interval]);

  return { data, error, reload, setData };
}

export function useModels() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  useEffect(() => {
    api<ModelInfo>("/api/models").then(setInfo).catch(() => undefined);
  }, []);
  return info;
}

/** 使えるモデルの中から既定を選ぶ（Google → fal.ai → モックの順） */
export function pickDefault<T extends { id: string; provider: string; available: boolean }>(
  models: T[],
  current: string,
): string {
  if (models.some((m) => m.id === current && m.available)) return current;
  for (const p of ["google", "fal", "mock"]) {
    const m = models.find((x) => x.provider === p && x.available);
    if (m) return m.id;
  }
  return current;
}

export function hasAnyAiKey(info: ModelInfo | null) {
  return !info || info.keys.google || info.keys.fal;
}

export function aspectStyle(aspect: string): React.CSSProperties {
  const [w, h] = aspect.split(":").map(Number);
  return { aspectRatio: `${w} / ${h}` };
}

export function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${r}`;
}
