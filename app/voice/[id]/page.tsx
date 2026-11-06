"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { api, aspectStyle, fmtSec, usePolled, type NarrationView, type ProjectView } from "@/lib/client";
import { PX_PER_SEC, Ruler, TrackRow, VideoTrack, layout } from "@/components/Timeline";
import { VoicePicker } from "@/components/VoicePicker";
import { Button, Field, Panel, Spinner, inputCls } from "@/components/ui";

export default function VoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project, reload } = usePolled<ProjectView>(
    `/api/projects/${id}`,
    (p) => p.renderStatus === "pending" || p.narrations.some((n) => n.status === "pending"),
  );
  const [voice, setVoice] = useState<{ id: string; name: string } | null>(null);
  const [text, setText] = useState("");
  const [start, setStart] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());

  // プレビュー：結合動画の再生に合わせてナレーション音声を同期再生
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !project) return;
    const sync = () => {
      for (const n of project.narrations) {
        const a = audioRefs.current.get(n.id);
        if (!a || !n.duration) continue;
        const local = v.currentTime - n.start;
        const inside = preview && !v.paused && local >= 0 && local < n.duration;
        if (inside) {
          if (Math.abs(a.currentTime - local) > 0.3) a.currentTime = local;
          if (a.paused) void a.play().catch(() => undefined);
        } else if (!a.paused) a.pause();
      }
    };
    const evs = ["timeupdate", "play", "pause", "seeked"] as const;
    evs.forEach((e) => v.addEventListener(e, sync));
    return () => evs.forEach((e) => v.removeEventListener(e, sync));
  }, [project, preview]);

  if (!project) return <Spinner label="読み込み中…" />;

  const scenes = project.scenes ?? [];
  const items = layout(project.clips, scenes);
  const total = items.reduce((a, b) => a + b.duration, 0);
  const rendering = project.renderStatus === "pending";
  const sel = project.narrations.find((n) => n.id === selected);

  const add = async () => {
    if (!voice) return setMsg("ボイスを選択してください");
    setMsg(null);
    try {
      await api(`/api/projects/${id}/narrations`, {
        method: "POST",
        json: { text, voiceId: voice.id, voiceName: voice.name, start },
      });
      setText("");
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const patchN = async (nid: string, body: object) => {
    await api(`/api/projects/${id}/narrations/${nid}`, { method: "PATCH", json: body });
    await reload();
  };
  const removeN = async (nid: string) => {
    await api(`/api/projects/${id}/narrations/${nid}`, { method: "DELETE" });
    setSelected(null);
    await reload();
  };
  const saveProject = async (body: object) => {
    await api(`/api/projects/${id}`, { method: "PATCH", json: body });
    await reload();
  };
  const render = async (target: "base" | "final") => {
    try {
      await api(`/api/projects/${id}/render`, { method: "POST", json: { target } });
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const nextStart = () => {
    const last = [...project.narrations].sort((a, b) => a.start + (a.duration ?? 0) - (b.start + (b.duration ?? 0))).pop();
    return last ? Math.round((last.start + (last.duration ?? 0) + 0.3) * 10) / 10 : 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/voice" className="text-sm text-white/50 hover:text-white">
          ← 一覧
        </Link>
        <h1 className="text-xl font-bold">④ ナレーション: {project.name}</h1>
        <Link href={`/editor/${id}`} className="text-sm text-accent hover:underline">
          ③ タイムラインを編集
        </Link>
        <div className="ml-auto flex gap-2">
          <Button disabled={rendering || !project.clips.length} onClick={() => render("base")}>
            結合動画を更新
          </Button>
          <Button variant="primary" disabled={rendering || !project.clips.length} onClick={() => render("final")}>
            {rendering && project.renderTarget === "final" ? "書き出し中…" : "ナレーション付きで書き出す"}
          </Button>
        </div>
      </div>
      {msg && <p className="text-sm text-red-300">{msg}</p>}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Panel
            title="プレビュー"
            actions={
              <label className="flex items-center gap-1 text-xs text-white/60">
                <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
                ナレーションを重ねて試聴
              </label>
            }
          >
            {rendering ? (
              <div className="py-10">
                <Spinner label="書き出し中…" />
              </div>
            ) : project.renderStatus === "error" ? (
              <p className="text-sm text-red-300">{project.renderError}</p>
            ) : project.baseVideoUrl ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-white/50">結合動画（環境音）＋ ナレーション試聴</p>
                  <video ref={videoRef} src={project.baseVideoUrl} controls className="max-h-[60vh] w-full bg-black" style={aspectStyle(project.aspect)} />
                  <Button variant="ghost" className="text-xs" onClick={() => setStart(Math.round((videoRef.current?.currentTime ?? 0) * 10) / 10)}>
                    現在の再生位置を開始位置にする
                  </Button>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-white/50">書き出し結果</p>
                  {project.finalVideoUrl ? (
                    <>
                      <video src={project.finalVideoUrl} controls className="max-h-[60vh] w-full bg-black" style={aspectStyle(project.aspect)} />
                      <a href={`${project.finalVideoUrl}?download`} className="text-sm text-accent hover:underline">
                        ダウンロード
                      </a>
                    </>
                  ) : (
                    <p className="text-sm text-white/40">「ナレーション付きで書き出す」を押すと表示されます</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-white/50">
                <p>まだ結合動画がありません。</p>
                <Button variant="primary" disabled={!project.clips.length} onClick={() => render("base")}>
                  結合動画を作成
                </Button>
              </div>
            )}
            {project.narrations.map(
              (n) =>
                n.audioUrl && (
                  <audio
                    key={n.id + n.audioUrl}
                    src={n.audioUrl}
                    preload="auto"
                    ref={(el) => {
                      if (el) {
                        el.volume = Math.min(1, project.narrationVolume);
                        audioRefs.current.set(n.id, el);
                      } else audioRefs.current.delete(n.id);
                    }}
                  />
                ),
            )}
          </Panel>

          <Panel title="タイムライン">
            <div className="overflow-x-auto pb-2">
              <div className="space-y-1" style={{ minWidth: total * PX_PER_SEC + 80 }}>
                <TrackRow label="">
                  <Ruler total={total} />
                </TrackRow>
                <TrackRow label="映像">
                  <VideoTrack items={items} />
                </TrackRow>
                <TrackRow label="ナレーション">
                  <div className="relative h-12" style={{ width: Math.max(total, 1) * PX_PER_SEC }}>
                    {project.narrations.map((n) => (
                      <NarrationBlock key={n.id} n={n} total={total} active={n.id === selected} onClick={() => setSelected(n.id)} />
                    ))}
                  </div>
                </TrackRow>
              </div>
            </div>
          </Panel>

          {sel && <NarrationEditor key={sel.id} n={sel} total={total} onSave={(b) => patchN(sel.id, b)} onDelete={() => removeN(sel.id)} />}
        </div>

        <div className="space-y-4">
          <Panel title="1. ボイスを選ぶ（Fish Audio）">
            <VoicePicker value={voice?.id} onChange={setVoice} />
            {voice && <p className="mt-2 text-xs text-accent">選択中: {voice.name}</p>}
          </Panel>
          <Panel title="2. 原稿を追加">
            <div className="space-y-3">
              <Field label="ナレーション原稿">
                <textarea
                  className={`${inputCls} h-28`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="朝のスキンケアに、ひとしずく。"
                />
              </Field>
              <div className="flex items-end gap-2">
                <Field label="開始位置（秒）">
                  <input type="number" min={0} step={0.1} className={inputCls} value={start} onChange={(e) => setStart(Number(e.target.value))} />
                </Field>
                <Button variant="ghost" className="mb-0.5 shrink-0 text-xs" onClick={() => setStart(nextStart())}>
                  前の直後
                </Button>
              </div>
              <Button variant="primary" className="w-full" disabled={!text.trim() || !voice} onClick={add}>
                音声を生成して追加
              </Button>
            </div>
          </Panel>
          <Panel title="3. 音量バランス">
            <div className="space-y-3">
              <Field label={`環境音 ${Math.round(project.ambientVolume * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  defaultValue={project.ambientVolume}
                  onMouseUp={(e) => saveProject({ ambientVolume: Number(e.currentTarget.value) })}
                  onTouchEnd={(e) => saveProject({ ambientVolume: Number(e.currentTarget.value) })}
                  className="w-full"
                />
              </Field>
              <Field label={`ナレーション ${Math.round(project.narrationVolume * 100)}%`}>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  defaultValue={project.narrationVolume}
                  onMouseUp={(e) => saveProject({ narrationVolume: Number(e.currentTarget.value) })}
                  onTouchEnd={(e) => saveProject({ narrationVolume: Number(e.currentTarget.value) })}
                  className="w-full"
                />
              </Field>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function NarrationBlock({ n, total, active, onClick }: { n: NarrationView; total: number; active: boolean; onClick: () => void }) {
  const width = Math.max(0.5, n.duration ?? 2) * PX_PER_SEC;
  const over = n.start + (n.duration ?? 0) > total + 0.05;
  return (
    <button
      onClick={onClick}
      className={`absolute top-1 h-10 overflow-hidden rounded-md border px-1.5 text-left text-[11px] ${
        active ? "border-accent bg-accent/40" : n.status === "error" ? "border-red-400 bg-red-500/20" : "border-line bg-accent/20"
      }`}
      style={{ left: n.start * PX_PER_SEC, width }}
      title={n.text}
    >
      <div className="truncate font-medium">{n.status === "pending" ? "生成中…" : n.voiceName}</div>
      <div className={`truncate ${over ? "text-amber-300" : "text-white/60"}`}>{n.text}</div>
    </button>
  );
}

function NarrationEditor({
  n,
  total,
  onSave,
  onDelete,
}: {
  n: NarrationView;
  total: number;
  onSave: (b: object) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(n.text);
  const [start, setStart] = useState(n.start);
  const end = start + (n.duration ?? 0);
  return (
    <Panel
      title={`ナレーションを編集（${n.voiceName}）`}
      actions={
        <Button variant="danger" className="text-xs" onClick={onDelete}>
          削除
        </Button>
      }
    >
      <div className="space-y-3">
        {n.status === "error" && <p className="text-xs text-red-300">{n.error}</p>}
        <Field label="原稿（変更すると再生成）">
          <textarea className={`${inputCls} h-20`} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field label={`開始位置 ${fmtSec(start)} 〜 ${fmtSec(end)}`} hint={end > total ? "動画の長さを超えた部分はカットされます" : undefined}>
          <input type="range" min={0} max={Math.max(total, 1)} step={0.1} value={start} onChange={(e) => setStart(Number(e.target.value))} className="w-full" />
        </Field>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => onSave({ text, start })}>
            保存
          </Button>
          {n.audioUrl && (
            <Button onClick={() => void new Audio(n.audioUrl).play()}>
              ▶ 試聴
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
