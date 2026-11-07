export type Status = "pending" | "ready" | "error";

/** character = 人物, item = 商品・小物（パッケージ・料理など） */
export type AssetKind = "character" | "item";

export interface Character {
  id: string;
  /** 人物か商品・小物か（未設定は人物） */
  kind?: AssetKind;
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
  /** 生成時のパーソナルデータ（その時点のスナップショット） */
  attributes?: Record<string, string>;
  /** 顔の見本として参照した画像（同じ名前の基準画像）の ID */
  refCharacterId?: string;
  /** 構図: bust = バストアップ（新しい人物の最初の生成） */
  framing?: "bust" | "free";
  /** パーソナルデータを AI で推定中 */
  estimating?: boolean;
}

/** 名前ごとの人物（または商品）プロフィール。同じ名前の画像はこのプロフィールを共有する */
export interface Profile {
  id: string;
  name: string;
  kind: AssetKind;
  /** 前回使ったプロンプト（次回の入力欄に表示） */
  prompt: string;
  /** パーソナルデータ（年齢・身長など） */
  attributes: Record<string, string>;
  /** 顔の基準画像（Character の ID） */
  anchorId?: string;
  createdAt: number;
  updatedAt: number;
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
  /** 画像ができたら続けて動画化する */
  autoVideo?: boolean;
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
  profiles: Profile[];
  scenes: Scene[];
  projects: Project[];
}
