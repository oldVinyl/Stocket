import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMutation,
  csvExport,
  demoSnapshot,
  InventoryStore,
  type Mutation,
  type Persistence,
  type Remote,
  type Snapshot,
} from "./index";
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function memory(initial: Snapshot): Persistence {
  let data = copy(initial);
  return {
    load: async () => copy(data),
    save: async (next) => {
      data = copy(next);
    },
    clear: async () => {},
  };
}
function delta(snapshot: Snapshot, value: number): Mutation {
  return {
    id: crypto.randomUUID(),
    item_id: snapshot.items[0].id,
    kind: "adjust",
    delta: value,
    created_at: new Date().toISOString(),
    source: "synced_offline",
  };
}
test("two offline devices merge deltas and retries apply exactly once", async () => {
  let server = demoSnapshot();
  const seen = new Set<string>();
  const remote: Remote = {
    push: async (op) => {
      if (!seen.has(op.id)) {
        server = applyMutation(server, op);
        seen.add(op.id);
      }
    },
    pull: async () => copy(server),
  };
  const a = new InventoryStore(memory(server), remote),
    b = new InventoryStore(memory(server), remote);
  const op = delta(server, -4);
  await a.mutate(op);
  await a.mutate(op);
  await b.mutate(delta(server, -3));
  await Promise.all([a.sync(), b.sync()]);
  await a.sync();
  assert.equal((await a.load())!.items[0].quantity, 17);
  assert.equal(server.items[0].quantity, 17);
});
test("failed response leaves operation queued and retry does not double apply", async () => {
  let server = demoSnapshot(),
    fail = true;
  const remote: Remote = {
    pull: async () => copy(server),
    push: async (op) => {
      server = applyMutation(server, op);
      if (fail) {
        fail = false;
        throw new Error("Network interrupted after commit");
      }
    },
  };
  const store = new InventoryStore(memory(server), remote);
  await store.mutate(delta(server, -2));
  await assert.rejects(store.sync());
  assert.equal((await store.load())!.queue.length, 1);
  await store.sync();
  assert.equal((await store.load())!.items[0].quantity, 22);
  assert.equal((await store.load())!.queue.length, 0);
});
test("simultaneous local writes are serialized without losing either delta", async () => {
  const data = demoSnapshot(),
    store = new InventoryStore(memory(data));
  await Promise.all([
    store.mutate(delta(data, -2)),
    store.mutate(delta(data, 5)),
  ]);
  assert.equal((await store.load())!.items[0].quantity, 27);
});
test("oversubscribed offline deductions preserve negative discrepancy", () => {
  const data = demoSnapshot();
  assert.equal(applyMutation(data, delta(data, -30)).items[0].quantity, -6);
});
test("invalid changes are rejected before persistence", async () => {
  const data = demoSnapshot(),
    store = new InventoryStore(memory(data));
  for (const value of [0, NaN, 1.5, 1000001])
    await assert.rejects(store.mutate(delta(data, value)));
  assert.equal((await store.load())!.items[0].quantity, 24);
});
test("archive and undo retain stock history and quantity", () => {
  const data = demoSnapshot();
  const op: Mutation = {
    id: crypto.randomUUID(),
    item_id: data.items[0].id,
    kind: "archive",
    archived: true,
    source: "online",
    created_at: new Date(Date.now() + 1000).toISOString(),
  };
  const removed = applyMutation(data, op);
  assert.ok(removed.items[0].archived_at);
  const restored = applyMutation(removed, {
    ...op,
    id: crypto.randomUUID(),
    archived: false,
    created_at: new Date(Date.now() + 2000).toISOString(),
  });
  assert.equal(restored.items[0].archived_at, null);
  assert.equal(restored.items[0].quantity, 24);
  assert.deepEqual(restored.events, data.events);
});
test("CSV escapes formula injection, commas, quotes, and multiline names", () => {
  const data = demoSnapshot();
  data.catalog[0].name = '=SUM(1,2)\n"danger"';
  const csv = csvExport(data);
  assert.ok(csv.includes('"\'=SUM(1,2)\n""danger"""'));
});
test("company switch cannot replace the local snapshot during sync", async () => {
  const data = demoSnapshot(),
    other = demoSnapshot();
  other.company.id = crypto.randomUUID();
  const store = new InventoryStore(memory(data), {
    push: async () => {},
    pull: async () => other,
  });
  await assert.rejects(store.sync(), /Company changed/);
  assert.equal((await store.load())!.company.id, data.company.id);
});
test("quantity updates do not suppress older unrelated metadata changes", () => {
  const data = demoSnapshot(),
    base = Date.now();
  data.items[0].updated_at = new Date(base - 10000).toISOString();
  const adjusted = applyMutation(data, {
    ...delta(data, 2),
    created_at: new Date(base).toISOString(),
  });
  const edited = applyMutation(adjusted, {
    id: crypto.randomUUID(),
    item_id: data.items[0].id,
    kind: "edit",
    threshold: 19,
    created_at: new Date(base - 1000).toISOString(),
    source: "synced_offline",
  });
  assert.equal(edited.items[0].low_stock_threshold, 19);
  assert.equal(edited.items[0].quantity, 26);
});
test("category nesting rejects cycles and preserves valid offline additions", () => {
  const data = demoSnapshot(),
    child = crypto.randomUUID();
  const nested = applyMutation(data, {
    id: crypto.randomUUID(),
    item_id: child,
    kind: "category",
    category: {
      id: child,
      name: "Nested paper",
      parent_id: data.categories[0].id,
    },
    created_at: new Date().toISOString(),
    source: "synced_offline",
  });
  assert.equal(nested.categories.at(-1)?.parent_id, data.categories[0].id);
  assert.throws(
    () =>
      applyMutation(nested, {
        id: crypto.randomUUID(),
        item_id: data.categories[0].id,
        kind: "category",
        category: { ...data.categories[0], parent_id: child },
        created_at: new Date().toISOString(),
        source: "online",
      }),
    /nested inside itself/,
  );
});
