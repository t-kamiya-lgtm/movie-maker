import { bad, json } from "@/lib/api";
import { hasFishKey } from "@/lib/providers/catalog";
import { MOCK_VOICES, listFishVoices } from "@/lib/providers/fish";
import { errorMessage } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?q=検索語&lang=ja&page=1&mine=1 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  if (!hasFishKey()) return json({ total: MOCK_VOICES.length, voices: MOCK_VOICES, mock: true });
  try {
    const r = await listFishVoices({
      query: sp.get("q") || undefined,
      language: sp.get("lang") || undefined,
      page: Number(sp.get("page") || 1),
      self: sp.get("mine") === "1",
    });
    return json({ ...r, voices: [...r.voices, ...MOCK_VOICES], mock: false });
  } catch (err) {
    return bad(errorMessage(err), 502);
  }
}
