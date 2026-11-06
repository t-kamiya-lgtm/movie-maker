"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, usePolled, type ProjectView } from "@/lib/client";
import { Button, Empty } from "@/components/ui";

export function ProjectList({ base }: { base: "/editor" | "/voice" }) {
  const router = useRouter();
  const { data, reload } = usePolled<ProjectView[]>("/api/projects", () => false);
  const create = async () => {
    const p = await api<ProjectView>("/api/projects", { method: "POST", json: {} });
    router.push(`/editor/${p.id}`);
  };
  const remove = async (id: string) => {
    if (!confirm("このプロジェクトを削除しますか？（書き出した動画も削除されます）")) return;
    await api(`/api/projects/${id}`, { method: "DELETE" });
    await reload();
  };
  const list = data ?? [];
  return (
    <div className="space-y-3">
      {base === "/editor" && (
        <Button variant="primary" onClick={create}>
          ＋ 新しいプロジェクト
        </Button>
      )}
      {list.length === 0 ? (
        <Empty>プロジェクトがありません。② シーン画面で動画を選んで「③ 結合へ送る」からも作成できます。</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => {
            const video = base === "/voice" ? p.finalVideoUrl ?? p.baseVideoUrl : p.baseVideoUrl;
            return (
              <div key={p.id} className="group overflow-hidden rounded-xl border border-line bg-panel">
                <Link href={`${base}/${p.id}`} className="block">
                  <div className="flex aspect-video items-center justify-center bg-black">
                    {video ? <video src={video} muted className="h-full" /> : <span className="text-xs text-white/30">未書き出し</span>}
                  </div>
                  <div className="p-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-white/50">
                      {p.aspect} · {p.clips.length} クリップ · ナレーション {p.narrations.length}
                    </div>
                  </div>
                </Link>
                {base === "/editor" && (
                  <div className="px-3 pb-3">
                    <Button variant="danger" className="text-xs" onClick={() => remove(p.id)}>
                      削除
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
