import { spawn } from "child_process";
import { absPath, newPath } from "./storage";
import { getAspect } from "./aspect";
import type { FitMode } from "./types";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-1500)}`));
    });
  });
}

export const ffmpeg = (args: string[]) => exec(FFMPEG, ["-hide_banner", "-y", ...args]);

export interface ProbeResult {
  duration: number;
  hasAudio: boolean;
  width?: number;
  height?: number;
}

export async function probe(rel: string): Promise<ProbeResult> {
  const out = await exec(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height",
    "-of", "json",
    absPath(rel),
  ]);
  const j = JSON.parse(out) as {
    format?: { duration?: string };
    streams?: { codec_type: string; width?: number; height?: number }[];
  };
  const v = j.streams?.find((s) => s.codec_type === "video");
  return {
    duration: Number(j.format?.duration ?? 0),
    hasAudio: !!j.streams?.some((s) => s.codec_type === "audio"),
    width: v?.width,
    height: v?.height,
  };
}

const r3 = (n: number) => Math.max(0, Math.round(n * 1000) / 1000);

export interface ConcatInput {
  path: string;
  start: number;
  end: number;
  hasAudio: boolean;
}

/**
 * 複数の動画をトリミング → 指定サイズに整形 → 結合する。
 * 音声（環境音）が無い素材には無音を補う。
 */
export async function concatClips(inputs: ConcatInput[], aspectId: string, fit: FitMode): Promise<string> {
  if (inputs.length === 0) throw new Error("タイムラインにクリップがありません");
  const { width: W, height: H } = getAspect(aspectId);
  const args: string[] = [];
  const filters: string[] = [];
  const labels: string[] = [];
  let idx = 0;

  const silentInputs: { clip: number; dur: number }[] = [];
  inputs.forEach((c) => args.push("-i", absPath(c.path)));
  idx = inputs.length;
  inputs.forEach((c, i) => {
    if (!c.hasAudio) silentInputs.push({ clip: i, dur: c.end - c.start });
  });
  const silentIndex = new Map<number, number>();
  for (const s of silentInputs) {
    args.push("-f", "lavfi", "-t", String(r3(s.dur)), "-i", "anullsrc=r=48000:cl=stereo");
    silentIndex.set(s.clip, idx++);
  }

  const scale =
    fit === "cover"
      ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
      : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;

  inputs.forEach((c, i) => {
    filters.push(
      `[${i}:v]trim=start=${r3(c.start)}:end=${r3(c.end)},setpts=PTS-STARTPTS,${scale},setsar=1,fps=30,format=yuv420p[v${i}]`,
    );
    if (c.hasAudio) {
      filters.push(
        `[${i}:a]atrim=start=${r3(c.start)}:end=${r3(c.end)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
      );
    } else {
      filters.push(`[${silentIndex.get(i)}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    }
    labels.push(`[v${i}][a${i}]`);
  });
  filters.push(`${labels.join("")}concat=n=${inputs.length}:v=1:a=1[v][a]`);

  const out = await newPath("renders", "mp4");
  await ffmpeg([
    ...args,
    "-filter_complex", filters.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    absPath(out),
  ]);
  return out;
}

export interface NarrationInput {
  path: string;
  start: number;
}

/** 結合動画にナレーションを重ねる（環境音は ambientVolume に下げる） */
export async function mixNarration(
  baseRel: string,
  narrations: NarrationInput[],
  ambientVolume: number,
  narrationVolume: number,
): Promise<string> {
  const args = ["-i", absPath(baseRel)];
  const filters = [`[0:a]volume=${ambientVolume}[bg]`];
  const mixLabels = ["[bg]"];
  narrations.forEach((n, i) => {
    args.push("-i", absPath(n.path));
    const ms = Math.round(n.start * 1000);
    filters.push(
      `[${i + 1}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${ms}|${ms},volume=${narrationVolume}[n${i}]`,
    );
    mixLabels.push(`[n${i}]`);
  });
  filters.push(`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:normalize=0[a]`);

  const out = await newPath("renders", "mp4");
  await ffmpeg([
    ...args,
    "-filter_complex", filters.join(";"),
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    absPath(out),
  ]);
  return out;
}

/** 動画の先頭フレームをサムネイル化 */
export async function extractFrame(videoRel: string): Promise<string> {
  const out = await newPath("tmp", "jpg");
  await ffmpeg(["-i", absPath(videoRel), "-frames:v", "1", "-q:v", "3", absPath(out)]);
  return out;
}
