"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  aspectStyle,
  hasAnyAiKey,
  pickDefault,
  useModels,
  usePolled,
  type CharacterView,
  type ProjectView,
  type SceneView,
} from "@/lib/client";
import { AspectSelect } from "@/components/AspectSelect";
import { TagEditor, TagFilter, collectTags } from "@/components/Tags";
import { Badge, Button, Empty, Field, KeyWarning, Panel, Select, Spinner, inputCls } from "@/components/ui";

export default function ScenesPage() {
  const router = useRouter();
  const models = useModels();
  const { data: characters } = usePolled<CharacterView[]>("/api/characters", () => false);
  const { data, reload } = usePolled<SceneView[]>("/api/scenes", (d) =>
    d.some((s) => s.imageStatus === "pending" || s.videoStatus === "pending"),
  );
  const { data: projects } = usePolled<ProjectView[]>("/api/projects", () => false);

  // 生成フォーム
  const [charIds, setCharIds] = useState<string[]>([]);
  const [prompts, setPrompts] = useState("");
  const [perPrompt, setPerPrompt] = useState(2);
  const [imageModel, setImageModel] = useState("google-nano-banana");
  const [aspect, setAspect] = useState("9:16");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 絞り込み・選択
  const [filter, setFilter] = useState<string[]>([]);
  const [videoOnly, setVideoOnly] = useState(false);
  const [charFilter, setCharFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  // 動画化
  const [videoModel, setVideoModel] = useState("google-veo-3.1-fast");
  const [motion, setMotion] = useState("");
  const [duration, setDuration] = useState(5);
  const [projectId, setProjectId] = useState("");

  // 設定済みの API キーに合わせて既定モデルを選ぶ（Google → fal.ai → モック）
  useEffect(() => {
    if (!models) return;
    setImageModel((cur) => pickDefault(models.imageModels, cur));
    setVideoModel((cur) => pickDefault(models.videoModels, cur));
  }, [models]);

  const vm = models?.videoModels.find((m) => m.id === videoModel);
  useEffect(() => {
    if (vm && !vm.durations.includes(duration)) setDuration(vm.durations[0]);
  }, [vm, duration]);

  const scenes = data ?? [];
  const readyChars = (characters ?? []).filter((c) => c.status === "ready");
  const readyPeople = readyChars.filter((c) => (c.kind ?? "character") === "character");
  const readyItems = readyChars.filter((c) => c.kind === "item");
  const allTags = useMemo(() => collectTags(scenes), [scenes]);
  const shown = scenes.filter(
    (s) =>
      filter.every((t) => s.tags.includes(t)) &&
      (!videoOnly || s.videoStatus === "ready") &&
      (!charFilter || s.characterIds.includes(charFilter)),
  );
  const selectedScenes = scenes.filter((s) => selected.includes(s.id));
  const charName = (id: string) => characters?.find((c) => c.id === id)?.name;

  const generate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/scenes", {
        method: "POST",
        json: {
          characterIds: charIds,
          prompts: prompts.split("\n"),
          countPerPrompt: perPrompt,
          imageModel,
          aspect,
          tags: newTags,
        },
      });
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toVideo = async () => {
    try {
      const r = await api<{ started: string[] }>("/api/scenes/video", {
        method: "POST",
        json: { sceneIds: selected, videoModel, motionPrompt: motion, duration },
      });
      setMsg(`${r.started.length} 件の動画生成を開始しました`);
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const addTagToSelected = async (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    await Promise.all(
      selectedScenes.map((s) =>
        api(`/api/scenes/${s.id}`, { method: "PATCH", json: { tags: [...new Set([...s.tags, t])] } }),
      ),
    );
    await reload();
  };

  const sendToProject = async () => {
    const ids = selectedScenes.filter((s) => s.videoStatus === "ready").map((s) => s.id);
    if (!ids.length) return setMsg("動画が完成しているシーンを選択してください");
    if (projectId) {
      await api(`/api/projects/${projectId}`, { method: "PATCH", json: { addSceneIds: ids } });
      router.push(`/editor/${projectId}`);
    } else {
      const p = await api<ProjectView>("/api/projects", { method: "POST", json: { sceneIds: ids, aspect } });
      router.push(`/editor/${p.id}`);
    }
  };

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <h1 className="text-xl font-bold">② シーン素材の量産</h1>
        <KeyWarning show={!hasAnyAiKey(models)}>
          GEMINI_API_KEY（Google）も FAL_KEY も未設定のため、モックモデルで動作します。
        </KeyWarning>
        <KeyWarning show={!!vm && vm.provider === "google" && aspect !== "9:16" && aspect !== "16:9"}>
          Veo は 9:16 / 16:9 で生成します。{aspect} にするには ③ の書き出し時に切り抜き / 余白で調整されます。
        </KeyWarning>
        <Panel title="シーン画像を生成">
          <div className="space-y-3">
            <Field label="人物" hint="複数選択可。顔・髪型・体型をそろえて生成します">
              <AssetPicker
                assets={readyPeople}
                selected={charIds}
                onChange={setCharIds}
                empty="① で人物を登録してください"
              />
            </Field>
            <Field label="商品・小物（任意）" hint="パッケージのロゴ・色・文字をそのまま再現するよう指示します">
              <AssetPicker
                assets={readyItems}
                selected={charIds}
                onChange={setCharIds}
                empty="① で種類「商品・小物」として登録すると選べます"
              />
            </Field>
            {charIds.length > 3 && (
              <p className="text-[11px] text-amber-300">参照画像が多いと再現度が下がることがあります（目安: 合計 3 枚まで）</p>
            )}
            <Field label="シーンのプロンプト（1行 = 1シーン）">
              <textarea
                className={`${inputCls} h-32`}
                value={prompts}
                onChange={(e) => setPrompts(e.target.value)}
                placeholder={"香水のボトルを両手で持って微笑む、明るい部屋\nリップを指で塗る口元のクローズアップ\n夜の駐車場で赤いスポーツカーにもたれる"}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="1プロンプトあたり">
                <Select value={perPrompt} onChange={(e) => setPerPrompt(Number(e.target.value))}>
                  {[1, 2, 3, 4, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} 枚
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="画像モデル">
                <Select value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
                  {models?.imageModels.map((m) => (
                    <option key={m.id} value={m.id} disabled={!m.available}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {models && (
              <Field label="サイズ">
                <AspectSelect aspects={models.aspects} value={aspect} onChange={setAspect} />
              </Field>
            )}
            <Field label="付与するタグ">
              <TagEditor tags={newTags} onChange={setNewTags} suggestions={allTags} />
            </Field>
            <Button variant="primary" className="w-full py-2" disabled={busy || !prompts.trim()} onClick={generate}>
              シーン画像を生成（{prompts.split("\n").filter((p) => p.trim()).length * perPrompt} 枚）
            </Button>
          </div>
        </Panel>

        <Panel title={`選択中のシーン（${selected.length}）`}>
          <div className="space-y-3">
            <Field label="動画モデル" hint={vm && !vm.nativeAudio ? "生成後に MMAudio で環境音を自動付与します" : "モデルが環境音を生成します"}>
              <Select value={videoModel} onChange={(e) => setVideoModel(e.target.value)}>
                {models?.videoModels.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.available}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field label="動き（任意）">
                <input className={inputCls} value={motion} onChange={(e) => setMotion(e.target.value)} placeholder="ゆっくりカメラに近づく、髪が風になびく" />
              </Field>
              <Field label="秒数">
                <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {vm?.durations.map((d) => (
                    <option key={d} value={d}>
                      {d}s
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button className="w-full" disabled={!selected.length} onClick={toVideo}>
              選択したシーンを動画化
            </Button>
            <div className="flex gap-2">
              <input
                className={`${inputCls} py-1 text-xs`}
                placeholder="選択中にタグを一括追加して Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    void addTagToSelected(e.currentTarget.value);
                    e.currentTarget.value = "";
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <Select className="py-1 text-xs" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">新しいプロジェクト</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Button variant="primary" className="shrink-0 text-xs" disabled={!selected.length} onClick={sendToProject}>
                ③ 結合へ送る
              </Button>
            </div>
            {msg && <p className="text-xs text-white/60">{msg}</p>}
          </div>
        </Panel>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-white/80">ストレージ（{shown.length}）</h2>
          <label className="flex items-center gap-1 text-xs text-white/70">
            <input type="checkbox" checked={videoOnly} onChange={(e) => setVideoOnly(e.target.checked)} />
            動画のみ
          </label>
          <Select className="!w-auto py-1 text-xs" value={charFilter} onChange={(e) => setCharFilter(e.target.value)}>
            <option value="">全人物・商品</option>
            {readyChars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button variant="ghost" className="text-xs" onClick={() => setSelected(shown.map((s) => s.id))}>
            表示中を全選択
          </Button>
          {selected.length > 0 && (
            <Button variant="ghost" className="text-xs" onClick={() => setSelected([])}>
              選択解除
            </Button>
          )}
        </div>
        <TagFilter all={allTags} selected={filter} onChange={setFilter} />
        {shown.length === 0 ? (
          <Empty>シーンがありません</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {shown.map((s) => (
              <SceneCard
                key={s.id}
                s={s}
                selected={selected.includes(s.id)}
                onToggle={() => toggle(s.id)}
                charNames={s.characterIds.map(charName).filter(Boolean) as string[]}
                allTags={allTags}
                onChanged={reload}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** ① で登録した人物・商品をサムネイルで選ぶ */
function AssetPicker({
  assets,
  selected,
  onChange,
  empty,
}: {
  assets: CharacterView[];
  selected: string[];
  onChange: (ids: string[]) => void;
  empty: string;
}) {
  if (assets.length === 0) return <p className="text-xs text-white/40">{empty}</p>;
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {assets.map((c) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
            className={`relative overflow-hidden rounded-md border-2 ${on ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"}`}
            title={c.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.imageUrl} alt={c.name} className="aspect-[3/4] w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 text-[9px]">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function SceneCard({
  s,
  selected,
  onToggle,
  charNames,
  allTags,
  onChanged,
}: {
  s: SceneView;
  selected: boolean;
  onToggle: () => void;
  charNames: string[];
  allTags: string[];
  onChanged: () => void;
}) {
  const patch = async (body: object) => {
    await api(`/api/scenes/${s.id}`, { method: "PATCH", json: body });
    onChanged();
  };
  const remove = async () => {
    if (!confirm("このシーンを削除しますか？（画像・動画も削除されます）")) return;
    await api(`/api/scenes/${s.id}`, { method: "DELETE" });
    onChanged();
  };

  return (
    <div className={`group overflow-hidden rounded-xl border bg-panel ${selected ? "border-accent ring-2 ring-accent/40" : "border-line"}`}>
      <div className="relative cursor-pointer bg-black" style={aspectStyle(s.aspect)} onClick={onToggle}>
        {s.imageStatus === "pending" ? (
          <div className="flex h-full items-center justify-center">
            <Spinner label="画像生成中…" />
          </div>
        ) : s.imageStatus === "error" ? (
          <div className="flex h-full items-center justify-center p-3 text-center text-[11px] text-red-300">{s.imageError}</div>
        ) : s.videoUrl ? (
          <video
            src={s.videoUrl}
            poster={s.imageUrl}
            loop
            playsInline
            muted
            className="h-full w-full object-cover"
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.imageUrl} alt={s.prompt} className="h-full w-full object-cover" />
        )}
        {s.videoStatus === "pending" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Spinner label="動画生成中…" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <input type="checkbox" checked={selected} readOnly className="accent-[#7c5cff]" />
          {s.videoStatus === "ready" && <Badge tone="accent">▶ {s.duration?.toFixed(1)}s{s.hasAudio ? " ♪" : ""}</Badge>}
          {charNames.map((n) => (
            <Badge key={n}>{n}</Badge>
          ))}
        </div>
        <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex" onClick={(e) => e.stopPropagation()}>
          {s.imageStatus !== "pending" && (
            <button className="rounded-md bg-black/70 px-1.5 text-xs" onClick={() => patch({ regenerateImage: true })} title="画像を再生成">
              ↻
            </button>
          )}
          <button className="rounded-md bg-black/70 px-1.5 text-xs hover:text-red-300" onClick={remove}>
            削除
          </button>
        </div>
      </div>
      <div className="space-y-1.5 p-2">
        <p className="line-clamp-2 text-[11px] text-white/50" title={s.prompt}>
          {s.prompt}
        </p>
        {s.videoStatus === "error" && <p className="text-[11px] text-red-300">動画: {s.videoError}</p>}
        <TagEditor tags={s.tags} suggestions={allTags} onChange={(t) => patch({ tags: t })} />
      </div>
    </div>
  );
}
