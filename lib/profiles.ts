import { randomUUID } from "crypto";
import type { Character, DB, Profile } from "./types";

const byCreated = (a: Character, b: Character) => a.createdAt - b.createdAt;

export function findProfile(db: DB, name: string): Profile | undefined {
  return db.profiles.find((p) => p.name === name);
}

function usable(c: Character | undefined, name: string): c is Character {
  return !!c && c.name === name && c.status === "ready" && !!c.imagePath;
}

/** 顔の基準画像（設定がなければ、その名前で一番古い完成画像） */
export function anchorOf(db: DB, p: Profile): Character | undefined {
  const set = db.characters.find((c) => c.id === p.anchorId);
  if (usable(set, p.name)) return set;
  return db.characters.filter((c) => usable(c, p.name)).sort(byCreated)[0];
}

/**
 * プロフィールを画像の名前と同期する（db を直接更新する。mutate の中で呼ぶ）。
 * - プロフィールのない名前にはプロフィールを作る（既存データの移行も兼ねる）
 * - 基準画像が消えた・名前が変わった場合は付け直す
 */
export function ensureProfiles(db: DB) {
  const now = Date.now();
  for (const name of new Set(db.characters.map((c) => c.name))) {
    if (findProfile(db, name)) continue;
    const first = db.characters.filter((c) => c.name === name).sort(byCreated)[0];
    db.profiles.push({
      id: randomUUID(),
      name,
      kind: first.kind ?? "character",
      prompt: first.prompt === "(アップロード)" ? "" : first.prompt,
      attributes: first.attributes ?? {},
      createdAt: first.createdAt,
      updatedAt: now,
    });
  }
  for (const p of db.profiles) {
    p.anchorId = anchorOf(db, p)?.id;
  }
}
