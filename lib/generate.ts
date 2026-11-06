import fs from "fs/promises";
import { createHash } from "crypto";
import { mutate, readDb } from "./db";
import { errorMessage } from "./jobs";
import { absPath, download, extFromContentType, newPath, removeFile, type Bucket } from "./storage";
import { concatClips, mixNarration, probe } from "./ffmpeg";
import { getImageModel, getVideoModel } from "./providers/catalog";
import { falAddAmbient, falImage, falVideo } from "./providers/fal";
import { mockImage, mockSpeech, mockVideo } from "./providers/mock";
import { fishTts } from "./providers/fish";
import type { Project, Scene } from "./types";

/** URL またはストレージ内の一時ファイルを、指定バケットに保存し直す */
async function materialize(source: string, bucket: Bucket, fallbackExt: string): Promise<string> {
  if (/^https?:\/\//.test(source)) {
    const { buffer, contentType } = await download(source);
    const rel = await newPath(bucket, extFromContentType(contentType, fallbackExt));
    await fs.writeFile(absPath(rel), buffer);
    return rel;
  }
  const ext = source.split(".").pop() || fallbackExt;
  const rel = await newPath(bucket, ext);
  await fs.rename(absPath(source), absPath(rel));
  return rel;
}

async function createImage(modelId: string, prompt: string, aspect: string, refs: string[]): Promise<string> {
  const model = getImageModel(modelId);
  if (!model) throw new Error(`未知の画像モデル: ${modelId}`);
  return model.provider === "mock" ? mockImage(prompt, aspect) : falImage(model, prompt, aspect, refs);
}

// ---------- ① キャラクター ----------

export async function generateCharacter(id: string, referencePaths: string[]) {
  const db = await readDb();
  const c = db.characters.find((x) => x.id === id);
  if (!c) return;
  try {
    const src = await createImage(c.model, c.prompt, c.aspect, referencePaths);
    const imagePath = await materialize(src, "characters", "png");
    await mutate((d) => {
      const t = d.characters.find((x) => x.id === id);
      if (t) Object.assign(t, { imagePath, status: "ready", error: undefined });
    });
  } catch (err) {
    await mutate((d) => {
      const t = d.characters.find((x) => x.id === id);
      if (t) Object.assign(t, { status: "error", error: errorMessage(err) });
    });
  } finally {
    for (const r of referencePaths) if (r.startsWith("tmp/")) await removeFile(r);
  }
}

// ---------- ② シーン画像 ----------

export async function generateSceneImage(id: string) {
  const db = await readDb();
  const s = db.scenes.find((x) => x.id === id);
  if (!s) return;
  const refs = s.characterIds
    .map((cid) => db.characters.find((c) => c.id === cid)?.imagePath)
    .filter((p): p is string => !!p);
  const names = s.characterIds
    .map((cid) => db.characters.find((c) => c.id === cid)?.name)
    .filter(Boolean)
    .join(", ");
  const prompt = refs.length
    ? `${s.prompt}\n\nUse the person(s) in the reference image(s) (${names}) as the main character(s), keeping face, hairstyle and identity consistent. Photorealistic, natural lighting.`
    : s.prompt;
  try {
    const src = await createImage(s.imageModel, prompt, s.aspect, refs);
    const imagePath = await materialize(src, "scenes", "png");
    await mutate((d) => {
      const t = d.scenes.find((x) => x.id === id);
      if (t) Object.assign(t, { imagePath, imageStatus: "ready", imageError: undefined });
    });
  } catch (err) {
    await mutate((d) => {
      const t = d.scenes.find((x) => x.id === id);
      if (t) Object.assign(t, { imageStatus: "error", imageError: errorMessage(err) });
    });
  }
}

// ---------- ② シーン動画（環境音のみ） ----------

export async function generateSceneVideo(id: string) {
  const db = await readDb();
  const s = db.scenes.find((x) => x.id === id) as Scene | undefined;
  if (!s || !s.imagePath || !s.videoModel) return;
  const model = getVideoModel(s.videoModel);
  try {
    if (!model) throw new Error(`未知の動画モデル: ${s.videoModel}`);
    const duration = s.duration && model.durations.includes(s.duration) ? s.duration : model.durations[0];
    const motion = s.motionPrompt || s.prompt;

    const src =
      model.provider === "mock"
        ? await mockVideo(s.imagePath, duration)
        : await falVideo(model, motion, s.imagePath, duration);
    let videoPath = await materialize(src, "videos", "mp4");
    let info = await probe(videoPath);

    // 音声を生成しないモデルは MMAudio で環境音を付与
    if (!info.hasAudio && model.provider === "fal") {
      const withAudio = await falAddAmbient(videoPath, motion, info.duration || duration);
      const newRel = await materialize(withAudio, "videos", "mp4");
      await removeFile(videoPath);
      videoPath = newRel;
      info = await probe(videoPath);
    }

    await mutate((d) => {
      const t = d.scenes.find((x) => x.id === id);
      if (t) {
        const old = t.videoPath;
        Object.assign(t, {
          videoPath,
          videoStatus: "ready",
          videoError: undefined,
          duration: Math.round(info.duration * 100) / 100,
          hasAudio: info.hasAudio,
        });
        if (old && old !== videoPath) void removeFile(old);
      }
    });
  } catch (err) {
    await mutate((d) => {
      const t = d.scenes.find((x) => x.id === id);
      if (t) Object.assign(t, { videoStatus: "error", videoError: errorMessage(err) });
    });
  }
}

