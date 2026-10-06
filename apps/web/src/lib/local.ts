import { openDB } from "idb";
import {
  InventoryStore,
  type Mutation,
  type Persistence,
  type Remote,
  type Snapshot,
} from "@stocket/core";
const db = () =>
  openDB("stocket", 1, {
    upgrade(db) {
      db.createObjectStore("inventory");
    },
  });
export function createStore(mode: "demo" | "connected", userId = "demo") {
  const key = `${mode}:${userId}`;
  const persistence: Persistence = {
    load: async () => (await (await db()).get("inventory", key)) ?? null,
    save: async (data: Snapshot) => {
      await (await db()).put("inventory", data, key);
    },
    clear: async () => {
      await (await db()).delete("inventory", key);
    },
  };
  const remote: Remote | undefined =
    mode === "connected"
      ? {
          pull: () => request("/api/inventory"),
          push: async (op) => {
            await request("/api/inventory", {
              method: "POST",
              body: JSON.stringify(op),
            });
          },
        }
      : undefined;
  // Serialize writes across browser tabs, not only within a single component.
  class SharedStore extends InventoryStore {
    private async lock<T>(job: () => Promise<T>): Promise<T> {
      return navigator.locks
        ? await navigator.locks.request(
            `stocket:${key}`,
            async () => await job(),
          )
        : await job();
    }
    override mutate(op: Mutation) {
      return this.lock(() => super.mutate(op));
    }
    override sync() {
      return this.lock(() => super.sync());
    }
    override initialize(data: Snapshot) {
      return this.lock(() => super.initialize(data));
    }
  }
  return { store: new SharedStore(persistence, remote), persistence };
}
export async function request<T = any>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(body.error ?? "Something went wrong. Please try again.");
  return body;
}
