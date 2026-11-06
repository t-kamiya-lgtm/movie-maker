"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Select, Spinner, inputCls } from "./ui";

export interface VoiceView {
  id: string;
  name: string;
  languages: string[];
  sampleUrl?: string;
  coverUrl?: string;
  provider: string;
}

/** Fish Audio のボイス検索・選択 */
export function VoicePicker({ value, onChange }: { value?: string; onChange: (v: { id: string; name: string }) => void }) {
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("ja");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [voices, setVoices] = useState<VoiceView[]>([]);
  const [mock, setMock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const load = async (p = 1) => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ q, lang, page: String(p), ...(mine ? { mine: "1" } : {}) });
      const r = await api<{ voices: VoiceView[]; mock: boolean }>(`/api/voices?${params}`);
      setVoices(r.voices);
      setMock(r.mock);
      setPage(p);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
  }, [lang, mine]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      {mock && (
        <p className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          FISH_AUDIO_API_KEY が未設定のため、モックボイス（テスト音）のみ利用できます。
        </p>
      )}
      <div className="flex gap-1.5">
        <input
          className={`${inputCls} py-1 text-xs`}
          placeholder="ボイスを検索（例: ナレーター, 女性）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && load(1)}
        />
        <Select className="!w-20 py-1 text-xs" value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="ja">日本語</option>
          <option value="en">英語</option>
          <option value="zh">中国語</option>
          <option value="">すべて</option>
        </Select>
        <Button className="text-xs" onClick={() => load(1)}>
          検索
        </Button>
      </div>
      <label className="flex items-center gap-1 text-xs text-white/60">
        <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
        自分のボイスのみ（Fish Audio でクローンしたボイス）
      </label>
      {err && <p className="text-xs text-red-300">{err}</p>}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {loading ? (
          <Spinner />
        ) : (
          voices.map((v) => (
            <div
              key={v.id}
              onClick={() => onChange({ id: v.id, name: v.name })}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${value === v.id ? "bg-accent/25" : "hover:bg-white/5"}`}
            >
              {v.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.coverUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs">♪</span>
              )}
              <span className="min-w-0 flex-1 truncate">{v.name}</span>
              <span className="text-[10px] text-white/40">{v.languages.join(",")}</span>
              {v.sampleUrl && (
                <button
                  className="rounded bg-white/10 px-1.5 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    void new Audio(v.sampleUrl).play();
                  }}
                >
                  ▶
                </button>
              )}
            </div>
          ))
        )}
      </div>
      {!mock && (
        <div className="flex justify-between">
          <Button variant="ghost" className="text-xs" disabled={page <= 1} onClick={() => load(page - 1)}>
            ← 前
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => load(page + 1)}>
            次 →
          </Button>
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          className={`${inputCls} py-1 text-xs`}
          placeholder="ボイスID（reference_id）を直接入力"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <Button className="text-xs" disabled={!manual.trim()} onClick={() => onChange({ id: manual.trim(), name: manual.trim() })}>
          使う
        </Button>
      </div>
    </div>
  );
}
