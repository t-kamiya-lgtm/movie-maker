"use client";

import { useEffect, useMemo, useState } from "react";
import {
  api,
  aspectStyle,
  hasAnyAiKey,
  pickDefault,
  scrollToOnNarrow,
  useModels,
  usePolled,
  type CharacterView,
  type ProfileView,
} from "@/lib/client";
import { PROFILE_FIELDS, attributeList } from "@/lib/profile";
import { AspectSelect } from "@/components/AspectSelect";
import { TagEditor, TagFilter, collectTags } from "@/components/Tags";
import { Badge, Button, Empty, Field, KeyWarning, Panel, Select, Spinner, inputCls } from "@/components/ui";
import type { AssetKind } from "@/lib/types";

const KIND_LABEL: Record<AssetKind, string> = { character: "人物", item: "商品・小物" };

export default function CharactersPage() {
  const models = useModels();
  const { data, reload, error } = usePolled<CharacterView[]>("/api/characters", (d) => d.some((c) => c.status === "pending"));
  const { data: profileData, reload: reloadProfiles } = usePolled<ProfileView[]>("/api/profiles", () => false);
  // 画像の状態が変わったら（生成完了・削除など）プロフィールも取り直す（基準画像の更新のため）
  const charSignature = (data ?? []).map((c) => `${c.id}:${c.status}:${c.name}`).join(",");
  useEffect(() => {
    void reloadProfiles();
  }, [charSignature, reloadProfiles]);
  const profiles = profileData ?? [];

  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [kind, setKind] = useState<AssetKind>("character");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [useAnchor, setUseAnchor] = useState(true);

  // 過去の名前を入力・選択したら、その人物のプロンプトとパーソナルデータを入力欄に読み込む
  const profile = profiles.find((p) => p.name === name.trim());
  useEffect(() => {
    if (!profile) return;
    setPrompt(profile.prompt);
    setAttrs(profile.attributes ?? {});
    setKind(profile.kind);
    setUseAnchor(true);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [model, setModel] = useState("google-nano-banana");
  const [aspect, setAspect] = useState("9:16");
  useEffect(() => {
    if (models) setModel((cur) => pickDefault(models.imageModels, cur));
  }, [models]);
  const [count, setCount] = useState(2);
  const [tags, setTags] = useState<string[]>([]);
  const [refs, setRefs] = useState<FileList | null>(null);
  const [upload, setUpload] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [filter, setFilter] = useState<string[]>([]);
  const [nameFilter, setNameFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<AssetKind | "">("");

  const characters = data ?? [];
  const allTags = useMemo(() => collectTags(characters), [characters]);
  const names = useMemo(() => [...new Set(characters.map((c) => c.name))], [characters]);
  const shown = characters.filter(
    (c) =>
      filter.every((t) => c.tags.includes(t)) &&
      (!nameFilter || c.name === nameFilter) &&
      (!kindFilter || (c.kind ?? "character") === kindFilter),
  );

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("mode", mode);
      fd.set("kind", kind);
      fd.set("name", name);
      fd.set("tags", tags.join(","));
      fd.set("aspect", aspect);
      fd.set("attributes", JSON.stringify(attrs));
      if (mode === "upload") {
        if (upload) fd.set("file", upload);
      } else {
        fd.set("prompt", prompt);
        fd.set("model", model);
        fd.set("count", String(count));
        fd.set("useAnchor", useAnchor ? "1" : "0");
        for (const f of Array.from(refs ?? [])) fd.append("references", f);
      }
      await api("/api/characters", { method: "POST", body: fd });
      await reload();
      await reloadProfiles();
      scrollToOnNarrow("character-results");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: object) => {
    await api(`/api/characters/${id}`, { method: "PATCH", json: body });
    await reload();
  };
  const remove = async (id: string) => {
    if (!confirm("このキャラクター画像を削除しますか？")) return;
    await api(`/api/characters/${id}`, { method: "DELETE" });
    await reload();
  };
  const regenerate = async (id: string, newPrompt: string) => {
    try {
      await api(`/api/characters/${id}/regenerate`, { method: "POST", json: { prompt: newPrompt } });
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const setAnchor = async (c: CharacterView) => {
    const p = profiles.find((x) => x.name === c.name);
    if (!p) return;
    await api(`/api/profiles/${p.id}`, { method: "PATCH", json: { anchorId: c.id } });
    await reloadProfiles();
  };
  const anchorIds = new Set(profiles.map((p) => p.anchorId).filter(Boolean));
  const isExisting = !!profile;
  const showPersonal = (profile?.kind ?? kind) === "character";

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <h1 className="text-xl font-bold">① キャラクター・商品</h1>
        <KeyWarning show={!hasAnyAiKey(models)}>
          GEMINI_API_KEY（Google）も FAL_KEY も未設定です。「モック」モデルのみ利用できます。
        </KeyWarning>
        <Panel>
          <div className="mb-3 flex gap-1 rounded-lg bg-black/40 p-1 text-sm">
            {(["generate", "upload"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-1.5 ${mode === m ? "bg-white/10 text-white" : "text-white/50"}`}
              >
                {m === "generate" ? "AIで生成" : "画像をアップロード"}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {profiles.length > 0 && (
              <Field label="過去の人物・商品から選ぶ">
                <Select value={profile?.id ?? ""} onChange={(e) => setName(profiles.find((p) => p.id === e.target.value)?.name ?? "")}>
                  <option value="">（新しく作る）</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{KIND_LABEL[p.kind]}・{p.imageCount}枚）
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="種類" hint={kind === "item" ? "商品パッケージ・料理・小物など。② でロゴや色をそのまま再現するよう AI に指示します" : "② で顔や髪型をそろえるよう AI に指示します"}>
              <div className="flex gap-1.5">
                {(["character", "item"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={isExisting}
                    onClick={() => setKind(k)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-sm disabled:cursor-not-allowed ${kind === k ? "border-accent bg-accent/15 text-white" : "border-line text-white/60 disabled:opacity-40"}`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={kind === "item" ? "商品名・小物名（フラグ）" : "キャラクター名（フラグ）"}>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "item" ? "例: プロテインモンスター" : "例: ユイ"} list="char-names" />
              <datalist id="char-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
            </Field>

            {name.trim() &&
              (profile ? (
                <div className="flex gap-3 rounded-lg border border-accent/40 bg-accent/10 p-2.5">
                  {profile.anchorUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.anchorUrl} alt="" className="h-20 w-14 shrink-0 rounded object-cover" />
                  )}
                  <div className="space-y-1.5 text-xs">
                    <p className="font-medium text-white">既存の{KIND_LABEL[profile.kind]}「{profile.name}」として生成します</p>
                    {profile.anchorUrl ? (
                      <label className="flex items-start gap-1.5 text-white/70">
                        <input type="checkbox" className="mt-0.5" checked={useAnchor} onChange={(e) => setUseAnchor(e.target.checked)} />
                        <span>左の基準画像を見本にして、同じ{profile.kind === "item" ? "商品" : "顔"}で生成する</span>
                      </label>
                    ) : (
                      <p className="text-white/60">まだ完成した画像がないため、見本なし（バストアップ）で生成します</p>
                    )}
                    <p className="text-white/40">基準画像は、一覧のカードの「★」で変更できます</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-line bg-white/5 p-2.5 text-xs text-white/70">
                  新しい{KIND_LABEL[kind]}として登録します。
                  {kind === "character" && mode === "generate" && (
                    <>
                      <br />
                      顔を確認しやすい<b className="text-white">バストアップ</b>で生成し、その画像を今後の「顔の基準」にします。
                    </>
                  )}
                </div>
              ))}

            {showPersonal && (
              <details className="rounded-lg border border-line p-2.5" open={isExisting || Object.keys(attrs).length > 0}>
                <summary className="cursor-pointer text-xs font-medium text-white/70">
                  パーソナルデータ（{Object.values(attrs).filter(Boolean).length}/{PROFILE_FIELDS.length} 項目）
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {PROFILE_FIELDS.map((f) => (
                    <label key={f.key} className={`block space-y-0.5 ${f.key === "notes" ? "col-span-2" : ""}`}>
                      <span className="text-[11px] text-white/50">{f.label}</span>
                      <input
                        className={`${inputCls} py-1 text-xs`}
                        value={attrs[f.key] ?? ""}
                        placeholder={f.placeholder}
                        onChange={(e) => setAttrs({ ...attrs, [f.key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-white/40">
                  見た目の項目は画像に反映し、性格・趣味などは雰囲気づけに使います。生成すると、この人物のプロフィールとして保存されます。
                </p>
              </details>
            )}
            {mode === "generate" ? (
              <>
                <Field label="プロンプト" hint="人物の特徴・服装・背景・撮影スタイルなどを具体的に">
                  <textarea
                    className={`${inputCls} h-28`}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="20代の日本人女性、黒髪ロング、白いTシャツ、自然光の室内、iPhoneで撮ったようなリアルな自撮り写真"
                  />
                </Field>
                <Field label="画像モデル">
                  <Select value={model} onChange={(e) => setModel(e.target.value)}>
                    {models?.imageModels.map((m) => (
                      <option key={m.id} value={m.id} disabled={!m.available}>
                        {m.label}
                        {m.note ? ` - ${m.note}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="参照画像（任意）" hint="既存の人物写真を参考に生成（参照対応モデルのみ）">
                  <input type="file" accept="image/*" multiple onChange={(e) => setRefs(e.target.files)} className="text-xs" />
                </Field>
                <Field label={`生成枚数: ${count}`}>
                  <input type="range" min={1} max={8} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
                </Field>
              </>
            ) : (
              <Field label="画像ファイル">
                <input type="file" accept="image/*" onChange={(e) => setUpload(e.target.files?.[0] ?? null)} className="text-xs" />
              </Field>
            )}
            {models && (
              <Field label="サイズ">
                <AspectSelect aspects={models.aspects} value={aspect} onChange={setAspect} />
              </Field>
            )}
            <Field label="タグ">
              <TagEditor tags={tags} onChange={setTags} suggestions={allTags} />
            </Field>
            {msg && <p className="text-xs text-red-300">{msg}</p>}
            <Button variant="primary" className="w-full py-2" disabled={busy || !name} onClick={submit}>
              {mode === "generate" ? "生成する" : "登録する"}
            </Button>
          </div>
        </Panel>
      </div>

      <div id="character-results" className="scroll-mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-white/80">ストレージ（{shown.length}）</h2>
          <Select className="!w-auto py-1 text-xs" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as AssetKind | "")}>
            <option value="">人物＋商品</option>
            <option value="character">人物のみ</option>
            <option value="item">商品・小物のみ</option>
          </Select>
          <Select className="!w-auto py-1 text-xs" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)}>
            <option value="">すべての名前</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <TagFilter all={allTags} selected={filter} onChange={setFilter} />
        </div>
        {error && <p className="text-xs text-red-300">{error}</p>}
        {shown.length === 0 ? (
          <Empty>まだ登録がありません</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {shown.map((c) => (
              <CharacterCard
                key={c.id}
                c={c}
                tags={allTags}
                isAnchor={anchorIds.has(c.id)}
                profileAttrs={profiles.find((p) => p.name === c.name)?.attributes}
                onPatch={(b) => patch(c.id, b)}
                onDelete={() => remove(c.id)}
                onRegenerate={(p) => regenerate(c.id, p)}
                onSetAnchor={() => setAnchor(c)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterCard({
  c,
  tags,
  isAnchor,
  profileAttrs,
  onPatch,
  onDelete,
  onRegenerate,
  onSetAnchor,
}: {
  c: CharacterView;
  tags: string[];
  isAnchor: boolean;
  profileAttrs?: Record<string, string>;
  onPatch: (b: object) => void;
  onDelete: () => void;
  onRegenerate: (prompt: string) => void;
  onSetAnchor: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [showInfo, setShowInfo] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState(c.prompt);
  const info = attributeList(c.attributes ?? profileAttrs);
  const canRegenerate = c.model !== "upload" && c.status !== "pending";
  const ready = c.status === "ready" && !!c.imageUrl;

  return (
    <div className={`group overflow-hidden rounded-xl border bg-panel ${isAnchor ? "border-amber-400/70" : "border-line"}`}>
      <div className="relative bg-black" style={aspectStyle(c.aspect)}>
        {ready ? (
          // タップでパーソナルデータの表示を切り替え（マウスではホバーで表示）
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.imageUrl} alt={c.name} className="h-full w-full cursor-pointer object-cover" onClick={() => setShowInfo((v) => !v)} />
        ) : c.status === "pending" ? (
          <div className="flex h-full items-center justify-center">
            <Spinner label="生成中…" />
          </div>
        ) : (
          <div className="h-full overflow-y-auto whitespace-pre-wrap break-words p-3 pt-9 text-[11px] leading-relaxed text-red-300">
            {c.error}
          </div>
        )}

        {/* パーソナルデータと生成時のプロンプト */}
        {ready && (
          <div
            onClick={() => setShowInfo(false)}
            className={`absolute inset-0 overflow-y-auto bg-black/80 p-3 pt-10 text-[11px] leading-relaxed transition-opacity ${
              showInfo
                ? "opacity-100"
                : "pointer-events-none opacity-0 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100"
            }`}
          >
            {info.length > 0 ? (
              <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                {info.map((a) => (
                  <div key={a.label} className="contents">
                    <dt className="text-white/50">{a.label}</dt>
                    <dd className="text-white">{a.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mb-2 text-white/50">パーソナルデータ未登録</p>
            )}
            {c.prompt && c.prompt !== "(アップロード)" && (
              <p className="whitespace-pre-wrap text-white/60">
                <span className="text-white/40">プロンプト: </span>
                {c.prompt}
              </p>
            )}
            <p className="mt-1 text-white/40">
              {c.model === "upload" ? "アップロード画像" : c.framing === "bust" ? "バストアップ（顔の確認用）" : c.refCharacterId ? "基準画像を見本に生成" : ""}
            </p>
          </div>
        )}

        <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-7rem)] flex-wrap gap-1">
          <Badge tone="accent">{c.name}</Badge>
          {isAnchor && <Badge tone="warn">★基準</Badge>}
          {c.kind === "item" && <Badge tone="warn">商品</Badge>}
        </div>
        <div className="absolute right-2 top-2 z-10 hidden gap-1 group-hover:flex [@media(hover:none)]:flex">
          {ready && !isAnchor && (
            <button onClick={onSetAnchor} className="rounded-md bg-black/70 px-2 py-1 text-xs text-amber-300" title="この画像を顔の基準にする">
              ★
            </button>
          )}
          {canRegenerate && (
            <button onClick={() => setRegenOpen((v) => !v)} className="rounded-md bg-black/70 px-2 py-1 text-xs" title="再生成">
              ↻
            </button>
          )}
          <button onClick={onDelete} className="rounded-md bg-black/70 px-2 py-1 text-xs text-white/80 hover:text-red-300">
            削除
          </button>
        </div>
      </div>
      <div className="space-y-2 p-2">
        {regenOpen && (
          <div className="space-y-1.5 rounded-lg border border-accent/40 bg-accent/10 p-2">
            <p className="text-[11px] text-white/70">プロンプトを確認・修正して再生成（元の画像は残ります）</p>
            <textarea className={`${inputCls} h-24 text-xs`} value={regenPrompt} onChange={(e) => setRegenPrompt(e.target.value)} />
            <div className="flex gap-1.5">
              <Button
                variant="primary"
                className="flex-1 text-xs"
                disabled={!regenPrompt.trim()}
                onClick={() => {
                  onRegenerate(regenPrompt);
                  setRegenOpen(false);
                }}
              >
                ↻ 再生成する
              </Button>
              <Button variant="ghost" className="text-xs" onClick={() => setRegenOpen(false)}>
                閉じる
              </Button>
            </div>
          </div>
        )}
        {editing ? (
          <div className="flex gap-1">
            <input className={`${inputCls} py-1 text-xs`} value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              className="text-xs"
              onClick={() => {
                onPatch({ name });
                setEditing(false);
              }}
            >
              保存
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setEditing(true)} className="text-xs text-white/50 hover:text-white">
              名前を変更
            </button>
            <select
              value={c.kind ?? "character"}
              onChange={(e) => onPatch({ kind: e.target.value })}
              className="rounded border border-line bg-black/40 px-1 text-[11px] text-white/70"
              title="種類を変更"
            >
              <option value="character">{KIND_LABEL.character}</option>
              <option value="item">{KIND_LABEL.item}</option>
            </select>
          </div>
        )}
        <TagEditor tags={c.tags} suggestions={tags} onChange={(t) => onPatch({ tags: t })} />
      </div>
    </div>
  );
}
