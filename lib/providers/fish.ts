/**
 * Fish Audio（ナレーション用 TTS）
 * https://docs.fish.audio/
 */
const BASE = "https://api.fish.audio";

export interface Voice {
  id: string;
  name: string;
  languages: string[];
  sampleUrl?: string;
  coverUrl?: string;
  provider: "fish" | "mock";
}

function key() {
  const k = process.env.FISH_AUDIO_API_KEY;
  if (!k) throw new Error("FISH_AUDIO_API_KEY が設定されていません（.env を確認してください）");
  return k;
}

export async function listFishVoices(opts: { query?: string; language?: string; page?: number; self?: boolean }) {
  const params = new URLSearchParams({
    page_size: "24",
    page_number: String(opts.page ?? 1),
    sort_by: "score",
  });
  if (opts.query) params.set("title", opts.query);
  if (opts.language) params.set("language", opts.language);
  if (opts.self) params.set("self", "true");
  const res = await fetch(`${BASE}/model?${params}`, { headers: { Authorization: `Bearer ${key()}` } });
  if (!res.ok) throw new Error(`Fish Audio voices: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    total: number;
    items: {
      _id: string;
      title: string;
      languages?: string[];
      cover_image?: string;
      samples?: { audio?: string }[];
    }[];
  };
  const voices: Voice[] = j.items.map((m) => ({
    id: m._id,
    name: m.title,
    languages: m.languages ?? [],
    sampleUrl: m.samples?.[0]?.audio,
    coverUrl: m.cover_image
      ? m.cover_image.startsWith("http")
        ? m.cover_image
        : `https://public-platform.r2.fish.audio/${m.cover_image}`
      : undefined,
    provider: "fish",
  }));
  return { total: j.total, voices };
}

export async function fishTts(text: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      model: process.env.FISH_AUDIO_MODEL || "s1",
    },
    body: JSON.stringify({
      text,
      reference_id: voiceId,
      format: "mp3",
      mp3_bitrate: 192,
      normalize: true,
      latency: "normal",
    }),
  });
  if (!res.ok) throw new Error(`Fish Audio TTS: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

export const MOCK_VOICES: Voice[] = [
  { id: "mock-female", name: "モック女性ナレーター", languages: ["ja"], provider: "mock" },
  { id: "mock-male", name: "モック男性ナレーター", languages: ["ja"], provider: "mock" },
];
