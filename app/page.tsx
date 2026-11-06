"use client";

import Link from "next/link";
import { aspectStyle, usePolled, type SceneView } from "@/lib/client";
import { Empty } from "@/components/ui";

const STARTS = [
  { href: "/characters", title: "キャラクター・商品", desc: "人物や商品を登録して名前を付けて保存", step: "①" },
  { href: "/scenes", title: "シーン動画", desc: "人物と商品でシーンを量産し動画化", step: "②" },
  { href: "/editor", title: "結合動画", desc: "素材をタイムラインに並べて1本に", step: "③" },
  { href: "/voice", title: "ナレーション", desc: "Fish Audio のボイスで音声を追加", step: "④" },
];

export default function Home() {
  const { data: scenes } = usePolled<SceneView[]>("/api/scenes", () => false);
  const gallery = (scenes ?? []).filter((s) => s.imageUrl).slice(0, 40);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-sm font-semibold text-white/80">何をつくりますか？</h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STARTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-accent/30 via-panel to-black p-4 transition hover:border-accent"
            >
              <span className="absolute left-4 top-3 text-4xl font-black text-white/15 group-hover:text-white/30">{s.step}</span>
              <span className="text-base font-bold">{s.title}</span>
              <span className="text-xs text-white/60">{s.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/80">作例（最近のシーン）</h2>
        {gallery.length === 0 ? (
          <Empty>まだシーンがありません。① キャラクターを作成して ② シーンを生成しましょう。</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {gallery.map((s) => (
              <Link key={s.id} href="/scenes" className="overflow-hidden rounded-xl bg-panel" style={aspectStyle(s.aspect)}>
                {s.videoUrl ? (
                  <video
                    src={s.videoUrl}
                    poster={s.imageUrl}
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                    onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt={s.prompt} className="h-full w-full object-cover" />
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
