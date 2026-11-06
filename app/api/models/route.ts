import { json } from "@/lib/api";
import { ASPECTS, DEFAULT_ASPECT } from "@/lib/aspect";
import { IMAGE_MODELS, VIDEO_MODELS, hasFalKey, hasFishKey } from "@/lib/providers/catalog";

export const dynamic = "force-dynamic";

export function GET() {
  const fal = hasFalKey();
  const avail = (p: string) => (p === "mock" ? true : fal);
  return json({
    aspects: ASPECTS,
    defaultAspect: DEFAULT_ASPECT,
    keys: { fal, fish: hasFishKey() },
    imageModels: IMAGE_MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      note: m.note,
      provider: m.provider,
      supportsReference: !!m.editEndpoint,
      available: avail(m.provider),
    })),
    videoModels: VIDEO_MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      note: m.note,
      provider: m.provider,
      durations: m.durations,
      nativeAudio: m.nativeAudio,
      available: avail(m.provider),
    })),
  });
}
