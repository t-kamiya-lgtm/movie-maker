"use client";

import { useEffect, type ReactNode } from "react";

export interface LightboxItem {
  key: string;
  title: string;
  imageUrl?: string;
  videoUrl?: string;
  /** 右側（スマホでは下）に出す説明 */
  info?: ReactNode;
}

/** 画像・動画の拡大表示。Esc で閉じる、← → で前後に移動 */
export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: LightboxItem[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = index === null ? undefined : items[index];

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, items.length, onClose, onIndex]);

  if (!item || index === null) return null;
  const nav = "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-xl text-white hover:bg-black/80 disabled:opacity-20";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm lg:flex-row" onClick={onClose}>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 lg:p-6" onClick={(e) => e.stopPropagation()}>
        {item.videoUrl ? (
          <video key={item.key} src={item.videoUrl} poster={item.imageUrl} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.title} className="max-h-full max-w-full rounded-lg object-contain" />
        )}
        <button className={`${nav} left-2`} disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="前へ">
          ‹
        </button>
        <button className={`${nav} right-2`} disabled={index === items.length - 1} onClick={() => onIndex(index + 1)} aria-label="次へ">
          ›
        </button>
      </div>
      <aside
        className="max-h-[40vh] shrink-0 overflow-y-auto border-t border-line bg-panel p-4 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-bold">{item.title}</h3>
          <span className="text-xs text-white/40">
            {index + 1} / {items.length}
          </span>
          <button onClick={onClose} className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
            閉じる ✕
          </button>
        </div>
        {item.info}
        {(item.videoUrl || item.imageUrl) && (
          <a
            href={`${item.videoUrl ?? item.imageUrl}?download`}
            className="mt-4 inline-block text-xs text-accent hover:underline"
          >
            ダウンロード
          </a>
        )}
      </aside>
    </div>
  );
}
