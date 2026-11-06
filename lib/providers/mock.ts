import { createHash } from "crypto";
import { absPath, newPath } from "../storage";
import { ffmpeg } from "../ffmpeg";
import { sizeFor } from "../aspect";

/** APIキーなしで動作確認するためのダミー生成 */

function colorsFrom(text: string): [string, string] {
  const h = createHash("md5").update(text).digest("hex");
  return [`0x${h.slice(0, 6)}`, `0x${h.slice(6, 12)}`];
}

export async function mockImage(prompt: string, aspect: string): Promise<string> {
  const { width, height } = sizeFor(aspect, 1024);
  const [c0, c1] = colorsFrom(prompt + Date.now());
  const out = await newPath("tmp", "png");
  await ffmpeg([
    "-f", "lavfi",
    "-i", `gradients=s=${width}x${height}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${width}:y1=${height}:nb_colors=2`,
    "-frames:v", "1",
    absPath(out),
  ]);
  return out;
}

export async function mockVideo(imageRel: string, duration: number): Promise<string> {
  const out = await newPath("tmp", "mp4");
  const frames = Math.round(duration * 30);
  await ffmpeg([
    "-loop", "1", "-i", absPath(imageRel),
    "-f", "lavfi", "-i", "anoisesrc=color=brown:amplitude=0.04:r=48000",
    "-t", String(duration),
    "-vf", `scale=trunc(iw/2)*2:trunc(ih/2)*2,zoompan=z='min(zoom+0.0015,1.2)':d=${frames}:s=hd720:fps=30,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast",
    "-c:a", "aac", "-shortest",
    absPath(out),
  ]);
  return out;
}

export async function mockSpeech(text: string): Promise<string> {
  const out = await newPath("audio", "mp3");
  const dur = Math.min(15, Math.max(1, text.length * 0.12));
  await ffmpeg([
    "-f", "lavfi", "-i", `sine=frequency=330:duration=${dur.toFixed(2)}`,
    "-af", "volume=0.3",
    absPath(out),
  ]);
  return out;
}
