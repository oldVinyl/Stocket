"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  Bell,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  CloudOff,
  FileText,
  Folder,
  Grid2X2,
  History,
  LayoutDashboard,
  List,
  LoaderCircle,
  LogOut,
  Minus,
  Moon,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  catalogMatches,
  csvExport,
  demoSnapshot,
  isLow,
  uuid,
  type CatalogItem,
  type InventoryStore,
  type Item,
  type Mutation,
  type Snapshot,
} from "@stocket/core";
import { createStore, request } from "@/lib/local";
import PasskeyButton from "./passkey-button";
import SupplyPhoto from "./supply-photo";
import CategoryManager from "./category-manager";
import { jsPDF } from "jspdf";
type Tab = "Overview" | "Inventory" | "Categories" | "Activity" | "Settings";
type Modal =
  | { kind: "add" }
  | { kind: "adjust" | "edit"; item: Item }
  | { kind: "login" }
  | { kind: "help" }
  | null;
const icons = [FileText, Box, Pencil, Folder];
function SupplyArt({
  name,
  category,
  small = false,
}: {
  name: string;
  category: number;
  small?: boolean;
}) {
  return (
    <div
      className={`supply-art art-${category % 4} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 180 130" fill="none">
        <ellipse cx="93" cy="112" rx="52" ry="7" fill="#102B53" opacity=".08" />
        {category === 0 ? (
          <>
            <path
              d="m48 39 66-11 27 20-65 13z"
              fill="#fff"
              stroke="#799EBF"
              strokeWidth="2"
            />
            <path
              d="M48 39v53l28 19V61z"
              fill="#DCE8F2"
              stroke="#799EBF"
              strokeWidth="2"
            />
            <path
              d="m76 61 65-13v52l-65 11z"
              fill="#fff"
              stroke="#799EBF"
              strokeWidth="2"
            />
            <path
              d="m80 73 52-10m-52 20 52-10m-52 20 52-10"
              stroke="#BAD6EB"
              strokeWidth="2"
            />
            <path d="m49 59 27 19v13L49 73z" fill="#334EAC" />
            <path d="m76 78 65-13v13L76 91z" fill="#334EAC" />
            <text
              x="91"
              y="50"
              fill="#334EAC"
              fontSize="12"
              transform="rotate(-10 91 50)"
            >
              A4
            </text>
          </>
        ) : category === 1 ? (
          <>
            <path d="m56 43 48-14 25 19-48 14z" fill="#496499" />
            <path d="M56 43v57l25 14V62z" fill="#102B53" />
            <path d="m81 62 48-14v55l-48 11z" fill="#334EAC" />
            <path d="m90 75 29-8v22l-29 8z" fill="#FFF9F0" />
            <path d="m68 32 27-8v9l-27 8z" fill="#102B53" />
            <path
              d="m94 80 19-5m-19 10 15-4"
              stroke="#102B53"
              strokeWidth="3"
            />
          </>
        ) : category === 2 ? (
          <>
            <path
              d="m49 98 52-65"
              stroke="#102B53"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <path d="m66 77 27-34" stroke="#CEB5D4" strokeWidth="14" />
            <path
              d="m79 104 42-67"
              stroke="#334EAC"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path d="m94 80 18-28" stroke="#BAD6EB" strokeWidth="13" />
            <path d="m48 100-7 10 12-5m26 1-3 10 10-6" fill="#D9B899" />
            <path
              d="m100 32 5-7m16 12 5-8"
              stroke="#102B53"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <path
              d="M40 49h45l9 9h47v48H40z"
              fill="#C69B69"
              stroke="#A27E54"
              strokeWidth="2"
            />
            <path
              d="M44 43h44l8 10h42v42H44z"
              fill="#FFFCF5"
              stroke="#B9CFDD"
              strokeWidth="2"
            />
            <path
              d="M40 61h101l-12 47H30z"
              fill="#E8BE8A"
              stroke="#A27E54"
              strokeWidth="2"
            />
            <path
              d="M53 77h37"
              stroke="#FFF9F0"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      <span className="art-caption">
        {name.split(" ").slice(0, 2).join(" ")}
      </span>
    </div>
  );
}
export default function Dashboard() {
  const [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState<Tab>("Inventory"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [status, setStatus] = useState("all"),
    [view, setView] = useState("grid"),
    [modal, setModal] = useState<Modal>(null),
    [menu, setMenu] = useState<string | null>(null),
    [online, setOnline] = useState(true),
    [syncing, setSyncing] = useState(false),
    [connected, setConnected] = useState(false),
    [dark, setDark] = useState(false),
    [sort, setSort] = useState("name"),
    [loadingError, setLoadingError] = useState("");
  const [syncFailure, setSyncFailure] = useState("");
  const storeRef = useRef<InventoryStore | null>(null),
    identityRef = useRef("demo");
  const sync = useCallback(async (quiet = false) => {
    if (!storeRef.current) return;
    setSyncing(true);
    try {
      const pending =
        (await storeRef.current.load())?.queue.filter(
          (q) => q.source === "synced_offline",
        ).length ?? 0;
      const next = await storeRef.current.sync();
      if (next) setData(next);
      setSyncFailure("");
      if (pending)
        toast.success(
          `${pending} offline ${pending === 1 ? "change is" : "changes are"} back in sync.`,
        );
      if (!quiet) toast.success("Everything is up to date.");
    } catch (e) {
      setSyncFailure((e as Error).message);
      if (!quiet) toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, []);
  const boot = useCallback(async () => {
    try {
      let auth: { user: { id: string } | null; profile?: unknown } = {
        user: null,
      };
      if (!navigator.onLine) {
        const known = localStorage.getItem("stocket-user");
        if (known) auth = { user: { id: known }, profile: true };
      } else {
        try {
          auth = await request("/api/auth");
        } catch (e) {
          const known = localStorage.getItem("stocket-user");
          if (!known) throw e;
          auth = { user: { id: known }, profile: true };
        }
        if (auth.user) localStorage.setItem("stocket-user", auth.user.id);
        else localStorage.removeItem("stocket-user");
      }
      if (auth.user && !auth.profile) {
        setConnected(true);
        setModal({ kind: "login" });
        return;
      }
      const mode = auth.user ? "connected" : "demo";
      identityRef.current = auth.user?.id ?? "demo";
      setConnected(!!auth.user);
      const { store } = createStore(mode, identityRef.current);
      storeRef.current = store;
      let snapshot = await store.load();
      if (!snapshot && mode === "demo") {
        snapshot = demoSnapshot();
        await store.initialize(snapshot);
      }
      setData(snapshot);
      if (mode === "connected" && navigator.onLine) await sync(true);
    } catch (e) {
      setLoadingError((e as Error).message);
    }
  }, [sync]);
  useEffect(() => {
    void boot();
    setOnline(navigator.onLine);
    const saved = localStorage.getItem("stocket-theme") === "dark";
    setDark(saved);
    document.documentElement.dataset.theme = saved ? "dark" : "light";
    if (new URLSearchParams(location.search).has("authError"))
      toast.error("That sign-in link expired. Request a fresh one.");
  }, [boot]);
  useEffect(() => {
    const on = () => {
        setOnline(true);
        if (connected) void sync();
      },
      off = () => {
        setOnline(false);
        toast.message("You’re offline. Changes stay safe on this device.");
      };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const timer = setInterval(() => {
      if (connected && navigator.onLine) void sync(true);
    }, 30000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(timer);
    };
  }, [connected, sync]);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);
  async function mutate(
    fields:
      Omit<Mutation, "id" | "created_at" | "source"> | Record<string, unknown>,
  ) {
    if (!storeRef.current) return;
    const op = {
      ...fields,
      id: uuid(),
      created_at: new Date().toISOString(),
      source: online ? "online" : "synced_offline",
    } as Mutation;
    const next = await storeRef.current.mutate(op);
    setData(next);
    if (connected && online) void sync(true);
    return next;
  }
  async function remove(item: Item) {
    try {
      await mutate({ kind: "archive", item_id: item.id, archived: true });
      toast("Item removed from inventory", {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => {
            void mutate({ kind: "archive", item_id: item.id, archived: false })
              .then(() => toast.success("Item restored."))
              .catch((e) => toast.error(e.message));
          },
        },
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function exportData(format: "csv" | "pdf") {
    if (!data) return;
    try {
      if (format === "csv") {
        const a = document.createElement("a"),
          url = URL.createObjectURL(
            new Blob(["\uFEFF" + csvExport(data)], {
              type: "text/csv;charset=utf-8",
            }),
          );
        a.href = url;
        a.download = "stocket-inventory.csv";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const pdf = new jsPDF();
        pdf.setTextColor("#102B53");
        pdf.setFontSize(22);
        pdf.text("Stocket · Inventory", 18, 22);
        pdf.setFontSize(12);
        pdf.text(
          `${data.company.name} · ${new Date().toLocaleDateString()}`,
          18,
          32,
        );
        let y = 48;
        for (const i of data.items.filter((i) => !i.archived_at)) {
          const c = data.catalog.find((c) => c.id === i.catalog_item_id);
          const lines = pdf.splitTextToSize(
            `${c?.name ?? "Item"} — ${i.quantity} in stock / alert below ${i.low_stock_threshold}`,
            170,
          );
          if (y + lines.length * 7 > 275) {
            pdf.addPage();
            y = 22;
          }
          pdf.text(lines, 18, y);
          y += lines.length * 7 + 6;
        }
        pdf.save("stocket-inventory.pdf");
      }
      toast.success("Your inventory export is ready.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("stocket-theme", next ? "dark" : "light");
  }
  const active = data?.items.filter((i) => !i.archived_at) ?? [],
    low = active.filter(isLow),
    total = active.reduce((n, i) => n + i.quantity, 0);
  const filtered = active
    .filter((i) => {
      const c = data?.catalog.find((c) => c.id === i.catalog_item_id);
      return (
        c?.name.toLowerCase().includes(query.toLowerCase()) &&
        (category === "all" || c?.category_id === category) &&
        (status === "all" || (status === "low" ? isLow(i) : !isLow(i)))
      );
    })
    .sort((a, b) =>
      sort === "quantity"
        ? b.quantity - a.quantity
        : (
            data?.catalog.find((c) => c.id === a.catalog_item_id)?.name ?? ""
          ).localeCompare(
            data?.catalog.find((c) => c.id === b.catalog_item_id)?.name ?? "",
          ),
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Stocket home">
          <span className="brand-mark">
            <Wallet size={25} strokeWidth={2.2} />
          </span>
          stocket<span className="brand-dot">.</span>
        </a>
        <span className="brand-tag">A little order, everywhere.</span>
        <div className="workspace">
          <span className="workspace-avatar">
            {data?.company.name
              .split(" ")
              .map((w) => w[0])
              .join("") ?? "S"}
          </span>
          <div>
            <strong>{data?.company.name ?? "Your workspace"}</strong>
            <small>{connected ? "Company workspace" : "Demo workspace"}</small>
          </div>
          <ShieldCheck size={17} />
        </div>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav>
          {(
            [
              ["Overview", LayoutDashboard],
              ["Inventory", Package],
              ["Categories", Grid2X2],
              ["Activity", History],
            ] as const
          ).map(([label, Icon]) => (
            <button
              key={label}
              className={`nav-link ${tab === label ? "active" : ""}`}
              onClick={() => {
                setTab(label);
                setQuery("");
              }}
            >
              <Icon size={21} />
              <span>{label}</span>
              {label === "Inventory" && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="pocket-card">
            <span className="mini-orbit">
              <Smartphone size={29} />
              <span>✦</span>
            </span>
            <strong>Your stock. Your pocket.</strong>
            <p>
              Keep things moving,
              <br />
              wherever work takes you.
            </p>
            <button onClick={() => setModal({ kind: "help" })}>
              Meet your pocket companion <ArrowRight size={16} />
            </button>
          </div>
          <button
            className={`nav-link ${tab === "Settings" ? "active" : ""}`}
            onClick={() => setTab("Settings")}
          >
            <Settings size={20} />
            Settings
          </button>
          <button
            className="nav-link"
            onClick={() => setModal({ kind: "help" })}
          >
            <CircleHelp size={20} />
            Help & getting started
          </button>
          <div className="profile">
            <span className="avatar">
              {data?.profile.name.slice(0, 1) ?? "?"}
            </span>
            <div>
              <strong>{data?.profile.name ?? "Welcome"}</strong>
              <small>{connected ? "Team member" : "Exploring Stocket"}</small>
            </div>
            <button
              className="icon-btn"
              aria-label="Account settings"
              onClick={() => setTab("Settings")}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{tab}</strong>
          </div>
          <div className="top-actions">
            <button
              className={`sync-label ${!online ? "offline" : ""}`}
              onClick={() => void sync()}
              disabled={syncing}
              title={
                connected
                  ? "Sync inventory"
                  : "Demo is stored only on this device"
              }
            >
              {syncing ? (
                <LoaderCircle size={16} className="spin" />
              ) : online ? (
                <Cloud size={17} />
              ) : (
                <CloudOff size={17} />
              )}
              <span>
                {syncing
                  ? "Syncing…"
                  : !online
                    ? "Offline"
                    : connected
                      ? data?.queue.length
                        ? `${data.queue.length} pending`
                        : "All changes synced"
                      : "Saved on this device"}
              </span>
            </button>
            <span className="top-divider" />
            <button
              className="icon-btn"
              aria-label="Toggle dark mode"
              onClick={toggleTheme}
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              className="notification icon-btn"
              aria-label={`${low.length} low stock alerts`}
              onClick={() => {
                setTab("Inventory");
                setStatus("low");
              }}
            >
              <Bell size={21} />
              {low.length > 0 && <i />}
            </button>
            <span className="avatar top-avatar">
              {data?.profile.name.slice(0, 1) ?? "?"}
            </span>
          </div>
        </header>
        <main>
          {!connected && (
            <div className="demo-banner">
              <span>
                <Sparkles size={15} />
                You’re in the local demo. Make yourself at home.
              </span>
              <button onClick={() => setModal({ kind: "login" })}>
                Connect your company <ArrowRight size={15} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">LESS SEARCHING. MORE DOING.</div>
              <h1>
                {tab === "Inventory"
                  ? "Your inventory"
                  : tab === "Overview"
                    ? `Hello, ${data?.profile.name ?? "there"} ☀`
                    : tab === "Categories"
                      ? "A place for everything"
                      : tab === "Activity"
                        ? "The little things, logged"
                        : "Make yourself at home"}
              </h1>
              <p>
                {tab === "Inventory"
                  ? "Everything your team needs, all in one happy place."
                  : tab === "Overview"
                    ? "A little check-in on the things that keep your office going."
                    : tab === "Categories"
                      ? "A shared catalog that gets a little better with every team."
                      : tab === "Activity"
                        ? "A simple history of what came in and what went out."
                        : "Your workspace, your preferences, your pocket companion."}
              </p>
            </div>
            {(tab === "Inventory" || tab === "Overview") && (
              <div className="heading-actions">
                <div className="export-wrap">
                  <button
                    className="button secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(menu === "export" ? null : "export");
                    }}
                  >
                    <ArrowDownToLine size={18} />
                    Export
                    <ChevronDown size={15} />
                  </button>
                  {menu === "export" && (
                    <div className="dropdown">
                      <button onClick={() => void exportData("csv")}>
                        <FileText size={17} />
                        Download CSV
                      </button>
                      <button onClick={() => void exportData("pdf")}>
                        <FileText size={17} />
                        Download PDF
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal({ kind: "add" })}
                  disabled={!data}
                >
                  <Plus size={19} />
                  Add item
                </button>
              </div>
            )}
          </div>
          {syncFailure && (
            <div className="low-banner">
              <CloudOff size={18} />
              <p>
                <strong>Your changes are saved here.</strong> Sync needs
                attention: {syncFailure}
              </p>
              <button onClick={() => void sync()}>
                Try sync again <ArrowRight size={16} />
              </button>
            </div>
          )}
          {loadingError && (
            <div className="error-state">
              {loadingError}
              <button onClick={() => void boot()}>Try again</button>
            </div>
          )}
          {!data && !loadingError && (
            <div className="empty">
              <LoaderCircle className="spin" />
              <h2>
                {connected
                  ? "Finish signing in to open your stock."
                  : "Getting your workspace ready…"}
              </h2>
              <button
                className="button primary"
                onClick={() => setModal({ kind: "login" })}
              >
                Sign in
              </button>
            </div>
          )}
          {data && (tab === "Inventory" || tab === "Overview") && (
            <>
              <section className="stats">
                <div className="stat">
                  <span className="stat-icon blue">
                    <Package size={22} />
                  </span>
                  <div>
                    <span>Total items</span>
                    <strong>
                      {active.length}
                      <small>distinct supplies</small>
                    </strong>
                  </div>
                  <span className="stat-dots">···</span>
                </div>
                <div className="stat">
                  <span className="stat-icon lavender">
                    <Box size={22} />
                  </span>
                  <div>
                    <span>Units in stock</span>
                    <strong>
                      {total.toLocaleString()}
                      <small>ready for your team</small>
                    </strong>
                  </div>
                </div>
                <button
                  className={`stat low-stat ${status === "low" ? "selected" : ""}`}
                  onClick={() => {
                    setTab("Inventory");
                    setStatus(status === "low" ? "all" : "low");
                  }}
                >
                  <span className="stat-icon peach">
                    <TriangleAlert size={22} />
                  </span>
                  <div>
                    <span>Running a little low</span>
                    <strong>
                      {low.length}
                      <small>need a top-up</small>
                    </strong>
                  </div>
                  <ArrowRight size={18} />
                </button>
              </section>
              {low.length > 0 && (
                <div className="low-banner">
                  <span className="low-banner-icon">
                    <TriangleAlert size={19} />
                  </span>
                  <p>
                    <strong>A little heads-up.</strong> {low.length}{" "}
                    {low.length === 1 ? "item is" : "items are"} below{" "}
                    {low.length === 1 ? "its" : "their"} stock threshold. Time
                    for a top-up?
                  </p>
                  <button
                    onClick={() => {
                      setTab("Inventory");
                      setStatus("low");
                    }}
                  >
                    View low stock <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <section className="inventory-section">
                <div className="section-title">
                  <h2>
                    {status === "low" ? "Needs a little love" : "All supplies"}{" "}
                    <span>{filtered.length}</span>
                  </h2>
                  <span className="section-note">
                    Small supplies. Big difference.
                  </span>
                </div>
                <div className="toolbar">
                  <label className="search">
                    <Search size={19} />
                    <input
                      placeholder="Find something in your stock…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Search inventory"
                    />
                    {query && (
                      <button
                        className="icon-btn"
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </label>
                  <select
                    aria-label="Filter category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="all">All categories</option>
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter stock status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">All stock levels</option>
                    <option value="low">Low stock</option>
                    <option value="healthy">In stock</option>
                  </select>
                  <div className="view-toggle">
                    <button
                      className={view === "grid" ? "selected" : ""}
                      aria-label="Grid view"
                      onClick={() => setView("grid")}
                    >
                      <Grid2X2 size={18} />
                    </button>
                    <button
                      className={view === "list" ? "selected" : ""}
                      aria-label="List view"
                      onClick={() => setView("list")}
                    >
                      <List size={20} />
                    </button>
                  </div>
                </div>
                <div className="results-line">
                  <span>
                    {query
                      ? `Results for “${query}”`
                      : `Showing ${filtered.length} ${filtered.length === 1 ? "item" : "items"}`}
                  </span>
                  <label>
                    Sort by:{" "}
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      aria-label="Sort inventory"
                    >
                      <option value="name">Name (A–Z)</option>
                      <option value="quantity">Quantity</option>
                    </select>
                  </label>
                </div>
                {filtered.length === 0 ? (
                  <div className="empty">
                    <span className="empty-icon">
                      <Package size={36} />
                    </span>
                    <h2>
                      {active.length
                        ? "Nothing in this pocket."
                        : "Let’s stock your first item."}
                    </h2>
                    <p>
                      {active.length
                        ? "Try a different search or clear your filters."
                        : `A fresh start, ${data.profile.name}. Add a supply to get going.`}
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        if (active.length) {
                          setQuery("");
                          setCategory("all");
                          setStatus("all");
                        } else setModal({ kind: "add" });
                      }}
                    >
                      {active.length ? "Clear filters" : "Add your first item"}
                    </button>
                  </div>
                ) : (
                  <div
                    className={`item-grid ${view === "list" ? "list-view" : ""}`}
                  >
                    {filtered.map((item) => {
                      const c = data.catalog.find(
                        (c) => c.id === item.catalog_item_id,
                      )!;
                      const cat = data.categories.find(
                        (cat) => cat.id === c.category_id,
                      );
                      const catIndex = data.categories.findIndex(
                        (cat) => cat.id === c.category_id,
                      );
                      const pending = data.queue.some(
                        (q) => q.item_id === item.id,
                      );
                      return (
                        <article className="item-card" key={item.id}>
                          <div className="card-art">
                            <SupplyPhoto
                              path={c.image_url}
                              fallback={
                                <SupplyArt
                                  name={c.name}
                                  category={catIndex < 0 ? 2 : catIndex}
                                />
                              }
                            />
                            <span
                              className={`stock-badge ${isLow(item) ? "warning" : ""}`}
                            >
                              {isLow(item) ? (
                                <>
                                  <span />
                                  Low stock
                                </>
                              ) : (
                                <>
                                  <span />
                                  In stock
                                </>
                              )}
                            </span>
                            <div className="card-menu">
                              <button
                                className="icon-btn"
                                aria-label={`Options for ${c.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenu(menu === item.id ? null : item.id);
                                }}
                              >
                                <MoreHorizontal size={21} />
                              </button>
                              {menu === item.id && (
                                <div
                                  className="dropdown"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      setModal({ kind: "edit", item });
                                      setMenu(null);
                                    }}
                                  >
                                    <Pencil size={16} />
                                    Edit threshold
                                  </button>
                                  {connected && (
                                    <button
                                      onClick={() => {
                                        const reason = prompt(
                                          "What should we fix about this catalog item?",
                                        );
                                        if (reason)
                                          void request("/api/catalog", {
                                            method: "POST",
                                            body: JSON.stringify({
                                              action: "report",
                                              catalog_id: c.id,
                                              reason,
                                            }),
                                          })
                                            .then(() =>
                                              toast.success(
                                                "Thanks for helping keep the catalog useful.",
                                              ),
                                            )
                                            .catch((e) =>
                                              toast.error(e.message),
                                            );
                                        setMenu(null);
                                      }}
                                    >
                                      <TriangleAlert size={16} />
                                      Report catalog item
                                    </button>
                                  )}
                                  <button
                                    className="danger"
                                    onClick={() => {
                                      void remove(item);
                                      setMenu(null);
                                    }}
                                  >
                                    <Trash2 size={16} />
                                    Remove item
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="card-content">
                            <span className="category-label">
                              {cat?.name ?? "Supplies"}
                            </span>
                            <h3>{c.name}</h3>
                            <div className="stock-row">
                              <strong
                                className={isLow(item) ? "warning-text" : ""}
                              >
                                {item.quantity}
                                <span>in stock</span>
                              </strong>
                              <small>Min. {item.low_stock_threshold}</small>
                            </div>
                            <div
                              className={`stock-meter ${isLow(item) ? "low" : ""}`}
                            >
                              <span
                                style={{
                                  width: `${Math.min(100, Math.max(4, (item.quantity / Math.max(item.low_stock_threshold * 4, 1)) * 100))}%`,
                                }}
                              />
                            </div>
                            <button
                              className="adjust-button"
                              onClick={() => setModal({ kind: "adjust", item })}
                            >
                              <span>
                                {pending ? (
                                  <CloudOff size={16} />
                                ) : (
                                  <Plus size={16} />
                                )}
                                Adjust stock
                              </span>
                              <ArrowRight size={16} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                <div className="inventory-footer">
                  <span>
                    <ShieldCheck size={15} />
                    {connected
                      ? "Only your company can see these stock levels."
                      : "Demo stock is private to this browser."}
                  </span>
                  <span>
                    Made for the everyday essentials{" "}
                    <span className="footer-spark">✦</span>
                  </span>
                </div>
              </section>
            </>
          )}
          {data && tab === "Categories" && (
            <section className="category-grid">
              {data.categories.map((cat, i) => {
                const Icon = icons[i % 4];
                return (
                  <button
                    className={`category-card art-${i % 4}`}
                    key={cat.id}
                    onClick={() => {
                      setCategory(cat.id);
                      setTab("Inventory");
                    }}
                  >
                    <Icon size={34} />
                    <h2>{cat.name}</h2>
                    <p>
                      {
                        active.filter(
                          (item) =>
                            data.catalog.find(
                              (c) => c.id === item.catalog_item_id,
                            )?.category_id === cat.id,
                        ).length
                      }{" "}
                      items in your stock
                    </p>
                    <ArrowRight size={20} />
                  </button>
                );
              })}
              <button
                className="category-card add-category"
                onClick={() => {
                  const name = prompt("Name your new category");
                  if (!name?.trim()) return;
                  const c = { id: uuid(), name: name.trim(), parent_id: null };
                  void mutate({ kind: "category", item_id: c.id, category: c })
                    .then(() => toast.success("A new place for your supplies."))
                    .catch((e) => toast.error(e.message));
                }}
              >
                <Plus size={34} />
                <h2>Create a category</h2>
                <p>Keep your catalog organized.</p>
              </button>
            </section>
          )}
          {data && tab === "Categories" && (
            <CategoryManager
              categories={data.categories}
              onSave={(c) =>
                mutate({ kind: "category", item_id: c.id, category: c })
              }
            />
          )}
          {data && tab === "Activity" && (
            <section className="activity-panel">
              <div className="section-title">
                <h2>Recent stock changes</h2>
                <span className="section-note">Latest 200 synced events</span>
              </div>
              {data.events.length === 0 ? (
                <div className="empty">
                  <History size={36} />
                  <h2>Your story starts here.</h2>
                  <p>Stock changes will appear here as your team gets going.</p>
                </div>
              ) : (
                data.events.map((event) => {
                  const item = data.items.find((i) => i.id === event.item_id),
                    c = data.catalog.find(
                      (c) => c.id === item?.catalog_item_id,
                    );
                  return (
                    <div className="activity-row" key={event.id}>
                      <span
                        className={`stat-icon ${event.delta >= 0 ? "blue" : "peach"}`}
                      >
                        {event.delta >= 0 ? (
                          <ArrowDown size={20} />
                        ) : (
                          <ArrowUp size={20} />
                        )}
                      </span>
                      <div>
                        <strong>{c?.name ?? "Removed item"}</strong>
                        <p>
                          {event.created_by === data.profile.id
                            ? data.profile.name
                            : "A teammate"}{" "}
                          ·{" "}
                          {event.source === "synced_offline"
                            ? "Synced from offline"
                            : "Stock updated"}
                        </p>
                      </div>
                      <span
                        className={
                          event.delta >= 0 ? "delta-positive" : "warning-text"
                        }
                      >
                        {event.delta > 0 ? "+" : ""}
                        {event.delta}
                      </span>
                      <small>
                        {new Date(event.created_at).toLocaleString()}
                      </small>
                    </div>
                  );
                })
              )}
            </section>
          )}
          {data && tab === "Settings" && (
            <section className="settings-grid">
              <div className="settings-card">
                <span className="stat-icon blue">
                  <Users size={22} />
                </span>
                <h2>{data.company.name}</h2>
                <p>
                  Signed in as {data.profile.name}. Everyone on your team can
                  help keep stock in shape.
                </p>
                <dl>
                  <dt>Email</dt>
                  <dd>{data.profile.email}</dd>
                  <dt>Device</dt>
                  <dd>{data.profile.device_info}</dd>
                  <dt>Storage</dt>
                  <dd>
                    {connected
                      ? "Company sync + saved on this browser"
                      : "Saved on this browser"}
                  </dd>
                  <dt>Pending changes</dt>
                  <dd>{data.queue.length}</dd>
                </dl>
                {connected && (
                  <div style={{ marginBottom: 16 }}>
                    <PasskeyButton register />
                  </div>
                )}
                {connected ? (
                  <button
                    className="button secondary"
                    onClick={async () => {
                      if (data.queue.length) {
                        toast.warning(
                          "Sync your pending changes before signing out.",
                        );
                        return;
                      }
                      try {
                        await request("/api/auth", {
                          method: "POST",
                          body: JSON.stringify({ action: "logout" }),
                        });
                        await createStore(
                          "connected",
                          identityRef.current,
                        ).persistence.clear();
                        location.reload();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <LogOut size={17} />
                    Sign out
                  </button>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => setModal({ kind: "login" })}
                  >
                    Connect your company <ArrowRight size={17} />
                  </button>
                )}
              </div>
              <div className="settings-card">
                <span className="stat-icon lavender">
                  <Moon size={22} />
                </span>
                <h2>A little personal touch</h2>
                <p>Choose the view that feels comfortable for you.</p>
                <button className="button secondary" onClick={toggleTheme}>
                  {dark ? <Sun size={18} /> : <Moon size={18} />}Use{" "}
                  {dark ? "light" : "dark"} mode
                </button>
                <hr />
                <h2>Keep a copy</h2>
                <p>
                  Your supplies, ready to share or print. Exports are created on
                  your device.
                </p>
                <div className="heading-actions">
                  <button
                    className="button secondary"
                    onClick={() => void exportData("csv")}
                  >
                    CSV export
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => void exportData("pdf")}
                  >
                    PDF export
                  </button>
                </div>
                {data.items.some((i) => i.archived_at) && (
                  <>
                    <hr />
                    <h2>Removed supplies</h2>
                    {data.items
                      .filter((i) => i.archived_at)
                      .map((i) => (
                        <button
                          key={i.id}
                          className="button secondary"
                          onClick={() =>
                            void mutate({
                              kind: "archive",
                              item_id: i.id,
                              archived: false,
                            })
                              .then(() => toast.success("Item restored."))
                              .catch((e) => toast.error(e.message))
                          }
                        >
                          Restore{" "}
                          {
                            data.catalog.find((c) => c.id === i.catalog_item_id)
                              ?.name
                          }
                        </button>
                      ))}
                  </>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
      {modal && (
        <Dialog
          title={
            modal.kind === "add"
              ? "A new addition to your pocket"
              : modal.kind === "adjust"
                ? "A little stock update"
                : modal.kind === "edit"
                  ? "Set a friendly reminder"
                  : modal.kind === "help"
                    ? "Stocket goes where you go"
                    : "Welcome to Stocket"
          }
          onClose={() => setModal(null)}
        >
          {modal.kind === "login" ? (
            <Login
              onDone={() => {
                setModal(null);
                void boot();
              }}
            />
          ) : modal.kind === "help" ? (
            <div className="help-content">
              <span className="empty-icon">
                <Smartphone size={42} />
              </span>
              <p>
                Find supplies, adjust stock, and keep the everyday essentials
                moving. Sign in with your company email on the mobile companion
                to take the same inventory with you.
              </p>
              <p>
                Offline? Keep working. Your changes save on your device and sync
                when you reconnect. Low-stock items get a warm orange flag.
              </p>
              <button className="button primary" onClick={() => setModal(null)}>
                Got it <Check size={18} />
              </button>
            </div>
          ) : (
            data && (
              <ItemForm
                modal={modal}
                data={data}
                onCreateCategory={async (name, parent) => {
                  const c = { id: uuid(), name, parent_id: parent };
                  await mutate({
                    kind: "category",
                    item_id: c.id,
                    category: c,
                  });
                  return c;
                }}
                onSave={async (fields) => {
                  const next = await mutate(fields);
                  setModal(null);
                  toast.success(
                    `Nice one, ${data.profile.name} — ${modal.kind === "add" ? "item added" : "stock updated"}.`,
                  );
                  if (next) {
                    const item = next.items.find(
                      (i) => i.id === fields.item_id,
                    );
                    if (item && isLow(item))
                      toast.warning(
                        "This item is running low. A top-up would help.",
                      );
                  }
                }}
              />
            )
          )}
        </Dialog>
      )}
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const root = ref.current;
    root?.querySelector<HTMLElement>("input, button")?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && root) {
        const els = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,textarea,[tabindex="0"]',
          ),
        );
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      prior?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={ref}
      >
        <div className="modal-title">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ItemForm({
  modal,
  data,
  onSave,
  onCreateCategory,
}: {
  modal: Exclude<Modal, null | { kind: "login" } | { kind: "help" }>;
  data: Snapshot;
  onSave: (fields: Record<string, unknown>) => Promise<void>;
  onCreateCategory: (
    name: string,
    parent: string | null,
  ) => Promise<import("@stocket/core").Category>;
}) {
  const original =
    modal.kind === "add"
      ? null
      : data.catalog.find((c) => c.id === modal.item.catalog_item_id);
  const [name, setName] = useState(original?.name ?? ""),
    [cat, setCat] = useState(
      original?.category_id ?? data.categories[0]?.id ?? "",
    ),
    [quantity, setQuantity] = useState("1"),
    [threshold, setThreshold] = useState(
      modal.kind === "add" ? "5" : String(modal.item.low_stock_threshold),
    ),
    [direction, setDirection] = useState(1),
    [selected, setSelected] = useState<CatalogItem | null>(null),
    [busy, setBusy] = useState(false),
    [photo, setPhoto] = useState<string>(),
    [suggesting, setSuggesting] = useState(false),
    [categorySuggestion, setCategorySuggestion] = useState<{
      name: string;
      parent_id: string | null;
    } | null>(null);
  const matches = catalogMatches(data.catalog, name),
    catalog =
      modal.kind === "add"
        ? null
        : data.catalog.find((c) => c.id === modal.item.catalog_item_id);
  async function readPhoto(file: File) {
    try {
      if (!file.type.startsWith("image/"))
        throw new Error("Choose an image from your camera or files.");
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas"),
        scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      canvas
        .getContext("2d")
        ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const compressed = canvas.toDataURL("image/webp", 0.8);
      if (!compressed.startsWith("data:image/webp;"))
        throw new Error(
          "This browser cannot create WebP. Try a recent browser.",
        );
      setPhoto(compressed);
      toast.success("Photo ready. Looking good.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (modal.kind === "add") {
            const c = selected ?? {
              id: uuid(),
              name: name.trim(),
              category_id: cat,
            };
            if (!c.name) throw new Error("Give your item a name.");
            if (data.items.some((i) => i.catalog_item_id === c.id))
              throw new Error(
                "This item already has a stock record. Adjust or restore it instead.",
              );
            await onSave({
              kind: "add",
              item_id: uuid(),
              catalog: c,
              delta: Number(quantity),
              threshold: Number(threshold),
              ...(!selected && photo ? { photo } : {}),
            });
          } else if (modal.kind === "adjust") {
            await onSave({
              kind: "adjust",
              item_id: modal.item.id,
              delta: Number(quantity) * direction,
            });
          } else
            await onSave({
              kind: "edit",
              item_id: modal.item.id,
              threshold: Number(threshold),
              catalog: original
                ? { ...original, name: name.trim(), category_id: cat }
                : undefined,
            });
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      className="item-form"
    >
      {modal.kind === "add" ? (
        <>
          <p className="form-intro">
            Search the shared catalog first. Someone may have done the little
            details for you already.
          </p>
          <label>
            Item name
            <input
              required
              maxLength={160}
              placeholder="e.g. Printer paper A4"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSelected(null);
              }}
            />
          </label>
          {!selected && matches.length > 0 && (
            <div className="catalog-matches">
              <small>FROM THE SHARED CATALOG</small>
              {matches.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setSelected(c);
                    setName(c.name);
                    setCat(c.category_id);
                  }}
                >
                  <Box size={18} />
                  {c.name}
                  <Plus size={16} />
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="catalog-selected">
              <Check size={18} />
              Linked to the shared catalog. Category is ready.
            </div>
          )}
          <label>
            Category
            <select
              disabled={!!selected}
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            >
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!selected && (
            <>
              <button
                type="button"
                className="suggest-button"
                disabled={suggesting || !name.trim()}
                onClick={async () => {
                  setSuggesting(true);
                  try {
                    const result = await request("/api/catalog", {
                      method: "POST",
                      body: JSON.stringify({ action: "suggest", name }),
                    });
                    if (result.category_id) {
                      setCat(result.category_id);
                      toast.success(
                        "Category suggested — you can still change it.",
                      );
                    } else if (result.name) {
                      setCategorySuggestion({
                        name: result.name,
                        parent_id: result.parent_id ?? null,
                      });
                    } else
                      toast.message(
                        result.message ?? "Choose a category manually.",
                      );
                  } catch (e) {
                    toast.message((e as Error).message);
                  } finally {
                    setSuggesting(false);
                  }
                }}
              >
                <Sparkles size={16} />
                {suggesting ? "Finding a good home…" : "Suggest a category"}
              </button>
              {categorySuggestion && (
                <div className="catalog-matches">
                  <label>
                    Suggested new category
                    <input
                      value={categorySuggestion.name}
                      onChange={(e) =>
                        setCategorySuggestion({
                          ...categorySuggestion,
                          name: e.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const created = await onCreateCategory(
                          categorySuggestion.name,
                          categorySuggestion.parent_id,
                        );
                        setCat(created.id);
                        setCategorySuggestion(null);
                        toast.success("Category created.");
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    Confirm new category <Check size={16} />
                  </button>
                </div>
              )}
              <label className="photo-picker">
                {photo ? (
                  <img src={photo} alt="Your captured supply" />
                ) : (
                  <span>
                    <Plus size={22} />
                    Add a photo <small>Camera or file · resized to WebP</small>
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    if (e.target.files?.[0]) void readPhoto(e.target.files[0]);
                  }}
                />
              </label>
            </>
          )}
        </>
      ) : (
        <div className="form-item-summary">
          <span className="stat-icon blue">
            <Package size={25} />
          </span>
          <div>
            <strong>{catalog?.name}</strong>
            <p>{modal.item.quantity} currently in stock</p>
          </div>
        </div>
      )}
      {modal.kind === "adjust" && (
        <div className="direction-toggle">
          <button
            type="button"
            className={direction === 1 ? "selected" : ""}
            onClick={() => setDirection(1)}
          >
            <Plus size={18} />
            Stock in
          </button>
          <button
            type="button"
            className={direction === -1 ? "selected remove" : ""}
            onClick={() => setDirection(-1)}
          >
            <Minus size={18} />
            Stock out
          </button>
        </div>
      )}
      {modal.kind === "edit" && (
        <>
          <p className="form-intro">
            Catalog names and categories are shared with every company. Your
            threshold stays private to your team.
          </p>
          <label>
            Catalog name
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Category
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <div className="form-columns">
        {modal.kind !== "edit" && (
          <label>
            {modal.kind === "add" ? "Starting quantity" : "How many units?"}
            <input
              required
              type="number"
              min={modal.kind === "adjust" ? 1 : 0}
              max={1000000}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
        )}
        {modal.kind !== "adjust" && (
          <label>
            Alert below
            <input
              required
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
        )}
      </div>
      {modal.kind === "adjust" && (
        <div className="quantity-preview">
          After this update{" "}
          <strong>
            {modal.item.quantity + Number(quantity) * direction} in stock
          </strong>
        </div>
      )}
      <button className="button primary submit" disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Check size={18} />
        )}{" "}
        {modal.kind === "add" ? "Add to my inventory" : "Save update"}
      </button>
      <p className="form-footnote">
        <ShieldCheck size={14} />
        Stock levels stay inside your company.
      </p>
    </form>
  );
}
function Login({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState("email"),
    [email, setEmail] = useState(""),
    [token, setToken] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void request("/api/auth").then((a) => {
      if (a.user) setStage("profile");
    });
  }, []);
  if (stage === "passkey")
    return (
      <div className="item-form">
        <p>
          Your workspace is ready, {name}. Set up a passkey for a quick hello
          next time?
        </p>
        <PasskeyButton register onDone={onDone} />
        <button className="button secondary" onClick={onDone}>
          Maybe later — open my workspace
        </button>
      </div>
    );
  return (
    <form
      className="item-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (stage === "email") {
            await request("/api/auth", {
              method: "POST",
              body: JSON.stringify({ email }),
            });
            setStage("otp");
            toast.success("Check your email for your sign-in link or code.");
          } else if (stage === "otp") {
            await request("/api/auth", {
              method: "POST",
              body: JSON.stringify({ action: "verify", email, token }),
            });
            const auth = await request("/api/auth");
            if (auth.profile) onDone();
            else setStage("profile");
          } else {
            await request("/api/auth", {
              method: "POST",
              body: JSON.stringify({
                action: "profile",
                name,
                device: navigator.userAgent.slice(0, 200),
              }),
            });
            toast.success(`Hello, ${name}. Your pocket is ready.`);
            setStage("passkey");
          }
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <PasskeyButton onDone={onDone} />
      <p className="form-intro">
        Use the company email your administrator invited. Your team’s stock
        stays in your team’s pocket.
      </p>
      {stage === "email" ? (
        <label>
          Company email
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      ) : stage === "otp" ? (
        <>
          <p>
            We sent a sign-in link to <strong>{email}</strong>. You can also
            enter the email code here.
          </p>
          <label>
            Email code
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
        </>
      ) : (
        <label>
          What should we call you?
          <input
            required
            maxLength={80}
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
          />
        </label>
      )}
      <button className="button primary submit" disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <ArrowRight size={18} />
        )}{" "}
        {stage === "email"
          ? "Send my sign-in link"
          : stage === "otp"
            ? "Verify & continue"
            : "Open my workspace"}
      </button>
      {stage === "otp" && (
        <button
          className="text-button"
          type="button"
          onClick={() => setStage("email")}
        >
          Use another email or resend
        </button>
      )}
      {stage === "profile" && (
        <button
          type="button"
          className="text-button"
          onClick={async () => {
            await request("/api/auth", {
              method: "POST",
              body: JSON.stringify({ action: "logout" }),
            });
            setStage("email");
          }}
        >
          Use another company email
        </button>
      )}
    </form>
  );
}
