"use client";

import type { AspectPreset } from "@/lib/aspect";

/** 出力サイズ選択（比率のアイコン付き） */
export function AspectSelect({ aspects, value, onChange }: { aspects: AspectPreset[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {aspects.map((a) => {
        const [w, h] = a.id.split(":").map(Number);
        const scale = 18 / Math.max(w, h);
        const on = a.id === value;
        return (
          <button
            key={a.id}
            type="button"
            title={`${a.usage}（${a.width}×${a.height}）`}
            onClick={() => onChange(a.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${on ? "border-accent bg-accent/15 text-white" : "border-line text-white/60 hover:text-white"}`}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              <span className="block rounded-[2px] border border-current" style={{ width: w * scale, height: h * scale }} />
            </span>
            {a.id}
          </button>
        );
      })}
    </div>
  );
}
