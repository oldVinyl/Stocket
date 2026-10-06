import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import type { Persistence, Snapshot } from "@stocket/core";
const db = SQLite.openDatabaseAsync("stocket.db").then(async (db) => {
  await db.execAsync(
    "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL);",
  );
  return db;
});
export function persistence(key: string): Persistence {
  return {
    load: async () => {
      const row = await (
        await db
      ).getFirstAsync<{ body: string }>(
        "SELECT body FROM snapshots WHERE id = ?",
        key,
      );
      return row ? JSON.parse(row.body) : null;
    },
    save: async (data: Snapshot) => {
      await (
        await db
      ).runAsync(
        "INSERT INTO snapshots(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        key,
        JSON.stringify(data),
      );
    },
    clear: async () => {
      await (await db).runAsync("DELETE FROM snapshots WHERE id = ?", key);
    },
  };
}
// Chunks are versioned and the pointer is written last, so an interrupted
// refresh leaves the previous session intact. 400 UTF-16 characters stay below
// the per-value byte limit even for display names containing Unicode.
type Head = { generation: string; count: number };
let storageSerial: Promise<unknown> = Promise.resolve();
function storageLock<T>(job: () => Promise<T>): Promise<T> {
  const run = storageSerial.then(job, job);
  storageSerial = run.catch(() => {});
  return run;
}
export const secureSessionStorage = {
  async getItem(key: string) {
    return storageLock(async () => {
      const raw = await SecureStore.getItemAsync(`${key}.head`);
      if (!raw) return null;
      const { generation, count } = JSON.parse(raw) as Head;
      let value = "";
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(
          `${key}.${generation}.${i}`,
        );
        if (chunk === null) return null;
        value += chunk;
      }
      return value;
    });
  },
  async setItem(key: string, value: string) {
    return storageLock(async () => {
      const raw = await SecureStore.getItemAsync(`${key}.head`),
        prior: Head | null = raw ? JSON.parse(raw) : null;
      const generation =
        Date.now().toString(36) + Math.random().toString(36).slice(2);
      const count = Math.ceil(value.length / 400);
      for (let i = 0; i < count; i++)
        await SecureStore.setItemAsync(
          `${key}.${generation}.${i}`,
          value.slice(i * 400, (i + 1) * 400),
          { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
        );
      await SecureStore.setItemAsync(
        `${key}.head`,
        JSON.stringify({ generation, count }),
      );
      if (prior)
        for (let i = 0; i < prior.count; i++)
          await SecureStore.deleteItemAsync(`${key}.${prior.generation}.${i}`);
    });
  },
  async removeItem(key: string) {
    return storageLock(async () => {
      const raw = await SecureStore.getItemAsync(`${key}.head`);
      await SecureStore.deleteItemAsync(`${key}.head`);
      if (raw) {
        const head: Head = JSON.parse(raw);
        for (let i = 0; i < head.count; i++)
          await SecureStore.deleteItemAsync(`${key}.${head.generation}.${i}`);
      }
    });
  },
};
