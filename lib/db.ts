import fs from "fs/promises";
import path from "path";
import { STORAGE_DIR } from "./storage";
import type { DB } from "./types";

/**
 * シンプルな JSON ファイル DB（storage/db.json）。
 * 書き込みは直列化し、一時ファイル→rename でアトミックに保存する。
 */
const DB_FILE = path.join(STORAGE_DIR, "db.json");

const g = globalThis as unknown as {
  __mmDb?: DB;
  __mmQueue?: Promise<unknown>;
};

async function load(): Promise<DB> {
  if (g.__mmDb) return g.__mmDb;
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<DB>;
    g.__mmDb = {
      characters: parsed.characters ?? [],
      profiles: parsed.profiles ?? [],
      scenes: parsed.scenes ?? [],
      projects: parsed.projects ?? [],
    };
  } catch {
    g.__mmDb = { characters: [], profiles: [], scenes: [], projects: [] };
  }
  return g.__mmDb;
}

async function persist(db: DB) {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}

export async function readDb(): Promise<DB> {
  await (g.__mmQueue ?? Promise.resolve());
  return structuredClone(await load());
}

export function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  };
  const next = (g.__mmQueue ?? Promise.resolve()).then(run, run);
  g.__mmQueue = next.catch(() => undefined);
  return next;
}

export function now() {
  return Date.now();
}
