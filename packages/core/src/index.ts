export type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  updated_at?: string;
};
export type CatalogItem = {
  id: string;
  name: string;
  category_id: string;
  image_url?: string | null;
  updated_at?: string;
};
export type Item = {
  id: string;
  company_id: string;
  catalog_item_id: string;
  quantity: number;
  low_stock_threshold: number;
  updated_at: string;
  metadata_updated_at?: string;
  archived_at: string | null;
};
export type StockEvent = {
  id: string;
  item_id: string;
  delta: number;
  new_quantity: number;
  created_at: string;
  created_by: string;
  source: "online" | "synced_offline";
};
export type Profile = {
  id: string;
  company_id: string;
  name: string;
  email: string;
  device_info: string;
};
export type Mutation = {
  id: string;
  item_id: string;
  created_at: string;
  source: "online" | "synced_offline";
} & (
  | { kind: "category"; category: Category }
  | {
      kind: "add";
      catalog: CatalogItem;
      threshold: number;
      delta: number;
      photo?: string;
    }
  | { kind: "adjust"; delta: number }
  | { kind: "edit"; threshold: number; catalog?: CatalogItem }
  | { kind: "archive"; archived: boolean }
);
export type Snapshot = {
  company: { id: string; name: string };
  profile: Profile;
  categories: Category[];
  catalog: CatalogItem[];
  items: Item[];
  events: StockEvent[];
  queue: Mutation[];
  lastSynced: string | null;
};
export interface Persistence {
  load(): Promise<Snapshot | null>;
  save(data: Snapshot): Promise<void>;
  clear(): Promise<void>;
}
export interface Remote {
  pull(): Promise<Omit<Snapshot, "queue" | "lastSynced">>;
  push(mutation: Mutation): Promise<void>;
}
export const uuid = () => globalThis.crypto.randomUUID();
export const isLow = (item: Item) => item.quantity < item.low_stock_threshold;
export function validateQuantity(value: number, label = "Quantity") {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000000)
    throw new Error(`${label} must be a whole number between 0 and 1,000,000.`);
}
export function catalogMatches(catalog: CatalogItem[], query: string) {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const q = normalize(query);
  if (!q) return [];
  return catalog
    .map((item) => {
      const n = normalize(item.name);
      const words = query.toLowerCase().split(/\s+/);
      return {
        item,
        score:
          n === q
            ? 100
            : n.includes(q)
              ? 80
              : (words.filter((w) => item.name.toLowerCase().includes(w))
                  .length /
                  words.length) *
                60,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
    .slice(0, 6);
}
export function applyMutation(snapshot: Snapshot, op: Mutation): Snapshot {
  const next: Snapshot = JSON.parse(JSON.stringify(snapshot));
  if (op.kind === "category") {
    if (!op.category.name.trim() || op.category.name.length > 120)
      throw new Error("Enter a category name under 120 characters.");
    let parent = op.category.parent_id;
    const visited = new Set<string>([op.category.id]);
    while (parent) {
      if (visited.has(parent))
        throw new Error("A category cannot be nested inside itself.");
      visited.add(parent);
      const ancestor = next.categories.find((c) => c.id === parent);
      if (!ancestor) throw new Error("Choose an existing parent category.");
      parent = ancestor.parent_id;
    }
    const existing = next.categories.find((c) => c.id === op.category.id);
    if (!existing)
      next.categories.push({
        ...op.category,
        name: op.category.name.trim(),
        updated_at: op.created_at,
      });
    else if (!existing.updated_at || op.created_at >= existing.updated_at)
      Object.assign(existing, {
        ...op.category,
        name: op.category.name.trim(),
        updated_at: op.created_at,
      });
    return next;
  }
  let item = next.items.find((i) => i.id === op.item_id);
  if (op.kind === "add") {
    validateQuantity(op.delta);
    validateQuantity(op.threshold, "Threshold");
    if (!next.catalog.some((c) => c.id === op.catalog.id))
      next.catalog.push({
        ...op.catalog,
        image_url: op.photo ?? op.catalog.image_url,
      });
    if (!item) {
      item = {
        id: op.item_id,
        company_id: next.company.id,
        catalog_item_id: op.catalog.id,
        quantity: 0,
        low_stock_threshold: op.threshold,
        updated_at: op.created_at,
        archived_at: null,
      };
      next.items.push(item);
    }
  }
  if (!item)
    throw new Error(
      "This item is no longer available. Refresh your inventory.",
    );
  item.metadata_updated_at ??= item.updated_at;
  if (op.kind === "adjust" || op.kind === "add") {
    if (
      !Number.isSafeInteger(op.delta) ||
      Math.abs(op.delta) > 1000000 ||
      (op.kind === "adjust" && op.delta === 0)
    )
      throw new Error("Enter a nonzero whole stock change.");
    if (next.events.some((e) => e.id === op.id)) return next;
    // Negative balances are preserved when concurrent offline deductions exceed stock.
    item.quantity += op.delta;
    next.events.unshift({
      id: op.id,
      item_id: item.id,
      delta: op.delta,
      new_quantity: item.quantity,
      created_at: op.created_at,
      created_by: next.profile.id,
      source: op.source,
    });
  } else if (op.created_at >= (item.metadata_updated_at ?? item.updated_at)) {
    if (op.kind === "edit") {
      validateQuantity(op.threshold, "Threshold");
      item.low_stock_threshold = op.threshold;
      if (op.catalog) {
        if (!op.catalog.name.trim()) throw new Error("Give your item a name.");
        const catalog = next.catalog.find(
          (c) => c.id === item!.catalog_item_id,
        );
        if (
          catalog &&
          (!catalog.updated_at || op.created_at >= catalog.updated_at)
        )
          Object.assign(catalog, {
            name: op.catalog.name.trim(),
            category_id: op.catalog.category_id,
            updated_at: op.created_at,
          });
      }
    }
    if (op.kind === "archive")
      item.archived_at = op.archived ? op.created_at : null;
    item.metadata_updated_at = op.created_at;
  }
  item.updated_at =
    op.created_at > item.updated_at ? op.created_at : item.updated_at;
  return next;
}
export class InventoryStore {
  private serial: Promise<unknown> = Promise.resolve();
  constructor(
    private persistence: Persistence,
    private remote?: Remote,
  ) {}
  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    const run = this.serial.then(job, job);
    this.serial = run.catch(() => {});
    return run;
  }
  load() {
    return this.persistence.load();
  }
  initialize(data: Snapshot) {
    return this.exclusive(() => this.persistence.save(data));
  }
  mutate(op: Mutation) {
    return this.exclusive(async () => {
      const snapshot = await this.load();
      if (!snapshot) throw new Error("Sign in first.");
      if (
        snapshot.queue.some((q) => q.id === op.id) ||
        snapshot.events.some((e) => e.id === op.id)
      )
        return snapshot;
      const next = applyMutation(snapshot, op);
      if (this.remote) next.queue.push(op);
      await this.persistence.save(next);
      return next;
    });
  }
  sync() {
    return this.exclusive(async () => {
      if (!this.remote) return this.load();
      let snapshot = await this.load();
      if (snapshot)
        for (const op of [...snapshot.queue]) {
          await this.remote.push(op);
          snapshot.queue = snapshot.queue.filter((q) => q.id !== op.id);
          // Keep acknowledged operations until a pull succeeds, so a network failure
          // cannot erase optimistic changes or leave an operation unaccounted for.
          await this.persistence.save(snapshot);
        }
      const fresh = await this.remote.pull();
      if (snapshot && fresh.company.id !== snapshot.company.id)
        throw new Error(
          "Company changed. Sign out before switching companies.",
        );
      const next: Snapshot = {
        ...fresh,
        queue: snapshot?.queue ?? [],
        lastSynced: new Date().toISOString(),
      };
      await this.persistence.save(next);
      return next;
    });
  }
}
const catIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
];
export function demoSnapshot(): Snapshot {
  const companyId = "20000000-0000-4000-8000-000000000001";
  const names = [
    "Printer paper A4",
    "Black ink cartridge",
    "Ballpoint pens",
    "Desk stapler",
    "Sticky notes",
    "Manila folders",
    "Packing tape",
    "Whiteboard markers",
  ];
  const quantities = [24, 3, 48, 12, 6, 32, 4, 18],
    thresholds = [10, 5, 20, 4, 10, 10, 5, 8];
  const categories = [0, 1, 2, 2, 0, 3, 3, 2];
  const now = new Date().toISOString();
  const catalog = names.map((name, i) => ({
    id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    name,
    category_id: catIds[categories[i]],
  }));
  const items = catalog.map((c, i) => ({
    id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    company_id: companyId,
    catalog_item_id: c.id,
    quantity: quantities[i],
    low_stock_threshold: thresholds[i],
    updated_at: now,
    archived_at: null,
  }));
  return {
    company: { id: companyId, name: "Studio North" },
    profile: {
      id: "50000000-0000-4000-8000-000000000001",
      company_id: companyId,
      name: "Alex",
      email: "alex@example.com",
      device_info: "This device",
    },
    categories: catIds.map((id, i) => ({
      id,
      name: [
        "Paper & notes",
        "Ink & toner",
        "Desk essentials",
        "Filing & packing",
      ][i],
      parent_id: null,
    })),
    catalog,
    items,
    events: items.map((item, i) => ({
      id: `60000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      item_id: item.id,
      delta: item.quantity,
      new_quantity: item.quantity,
      created_at: now,
      created_by: "50000000-0000-4000-8000-000000000001",
      source: "online",
    })),
    queue: [],
    lastSynced: null,
  };
}
export function csvExport(snapshot: Snapshot) {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return [
    ["Item", "Category", "Quantity", "Low stock threshold"],
    ...snapshot.items
      .filter((i) => !i.archived_at)
      .map((i) => {
        const c = snapshot.catalog.find((c) => c.id === i.catalog_item_id);
        return [
          c?.name,
          snapshot.categories.find((cat) => cat.id === c?.category_id)?.name,
          i.quantity,
          i.low_stock_threshold,
        ];
      }),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}

export function inventoryReportHtml(data: Snapshot) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  const active = data.items.filter((item) => !item.archived_at);
  const rows = active
    .map((item) => {
      const catalog = data.catalog.find((c) => c.id === item.catalog_item_id);
      const category = data.categories.find(
        (c) => c.id === catalog?.category_id,
      );
      return `<tr><td class="supply">${escape(catalog?.name ?? "Supply")}</td><td>${escape(category?.name ?? "Supplies")}</td><td class="number">${item.quantity}</td><td class="number">${item.low_stock_threshold}</td><td><span class="status ${isLow(item) ? "low" : ""}">${isLow(item) ? "Low stock" : "In stock"}</span></td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 22mm 14mm; }
    * { box-sizing: border-box; } body { margin: 0; font-family: Arial, sans-serif; color: #102B53; font-size: 12px; }
    header { background: #334EAC; color: #FFF9F0; padding: 24px; border-radius: 16px; }
    header h1 { font-size: 30px; margin: 0 0 6px; } header p { margin: 0; }
    h2 { font-size: 22px; margin: 26px 0 8px; overflow-wrap: anywhere; }
    .date, footer { color: #69788D; } .summary { display: table; width: 100%; margin: 22px 0; table-layout: fixed; border-spacing: 6px 0; }
    .summary div { display: table-cell; background: #F0F6FB; padding: 16px; border-radius: 10px; color: #334EAC; }
    .summary div:last-child { background: #FFF1E6; color: #B95027; } .summary strong { display: block; font-size: 24px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; } thead { display: table-header-group; }
    th { background: #334EAC; color: white; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; text-align: left; }
    td, th { padding: 12px 9px; border-bottom: 1px solid #E5E8E9; overflow-wrap: anywhere; } tr { break-inside: avoid; }
    tbody tr:nth-child(even) { background: #F5F8FC; } .supply { font-weight: bold; } .number { text-align: right; }
    .status { color: #334EAC; font-weight: bold; } .status.low { color: #B95027; }
    footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #BAD6EB; font-size: 10px; }
  </style></head><body><header><h1>stocket.</h1><p>A little order, everywhere.</p></header>
  <h2>${escape(data.company.name)}</h2><p class="date">Inventory report · ${escape(new Date().toLocaleDateString())}</p>
  <section class="summary"><div><strong>${active.length}</strong>Supplies</div><div><strong>${active.reduce((n, item) => n + item.quantity, 0)}</strong>Units in stock</div><div><strong>${active.filter(isLow).length}</strong>Need a top-up</div></section>
  <table><colgroup><col style="width:32%"><col style="width:23%"><col style="width:13%"><col style="width:15%"><col style="width:17%"></colgroup><thead><tr><th>Supply</th><th>Category</th><th class="number">In stock</th><th class="number">Threshold</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No active supplies yet. Add an item to start your stock report.</td></tr>'}</tbody></table>
  <footer>Low stock means quantity is below its threshold. Active supplies only. Generated on this device with Stocket.</footer></body></html>`;
}
