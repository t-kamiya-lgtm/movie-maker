"use client";

import { useEffect, useMemo, useState } from "react";
import { api, aspectStyle, hasAnyAiKey, pickDefault, useModels, usePolled, type CharacterView } from "@/lib/client";
import { AspectSelect } from "@/components/AspectSelect";
import { TagEditor, TagFilter, collectTags } from "@/components/Tags";
import { Badge, Button, Empty, Field, KeyWarning, Panel, Select, Spinner, inputCls } from "@/components/ui";
import type { AssetKind } from "@/lib/types";

const KIND_LABEL: Record<AssetKind, string> = { character: "人物", item: "商品・小物" };

export default function CharactersPage() {
  const models = useModels();
  const { data, reload, error } = usePolled<CharacterView[]>("/api/characters", (d) => d.some((c) => c.status === "pending"));
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [kind, setKind] = useState<AssetKind>("character");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
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
      if (mode === "upload") {
        if (upload) fd.set("file", upload);
      } else {
        fd.set("prompt", prompt);
        fd.set("model", model);
        fd.set("count", String(count));
        for (const f of Array.from(refs ?? [])) fd.append("references", f);
      }
      await api("/api/characters", { method: "POST", body: fd });
      await reload();
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
            <Field label="種類" hint={kind === "item" ? "商品パッケージ・料理・小物など。② でロゴや色をそのまま再現するよう AI に指示します" : "② で顔や髪型をそろえるよう AI に指示します"}>
              <div className="flex gap-1.5">
                {(["character", "item"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-sm ${kind === k ? "border-accent bg-accent/15 text-white" : "border-line text-white/60"}`}
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

      <div className="space-y-3">
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
              <CharacterCard key={c.id} c={c} tags={allTags} onPatch={(b) => patch(c.id, b)} onDelete={() => remove(c.id)} />
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
  onPatch,
  onDelete,
}: {
  c: CharacterView;
  tags: string[];
  onPatch: (b: object) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-panel">
      <div className="relative bg-black" style={aspectStyle(c.aspect)}>
        {c.status === "ready" && c.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.imageUrl} alt={c.name} className="h-full w-full object-cover" />
        ) : c.status === "pending" ? (
          <div className="flex h-full items-center justify-center">
            <Spinner label="生成中…" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-[11px] text-red-300">{c.error}</div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          <Badge tone="accent">{c.name}</Badge>
          {c.kind === "item" && <Badge tone="warn">商品</Badge>}
        </div>
        <button
          onClick={onDelete}
          className="absolute right-2 top-2 hidden rounded-md bg-black/70 px-1.5 text-xs text-white/80 hover:text-red-300 group-hover:block"
        >
          削除
        </button>
      </div>
      <div className="space-y-2 p-2">
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
