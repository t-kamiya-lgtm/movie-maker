import { ProjectList } from "@/components/ProjectList";

export default function VoiceIndex() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">④ ナレーション追加</h1>
      <p className="text-sm text-white/50">ナレーションを付けるプロジェクト（③ で作成した結合動画）を選んでください。</p>
      <ProjectList base="/voice" />
    </div>
  );
}
