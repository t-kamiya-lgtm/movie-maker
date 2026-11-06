"use client";

import { useState } from "react";
import { inputCls } from "./ui";

/** タグ（フラグ）の編集 */
export function TagEditor({ tags, onChange, suggestions = [] }: { tags: string[]; onChange: (t: string[]) => void; suggestions?: string[] }) {
  const [value, setValue] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, "");
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setValue("");
  };
  const listId = `tags-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] text-accent hover:bg-red-500/20 hover:text-red-300"
            title="クリックで削除"
          >
            #{t} ×
          </button>
        ))}
      </div>
      <input
        className={`${inputCls} py-1 text-xs`}
        placeholder="タグを追加して Enter"
        value={value}
        list={listId}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add(value);
          }
        }}
        onBlur={() => value && add(value)}
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !tags.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/** タグによる絞り込み（複数選択は AND） */
export function TagFilter({ all, selected, onChange }: { all: string[]; selected: string[]; onChange: (t: string[]) => void }) {
  if (!all.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-white/40">絞り込み:</span>
      <button
        onClick={() => onChange([])}
        className={`rounded-full px-2.5 py-0.5 text-xs ${selected.length === 0 ? "bg-white text-black" : "bg-white/10 text-white/70 hover:bg-white/15"}`}
      >
        すべて
      </button>
      {all.map((t) => {
        const on = selected.includes(t);
        return (
          <button
            key={t}
            onClick={() => onChange(on ? selected.filter((x) => x !== t) : [...selected, t])}
            className={`rounded-full px-2.5 py-0.5 text-xs ${on ? "bg-accent text-white" : "bg-white/10 text-white/70 hover:bg-white/15"}`}
          >
            #{t}
          </button>
        );
      })}
    </div>
  );
}

export function collectTags(items: { tags: string[] }[]): string[] {
  return [...new Set(items.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b, "ja"));
}
