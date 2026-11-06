"use client";

import { useMemo, useState } from "react";
import { api, aspectStyle, useModels, usePolled, type CharacterView } from "@/lib/client";
import { AspectSelect } from "@/components/AspectSelect";
import { TagEditor, TagFilter, collectTags } from "@/components/Tags";
import { Badge, Button, Empty, Field, KeyWarning, Panel, Select, Spinner, inputCls } from "@/components/ui";

export default function CharactersPage() {
  const models = useModels();
  const { data, reload, error } = usePolled<CharacterView[]>("/api/characters", (d) => d.some((c) => c.status === "pending"));
  const [mode, setMode] = useState<"generate" | "upload">("generate");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("nano-banana");
  const [aspect, setAspect] = useState("9:16");
  const [count, setCount] = useState(2);
  const [tags, setTags] = useState<string[]>([]);
  const [refs, setRefs] = useState<FileList | null>(null);
  const [upload, setUpload] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [filter, setFilter] = useState<string[]>([]);
  const [nameFilter, setNameFilter] = useState("");

  const characters = data ?? [];
  const allTags = useMemo(() => collectTags(characters), [characters]);
  const names = useMemo(() => [...new Set(characters.map((c) => c.name))], [characters]);
  const shown = characters.filter(
    (c) => filter.every((t) => c.tags.includes(t)) && (!nameFilter || c.name === nameFilter),
  );

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("mode", mode);
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
        <h1 className="text-xl font-bold">① キャラクター生成</h1>
        <KeyWarning show={!!models && !models.keys.fal}>
          FAL_KEY が未設定です。「モック」モデルのみ利用できます。
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
            <Field label="キャラクター名（フラグ）">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="例: ユイ" list="char-names" />
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
          <Select className="!w-auto py-1 text-xs" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)}>
            <option value="">全キャラクター</option>
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
          <Empty>キャラクターがまだありません</Empty>
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
        <div className="absolute left-2 top-2">
          <Badge tone="accent">{c.name}</Badge>
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
          <button onClick={() => setEditing(true)} className="text-xs text-white/50 hover:text-white">
            名前を変更
          </button>
        )}
        <TagEditor tags={c.tags} suggestions={tags} onChange={(t) => onPatch({ tags: t })} />
      </div>
    </div>
  );
}
