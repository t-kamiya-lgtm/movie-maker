"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { api, aspectStyle, fmtSec, useModels, usePolled, type ProjectView, type SceneView } from "@/lib/client";
import type { TimelineClip } from "@/lib/types";
import { AspectSelect } from "@/components/AspectSelect";
import { TagFilter, collectTags } from "@/components/Tags";
import { PX_PER_SEC, Ruler, TrackRow, VideoTrack, layout } from "@/components/Timeline";
import { Button, Empty, Field, Panel, Select, Spinner, inputCls } from "@/components/ui";

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const models = useModels();
  const { data: project, reload, setData } = usePolled<ProjectView>(`/api/projects/${id}`, (p) => p.renderStatus === "pending");
  const { data: library } = usePolled<SceneView[]>("/api/scenes?video=1", () => false);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [filter, setFilter] = useState<string[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    if (project) setName(project.name);
  }, [project?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const scenes = useMemo(() => {
    const map = new Map<string, SceneView>();
    for (const s of [...(project?.scenes ?? []), ...(library ?? [])]) map.set(s.id, s);
    return [...map.values()];
  }, [project?.scenes, library]);

  if (!project) return <Spinner label="読み込み中…" />;

  const items = layout(project.clips, scenes);
  const total = items.reduce((a, b) => a + b.duration, 0);
  const sel = items.find((i) => i.clip.id === selectedClip);
  const libTags = collectTags(library ?? []);
  const libShown = (library ?? []).filter((s) => filter.every((t) => s.tags.includes(t)));

  const save = async (body: Record<string, unknown>) => {
    const next = await api<ProjectView>(`/api/projects/${id}`, { method: "PATCH", json: body });
    setData({ ...next, scenes: project.scenes });
    await reload();
  };
  const saveClips = (clips: TimelineClip[]) => save({ clips });

  const reorder = (from: number, to: number) => {
    const clips = [...project.clips];
    const [m] = clips.splice(from, 1);
    clips.splice(to, 0, m);
    void saveClips(clips);
  };
  const updateClip = (clipId: string, patch: Partial<TimelineClip>) =>
    saveClips(project.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)));
  const removeClip = (clipId: string) => {
    setSelectedClip(null);
    void saveClips(project.clips.filter((c) => c.id !== clipId));
  };
  const render = async () => {
    await api(`/api/projects/${id}/render`, { method: "POST", json: { target: "base" } });
    await reload();
  };

  const rendering = project.renderStatus === "pending";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/editor" className="text-sm text-white/50 hover:text-white">
          ← 一覧
        </Link>
        <input
          className={`${inputCls} !w-64 font-bold`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== project.name && save({ name })}
        />
        <span className="text-sm text-white/50">
          合計 {fmtSec(total)} · {project.clips.length} クリップ
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="primary" disabled={rendering || !project.clips.length} onClick={render}>
            {rendering && project.renderTarget === "base" ? "書き出し中…" : "結合動画を書き出す"}
          </Button>
          <Link href={`/voice/${id}`}>
            <Button>④ ナレーションへ →</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title="出力設定">
            <div className="flex flex-wrap items-end gap-4">
              {models && (
                <Field label="サイズ（SNS）">
                  <AspectSelect aspects={models.aspects} value={project.aspect} onChange={(a) => save({ aspect: a })} />
                </Field>
              )}
              <Field label="はみ出し処理">
                <Select value={project.fit} onChange={(e) => save({ fit: e.target.value })} className="!w-auto">
                  <option value="cover">切り抜き（全面）</option>
                  <option value="contain">余白を付ける（全体表示）</option>
                </Select>
              </Field>
              <span className="pb-2 text-xs text-white/40">
                {models?.aspects.find((a) => a.id === project.aspect)?.usage}（
                {models?.aspects.find((a) => a.id === project.aspect)?.width}×
                {models?.aspects.find((a) => a.id === project.aspect)?.height}）
              </span>
            </div>
          </Panel>

          <Panel title="タイムライン（ドラッグで並べ替え・クリックで編集）">
            {items.length === 0 ? (
              <Empty>右の素材ライブラリから動画を追加してください</Empty>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="space-y-1" style={{ minWidth: total * PX_PER_SEC + 80 }}>
                  <TrackRow label="">
                    <Ruler total={total} />
                  </TrackRow>
                  <TrackRow label="映像＋環境音">
                    <VideoTrack items={items} selectedId={selectedClip} onSelect={setSelectedClip} onReorder={reorder} />
                  </TrackRow>
                </div>
              </div>
            )}
          </Panel>

          {sel && sel.scene && (
            <Panel
              title={`クリップ ${items.indexOf(sel) + 1} を編集`}
              actions={
                <Button variant="danger" className="text-xs" onClick={() => removeClip(sel.clip.id)}>
                  タイムラインから外す
                </Button>
              }
            >
              <ClipEditor key={sel.clip.id} clip={sel.clip} scene={sel.scene} onChange={(p) => updateClip(sel.clip.id, p)} />
            </Panel>
          )}

          <Panel title="プレビュー">
            {rendering ? (
              <div className="py-10">
                <Spinner label="ffmpeg で結合中…" />
              </div>
            ) : project.renderStatus === "error" ? (
              <p className="text-sm text-red-300">{project.renderError}</p>
            ) : project.baseVideoUrl ? (
              <div className="space-y-2">
                <video src={project.baseVideoUrl} controls className="mx-auto h-[60vh] max-w-full bg-black" />
                <div className="text-center">
                  <a href={`${project.baseVideoUrl}?download`} className="text-sm text-accent hover:underline">
                    ダウンロード
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/40">「結合動画を書き出す」を押すとここに表示されます</p>
            )}
          </Panel>
        </div>

        <Panel title="素材ライブラリ（動画）">
          <div className="mb-2">
            <TagFilter all={libTags} selected={filter} onChange={setFilter} />
          </div>
          {libShown.length === 0 ? (
            <Empty>② で動画化したシーンがここに表示されます</Empty>
          ) : (
            <div className="grid max-h-[75vh] grid-cols-3 gap-2 overflow-y-auto">
              {libShown.map((s) => (
                <button
                  key={s.id}
                  onClick={() => save({ addSceneIds: [s.id] })}
                  className="group relative overflow-hidden rounded-lg bg-black"
                  style={aspectStyle(s.aspect)}
                  title={`${s.prompt}\nクリックで追加`}
                >
                  <video
                    src={s.videoUrl}
                    poster={s.imageUrl}
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                    onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px]">{s.duration?.toFixed(1)}s</span>
                  <span className="absolute inset-0 hidden items-center justify-center bg-accent/40 text-lg font-bold group-hover:flex">＋</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ClipEditor({ clip, scene, onChange }: { clip: TimelineClip; scene: SceneView; onChange: (p: Partial<TimelineClip>) => void }) {
  const full = scene.duration ?? 5;
  const [start, setStart] = useState(clip.trimStart || 0);
  const [end, setEnd] = useState(clip.trimEnd || full);
  const commit = () => onChange({ trimStart: start, trimEnd: end >= full ? undefined : end });
  return (
    <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
      <video
        key={scene.videoUrl}
        src={`${scene.videoUrl}#t=${start},${end}`}
        controls
        className="w-full rounded-lg bg-black"
        style={aspectStyle(scene.aspect)}
      />
      <div className="space-y-3">
        <p className="text-xs text-white/50">{scene.prompt}</p>
        <Field label={`開始 ${start.toFixed(1)}s`}>
          <input
            type="range"
            min={0}
            max={full}
            step={0.1}
            value={start}
            onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.2))}
            onMouseUp={commit}
            onTouchEnd={commit}
            onKeyUp={commit}
            className="w-full"
          />
        </Field>
        <Field label={`終了 ${end.toFixed(1)}s（元の長さ ${full.toFixed(1)}s）`}>
          <input
            type="range"
            min={0}
            max={full}
            step={0.1}
            value={end}
            onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.2))}
            onMouseUp={commit}
            onTouchEnd={commit}
            onKeyUp={commit}
            className="w-full"
          />
        </Field>
        <p className="text-xs text-white/40">使用する長さ: {(end - start).toFixed(1)}s</p>
      </div>
    </div>
  );
}