// ---------- ③ 結合 ----------

export function timelineHash(p: Project, scenes: Scene[]) {
  const data = {
    a: p.aspect,
    f: p.fit,
    c: p.clips.map((c) => [c.sceneId, scenes.find((s) => s.id === c.sceneId)?.videoPath, c.trimStart, c.trimEnd ?? 0]),
  };
  return createHash("sha1").update(JSON.stringify(data)).digest("hex");
}

export function narrationHash(p: Project, baseHash: string) {
  const data = {
    b: baseHash,
    v: [p.ambientVolume, p.narrationVolume],
    n: p.narrations.filter((n) => n.status === "ready").map((n) => [n.audioPath, n.start]),
  };
  return createHash("sha1").update(JSON.stringify(data)).digest("hex");
}

async function renderBase(p: Project, scenes: Scene[]): Promise<{ path: string; hash: string }> {
  const hash = timelineHash(p, scenes);
  if (p.baseVideoPath && p.baseHash === hash) return { path: p.baseVideoPath, hash };
  const inputs = p.clips.map((c) => {
    const s = scenes.find((x) => x.id === c.sceneId);
    if (!s?.videoPath || s.videoStatus !== "ready") throw new Error("未完成の動画がタイムラインに含まれています");
    const full = s.duration ?? 5;
    const start = Math.min(Math.max(0, c.trimStart || 0), full - 0.1);
    const end = c.trimEnd && c.trimEnd > start ? Math.min(c.trimEnd, full) : full;
    return { path: s.videoPath, start, end, hasAudio: !!s.hasAudio };
  });
  const path = await concatClips(inputs, p.aspect, p.fit);
  return { path, hash };
}

export async function renderProject(id: string, target: "base" | "final") {
  const db = await readDb();
  const p = db.projects.find((x) => x.id === id);
  if (!p) return;
  try {
    const base = await renderBase(p, db.scenes);
    const update: Partial<Project> = { baseVideoPath: base.path, baseHash: base.hash };

    if (target === "final") {
      const ready = p.narrations.filter((n) => n.status === "ready" && n.audioPath);
      const nHash = narrationHash(p, base.hash);
      if (!(p.finalVideoPath && p.finalHash === nHash)) {
        update.finalVideoPath = ready.length
          ? await mixNarration(
              base.path,
              ready.map((n) => ({ path: n.audioPath!, start: n.start })),
              p.ambientVolume,
              p.narrationVolume,
            )
          : base.path;
        update.finalHash = nHash;
      }
    }

    await mutate((d) => {
      const t = d.projects.find((x) => x.id === id);
      if (!t) return;
      const oldFiles = [t.baseVideoPath, t.finalVideoPath];
      Object.assign(t, update, { renderStatus: "ready", renderError: undefined });
      const keep = new Set([t.baseVideoPath, t.finalVideoPath]);
      for (const f of oldFiles) if (f && !keep.has(f)) void removeFile(f);
    });
  } catch (err) {
    await mutate((d) => {
      const t = d.projects.find((x) => x.id === id);
      if (t) Object.assign(t, { renderStatus: "error", renderError: errorMessage(err) });
    });
  }
}

// ---------- ④ ナレーション ----------

export async function generateNarration(projectId: string, narrationId: string) {
  const db = await readDb();
  const n = db.projects.find((x) => x.id === projectId)?.narrations.find((x) => x.id === narrationId);
  if (!n) return;
  try {
    let audioPath: string;
    if (n.voiceId.startsWith("mock-")) {
      audioPath = await mockSpeech(n.text);
    } else {
      const buf = await fishTts(n.text, n.voiceId);
      audioPath = await newPath("audio", "mp3");
      await fs.writeFile(absPath(audioPath), buf);
    }
    const info = await probe(audioPath);
    await mutate((d) => {
      const t = d.projects.find((x) => x.id === projectId)?.narrations.find((x) => x.id === narrationId);
      if (!t) return void removeFile(audioPath);
      const old = t.audioPath;
      Object.assign(t, {
        audioPath,
        duration: Math.round(info.duration * 100) / 100,
        status: "ready",
        error: undefined,
      });
      if (old && old !== audioPath) void removeFile(old);
    });
  } catch (err) {
    await mutate((d) => {
      const t = d.projects.find((x) => x.id === projectId)?.narrations.find((x) => x.id === narrationId);
      if (t) Object.assign(t, { status: "error", error: errorMessage(err) });
    });
  }
}
