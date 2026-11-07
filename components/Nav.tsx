"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "ホーム", sub: "" },
  { href: "/characters", label: "① 画像", sub: "キャラクター" },
  { href: "/scenes", label: "② 動画", sub: "シーン素材" },
  { href: "/editor", label: "③ 結合", sub: "タイムライン" },
  { href: "/voice", label: "④ 音声", sub: "ナレーション" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex min-w-0 gap-1 overflow-x-auto">
      {ITEMS.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
          >
            <span className="font-medium">{it.label}</span>
            {it.sub && <span className="ml-1.5 text-xs text-white/40">{it.sub}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
