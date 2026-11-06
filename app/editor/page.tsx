import { ProjectList } from "@/components/ProjectList";

export default function EditorIndex() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">③ 結合動画</h1>
      <ProjectList base="/editor" />
    </div>
  );
}
