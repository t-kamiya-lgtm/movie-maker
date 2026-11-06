export type Status = "pending" | "ready" | "error";

export interface Character {
  id: string;
  /** キャラクター名（フラグ） */
  name: string;
  tags: string[];
  prompt: string;
  model: string;
  aspect: string;
  imagePath?: string;
  status: Status;
  error?: string;
  createdAt: number;
}

export interface Scene {
  id: string;
  characterIds: string[];
  prompt: string;
  aspect: string;
  imageModel: string;
  imagePath?: string;
  imageStatus: Status;
  imageError?: string;

  videoModel?: string;
  motionPrompt?: string;
  videoPath?: string;
  videoStatus: Status | "none";
  videoError?: string;
  /** 秒 */
  duration?: number;
  /** 環境音が入っているか */
  hasAudio?: boolean;

  /** 任意フラグ */
  tags: string[];
  createdAt: number;
}

export interface TimelineClip {
  id: string;
  sceneId: string;
  /** 秒 */
  trimStart: number;
  /** 秒（0 または未指定で末尾まで） */
  trimEnd?: number;
}

export interface Narration {
  id: string;
  text: string;
  voiceId: string;
  voiceName: string;
  /** タイムライン上の開始位置（秒） */
  start: number;
  audioPath?: string;
  duration?: number;
  status: Status;
  error?: string;
}

export type FitMode = "cover" | "contain";

export interface Project {
  id: string;
  name: string;
  aspect: string;
  fit: FitMode;
  clips: TimelineClip[];
  narrations: Narration[];
  /** 環境音の音量（0〜1） */
  ambientVolume: number;
  /** ナレーションの音量（0〜2） */
  narrationVolume: number;

  baseVideoPath?: string;
  baseHash?: string;
  finalVideoPath?: string;
  finalHash?: string;
  renderStatus: Status | "none";
  renderTarget?: "base" | "final";
  renderError?: string;

  createdAt: number;
  updatedAt: number;
}

export interface DB {
  characters: Character[];
  scenes: Scene[];
  projects: Project[];
}
