import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from "@expo-google-fonts/quicksand";
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import * as Device from "expo-device";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import Toast, { BaseToast } from "react-native-toast-message";
import {
  InventoryStore,
  catalogMatches,
  csvExport,
  inventoryReportHtml,
  demoSnapshot,
  isLow,
  type CatalogItem,
  type Item,
  type Mutation,
  type Snapshot,
} from "@stocket/core";
import { persistence } from "./src/storage";
import { remote, supabase } from "./src/backend";
import { nativePasskey } from "./src/passkeys";
import {
  enableNotifications,
  disableNotifications,
  listenForStockAlerts,
} from "./src/notifications";
const palette = {
  bg: "#FFF9F0",
  surface: "#fffdfa",
  text: "#102B53",
  muted: "#69788d",
  primary: "#334EAC",
  line: "#e5e8e9",
  soft: "#edf2fb",
  alert: "#b95027",
  alertBg: "#fff1e6",
};
const darkPalette = {
  ...palette,
  bg: "#081F5C",
  surface: "#112c63",
  text: "#D0E3FF",
  muted: "#a4b9d6",
  line: "#2b4576",
  soft: "#203f71",
  alert: "#ffc09d",
  alertBg: "#533c3d",
};
type Form =
  | { kind: "add" }
  | { kind: "adjust" | "edit"; item: Item }
  | { kind: "login" }
  | { kind: "report"; item: Item }
  | null;
const notify = (
  text: string,
  type = "success",
  props?: Record<string, unknown>,
) =>
  Toast.show({ type, text1: text, visibilityTime: props ? 8000 : 3500, props });
export default function App() {
  const [fonts, error] = useFonts({
    Quicksand_400Regular,
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
  });
  if (!fonts && !error)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          backgroundColor: palette.bg,
        }}
      >
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <Pocket />
    </SafeAreaProvider>
  );
}
function Pocket() {
  const systemDark = useColorScheme() === "dark",
    p = systemDark ? darkPalette : palette,
    s = useMemo(() => styles(p), [systemDark]);
  const [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState("Inventory"),
    [query, setQuery] = useState(""),
    [onlyLow, setOnlyLow] = useState(false),
    [category, setCategory] = useState("all"),
    [form, setForm] = useState<Form>(null),
    [connected, setConnected] = useState(false),
    [online, setOnline] = useState(true),
    [syncing, setSyncing] = useState(false),
    [error, setError] = useState("");
  const store = useRef<InventoryStore | null>(null),
    userId = useRef("demo");
  const sync = useCallback(async (quiet = false) => {
    if (!store.current) return;
    setSyncing(true);
    try {
      const pending =
        (await store.current.load())?.queue.filter(
          (q) => q.source === "synced_offline",
        ).length ?? 0;
      const next = await store.current.sync();
      if (next) setData(next);
      setError("");
      if (pending)
        notify(
          `${pending} offline ${pending === 1 ? "change is" : "changes are"} back in sync.`,
        );
      if (!quiet) notify("Your pocket is up to date.");
    } catch (e) {
      setError(
        `Your changes are saved here. Sync needs attention: ${(e as Error).message}`,
      );
      if (!quiet) notify((e as Error).message, "error");
    } finally {
      setSyncing(false);
    }
  }, []);
  const boot = useCallback(async () => {
    try {
      const session = supabase
        ? (await supabase.auth.getSession()).data.session
        : null;
      const id = session?.user.id ?? "demo";
      userId.current = id;
      setConnected(!!session);
      const local = persistence(id);
      store.current = new InventoryStore(local, session ? remote : undefined);
      let saved = await local.load();
      if (!saved && !session) {
        saved = demoSnapshot();
        await local.save(saved);
      }
      setData(saved);
      if (session) {
        const state = await Network.getNetworkStateAsync();
        if (state.isInternetReachable) {
          const { data: profile, error: profileError } = await supabase!
            .from("profiles")
            .select("id")
            .eq("id", id)
            .maybeSingle();
          if (profileError) throw profileError;
          if (!profile) {
            setForm({ kind: "login" });
            return;
          }
          await sync(true);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sync]);
  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    let alive = true,
      stop = () => {};
    if (connected)
      void listenForStockAlerts((body) => {
        notify(body, "info");
        void sync(true);
      })
        .then((unsubscribe) => {
          if (alive) stop = unsubscribe;
          else unsubscribe();
        })
        .catch(() => {});
    return () => {
      alive = false;
      stop();
    };
  }, [connected, sync]);
  useEffect(() => {
    void Network.getNetworkStateAsync().then((n) =>
      setOnline(!!n.isInternetReachable),
    );
    const subscription = Network.addNetworkStateListener((n) => {
      setOnline(!!n.isInternetReachable);
      if (n.isInternetReachable && connected) void sync(true);
    });
    const timer = setInterval(() => {
      if (online && connected) void sync(true);
    }, 30000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [connected, online, sync]);
  async function mutate(fields: Record<string, unknown>) {
    if (!store.current) throw new Error("Open your workspace first.");
    const op = {
      ...fields,
      id: Crypto.randomUUID(),
      created_at: new Date().toISOString(),
      source: online ? "online" : "synced_offline",
    } as Mutation;
    const next = await store.current.mutate(op);
    setData(next);
    if (connected && online) void sync(true);
    return next;
  }
  async function remove(item: Item) {
    try {
      await mutate({ kind: "archive", item_id: item.id, archived: true });
      notify("Item removed. Changed your mind?", "undo", {
        onUndo: () => {
          void mutate({ kind: "archive", item_id: item.id, archived: false })
            .then(() => notify("Back in your pocket."))
            .catch((e) => notify(e.message, "error"));
        },
      });
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  async function exportStock(pdf: boolean) {
    if (!data) return;
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("Sharing is unavailable on this device.");
      let uri: string;
      if (pdf) {
        const file = await Print.printToFileAsync({
          html: inventoryReportHtml(data),
        });
        uri = file.uri;
      } else {
        uri = FileSystem.cacheDirectory + "stocket-inventory.csv";
        await FileSystem.writeAsStringAsync(uri, "\uFEFF" + csvExport(data));
      }
      await Sharing.shareAsync(uri, {
        mimeType: pdf ? "application/pdf" : "text/csv",
      });
      notify("Your inventory is ready to share.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  const active = data?.items.filter((i) => !i.archived_at) ?? [],
    low = active.filter(isLow),
    filtered = active.filter((i) => {
      const c = data?.catalog.find((c) => c.id === i.catalog_item_id);
      return (
        c?.name.toLowerCase().includes(query.toLowerCase()) &&
        (!onlyLow || isLow(i)) &&
        (category === "all" || c.category_id === category)
      );
    });
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style={systemDark ? "light" : "dark"} />
      <View style={s.header}>
        <View style={s.brandRow}>
          <View style={s.brandMark}>
            <Text style={s.markText}>▱</Text>
          </View>
          <Text style={s.brand}>
            stocket<Text style={{ color: "#CEB5D4" }}>.</Text>
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Workspace settings"
          style={s.avatar}
          onPress={() => setTab("Settings")}
        >
          <Text style={s.avatarText}>
            {data?.profile.name.slice(0, 1) ?? "?"}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.workspaceRow}>
          <Text style={s.eyebrow}>
            {data?.company.name ?? "YOUR WORKSPACE"}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void sync()}>
            <Text style={s.sync}>
              {syncing
                ? "↻ Syncing…"
                : !online
                  ? "○ Offline"
                  : connected
                    ? data?.queue.length
                      ? `${data.queue.length} pending`
                      : "☁ Synced"
                    : "○ Local demo"}
            </Text>
          </Pressable>
        </View>
        {!connected && (
          <Pressable style={s.demo} onPress={() => setForm({ kind: "login" })}>
            <Text style={s.demoText}>
              You’re exploring the local demo.{" "}
              <Text style={{ fontFamily: "Quicksand_700Bold" }}>
                Connect your company →
              </Text>
            </Text>
          </Pressable>
        )}
        <Text style={s.title}>
          {tab === "Inventory"
            ? `Hello, ${data?.profile.name ?? "there"} ☀`
            : tab === "Activity"
              ? "The little things, logged"
              : tab === "Categories"
                ? "A place for everything"
                : "Your pocket, your way"}
        </Text>
        <Text style={s.subtitle}>
          {tab === "Inventory"
            ? "Let’s keep the everyday essentials moving."
            : tab === "Activity"
              ? "A simple history of your stock changes."
              : tab === "Categories"
                ? "Find the right home for every supply."
                : "A little personal touch for your workspace."}
        </Text>
        {!!error && <Text style={s.alertText}>{error}</Text>}
        {!data && (
          <Pressable
            style={s.primary}
            onPress={() => setForm({ kind: "login" })}
          >
            <Text style={s.primaryText}>Sign in to your company</Text>
          </Pressable>
        )}
        {data && tab === "Inventory" && (
          <>
            <View style={s.stats}>
              <View style={s.stat}>
                <Text style={s.statLabel}>Total supplies</Text>
                <Text style={s.statNumber}>{active.length}</Text>
                <Text style={s.muted}>in your pocket</Text>
              </View>
              <Pressable
                style={[s.stat, { backgroundColor: p.alertBg }]}
                onPress={() => setOnlyLow(!onlyLow)}
              >
                <Text style={[s.statLabel, { color: p.alert }]}>
                  Running low
                </Text>
                <Text style={[s.statNumber, { color: p.alert }]}>
                  {low.length}
                </Text>
                <Text style={[s.muted, { color: p.alert }]}>
                  need a top-up →
                </Text>
              </Pressable>
            </View>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Your inventory</Text>
              <Pressable
                style={s.addButton}
                onPress={() => setForm({ kind: "add" })}
              >
                <Text style={s.primaryText}>＋ Add item</Text>
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Search inventory"
              style={s.input}
              placeholder="⌕  Find a supply…"
              placeholderTextColor={p.muted}
              value={query}
              onChangeText={setQuery}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips}
            >
              <Pressable
                style={[s.chip, category === "all" && !onlyLow && s.chipActive]}
                onPress={() => {
                  setCategory("all");
                  setOnlyLow(false);
                }}
              >
                <Text style={s.chipText}>All supplies</Text>
              </Pressable>
              <Pressable
                style={[s.chip, onlyLow && s.chipActive]}
                onPress={() => setOnlyLow(!onlyLow)}
              >
                <Text style={s.chipText}>Low stock</Text>
              </Pressable>
              {data.categories.map((c) => (
                <Pressable
                  key={c.id}
                  style={[s.chip, category === c.id && s.chipActive]}
                  onPress={() => setCategory(category === c.id ? "all" : c.id)}
                >
                  <Text style={s.chipText}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {filtered.map((item) => {
              const c = data.catalog.find(
                (c) => c.id === item.catalog_item_id,
              )!;
              return (
                <SwipeItem
                  key={item.id}
                  onRemove={() => void remove(item)}
                  s={s}
                  onReport={
                    connected
                      ? () => setForm({ kind: "report", item })
                      : undefined
                  }
                >
                  <View style={s.itemRow}>
                    {c.image_url?.startsWith("data:") ||
                    c.image_url?.startsWith("http") ||
                    c.image_url?.startsWith("file:") ? (
                      <Image
                        source={{ uri: c.image_url }}
                        style={s.letterTile}
                      />
                    ) : (
                      <View style={s.letterTile}>
                        <Text style={s.letterText}>{c.name.slice(0, 1)}</Text>
                      </View>
                    )}
                    <View style={s.itemBody}>
                      <Text style={s.itemName}>{c.name}</Text>
                      <Text style={s.muted}>
                        {
                          data.categories.find(
                            (cat) => cat.id === c.category_id,
                          )?.name
                        }
                      </Text>
                      <View style={s.itemStock}>
                        <Text
                          style={[
                            s.quantity,
                            isLow(item) && { color: p.alert },
                          ]}
                        >
                          {item.quantity} <Text style={s.muted}>in stock</Text>
                        </Text>
                        <Text style={s.muted}>
                          Min. {item.low_stock_threshold}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {isLow(item) && (
                    <Text style={s.lowPill}>● Running a little low</Text>
                  )}
                  <View style={s.itemActions}>
                    <Pressable
                      style={s.adjust}
                      onPress={() => setForm({ kind: "adjust", item })}
                    >
                      <Text style={s.adjustText}>＋ Adjust stock</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Edit threshold for ${c.name}`}
                      style={s.editAction}
                      onPress={() => setForm({ kind: "edit", item })}
                    >
                      <Text style={s.muted}>Edit</Text>
                    </Pressable>
                  </View>
                </SwipeItem>
              );
            })}
            {!filtered.length && (
              <View style={s.empty}>
                <Text style={s.sectionTitle}>Nothing in this pocket yet.</Text>
                <Text style={s.subtitle}>
                  Try clearing filters, or add your first supply.
                </Text>
                <Pressable
                  style={s.primary}
                  onPress={() => {
                    if (active.length) {
                      setQuery("");
                      setOnlyLow(false);
                      setCategory("all");
                    } else setForm({ kind: "add" });
                  }}
                >
                  <Text style={s.primaryText}>
                    {active.length ? "Clear filters" : "Add item"}
                  </Text>
                </Pressable>
              </View>
            )}
            <Text style={s.footer}>
              Your stock levels stay inside your company. ♡
            </Text>
          </>
        )}
        {data &&
          tab === "Activity" &&
          data.events.map((e) => (
            <View key={e.id} style={s.activityRow}>
              <Text
                style={[
                  s.quantity,
                  { color: e.delta >= 0 ? p.primary : p.alert },
                ]}
              >
                {e.delta > 0 ? "+" : ""}
                {e.delta}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>
                  {data.catalog.find(
                    (c) =>
                      c.id ===
                      data.items.find((i) => i.id === e.item_id)
                        ?.catalog_item_id,
                  )?.name ?? "Supply"}
                </Text>
                <Text style={s.muted}>
                  {new Date(e.created_at).toLocaleString()}
                </Text>
                <Text style={s.muted}>
                  {e.source === "synced_offline"
                    ? "Synced from offline"
                    : "Stock updated"}
                </Text>
              </View>
            </View>
          ))}
        {data &&
          tab === "Categories" &&
          data.categories.map((c) => (
            <Pressable
              key={c.id}
              style={s.category}
              onPress={() => {
                setCategory(c.id);
                setTab("Inventory");
              }}
            >
              <Text style={s.sectionTitle}>{c.name} →</Text>
              <Text style={s.muted}>
                {
                  active.filter(
                    (i) =>
                      data.catalog.find((cat) => cat.id === i.catalog_item_id)
                        ?.category_id === c.id,
                  ).length
                }{" "}
                supplies in stock
              </Text>
            </Pressable>
          ))}
        {data && tab === "Categories" && (
          <MobileCategoryEditor
            s={s}
            categories={data.categories}
            onSave={(c) =>
              mutate({ kind: "category", item_id: c.id, category: c })
            }
          />
        )}
        {data && tab === "Settings" && (
          <View style={s.settings}>
            <Text style={s.sectionTitle}>{data.company.name}</Text>
            <Text style={s.subtitle}>
              {data.profile.name} · {data.profile.email}
            </Text>
            <Text style={s.muted}>Signed in on {data.profile.device_info}</Text>
            <Text style={s.muted}>
              {data.queue.length} changes waiting to sync
            </Text>
            <Pressable
              style={s.secondary}
              onPress={() => void exportStock(false)}
            >
              <Text style={s.adjustText}>Export CSV</Text>
            </Pressable>
            <Pressable
              style={s.secondary}
              onPress={() => void exportStock(true)}
            >
              <Text style={s.adjustText}>Export PDF</Text>
            </Pressable>
            {connected && (
              <>
                <Pressable
                  style={s.secondary}
                  onPress={async () => {
                    try {
                      await enableNotifications();
                      notify("Low-stock notifications are ready.");
                    } catch (e) {
                      notify((e as Error).message, "error");
                    }
                  }}
                >
                  <Text style={s.adjustText}>
                    Enable low-stock notifications
                  </Text>
                </Pressable>
                <Pressable
                  style={s.secondary}
                  onPress={() =>
                    void nativePasskey(true)
                      .then(() =>
                        notify("Your passkey is ready for next time."),
                      )
                      .catch((e) => notify(e.message, "error"))
                  }
                >
                  <Text style={s.adjustText}>Set up Face ID / fingerprint</Text>
                </Pressable>
                <Pressable
                  style={s.secondary}
                  onPress={async () => {
                    if (data.queue.length) {
                      notify(
                        "Sync pending changes before signing out.",
                        "error",
                      );
                      return;
                    }
                    try {
                      await disableNotifications();
                    } catch (e) {
                      notify((e as Error).message, "error");
                      return;
                    }
                    const { error } = await supabase!.auth.signOut();
                    if (error) {
                      notify(error.message, "error");
                      return;
                    }
                    await persistence(userId.current).clear();
                    await boot();
                  }}
                >
                  <Text style={{ ...s.adjustText, color: p.alert }}>
                    Sign out
                  </Text>
                </Pressable>
              </>
            )}
            {!connected && (
              <Pressable
                style={s.primary}
                onPress={() => setForm({ kind: "login" })}
              >
                <Text style={s.primaryText}>Connect your company</Text>
              </Pressable>
            )}
            {!!data.items.filter((i) => i.archived_at).length && (
              <>
                <Text style={s.sectionTitle}>Removed items</Text>
                {data.items
                  .filter((i) => i.archived_at)
                  .map((i) => (
                    <Pressable
                      key={i.id}
                      style={s.secondary}
                      onPress={() =>
                        void mutate({
                          kind: "archive",
                          item_id: i.id,
                          archived: false,
                        })
                          .then(() => notify("Item restored."))
                          .catch((e) => notify(e.message, "error"))
                      }
                    >
                      <Text style={s.adjustText}>
                        Restore{" "}
                        {
                          data.catalog.find((c) => c.id === i.catalog_item_id)
                            ?.name
                        }
                      </Text>
                    </Pressable>
                  ))}
              </>
            )}
          </View>
        )}
      </ScrollView>
      <View style={s.bottomNav}>
        {[
          ["Inventory", "▱"],
          ["Categories", "▦"],
          ["Activity", "↻"],
          ["Settings", "☷"],
        ].map(([name, icon]) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === name }}
            onPress={() => setTab(name)}
            style={s.navItem}
          >
            <Text style={[s.navIcon, tab === name && { color: p.primary }]}>
              {icon}
            </Text>
            <Text
              style={[
                s.navText,
                tab === name && {
                  color: p.primary,
                  fontFamily: "Quicksand_700Bold",
                },
              ]}
            >
              {name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={!!form}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setForm(null)}
      >
        <SafeAreaView style={s.safe}>
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>
                {form?.kind === "login"
                  ? "Welcome to Stocket"
                  : form?.kind === "add"
                    ? "A new addition"
                    : "A little stock update"}
              </Text>
              <Pressable
                accessibilityLabel="Close form"
                onPress={() => setForm(null)}
              >
                <Text style={s.adjustText}>Close</Text>
              </Pressable>
            </View>
            {form?.kind === "login" ? (
              <MobileLogin
                s={s}
                onDone={() => {
                  setForm(null);
                  void boot();
                }}
              />
            ) : form?.kind === "report" && data ? (
              <MobileReport
                s={s}
                catalogId={form.item.catalog_item_id}
                onDone={() => setForm(null)}
              />
            ) : (
              form &&
              form.kind !== "report" &&
              data && (
                <MobileForm
                  s={s}
                  form={form}
                  data={data}
                  connected={connected}
                  onCreateCategory={async (name, parent) => {
                    const c = {
                      id: Crypto.randomUUID(),
                      name,
                      parent_id: parent,
                    };
                    await mutate({
                      kind: "category",
                      item_id: c.id,
                      category: c,
                    });
                    return c;
                  }}
                  onSave={async (fields) => {
                    const next = await mutate(fields);
                    setForm(null);
                    notify(`Nice one, ${data.profile.name} — stock updated.`);
                    const item = next.items.find(
                      (i) => i.id === fields.item_id,
                    );
                    if (item && isLow(item))
                      setTimeout(
                        () => notify("This supply could use a top-up.", "info"),
                        900,
                      );
                  }}
                />
              )
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Toast
        config={{
          success: (props) => (
            <BaseToast
              {...props}
              style={{ borderLeftColor: "#334EAC", backgroundColor: p.surface }}
              text1Style={{
                fontFamily: "Quicksand_600SemiBold",
                fontSize: 16,
                color: p.text,
              }}
              text1NumberOfLines={3}
            />
          ),
          undo: ({ text1, props }) => (
            <View style={s.undoToast}>
              <Text style={s.undoText}>{text1}</Text>
              <Pressable
                onPress={() => {
                  props.onUndo();
                  Toast.hide();
                }}
              >
                <Text style={s.undoAction}>Undo</Text>
              </Pressable>
            </View>
          ),
        }}
      />
    </SafeAreaView>
  );
}
function SwipeItem({
  children,
  onRemove,
  s,
  onReport,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  s: ReturnType<typeof styles>;
  onReport?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -35) setRevealed(true);
          if (g.dx > 35) setRevealed(false);
        },
      }),
    [],
  );
  return (
    <View style={s.swipeWrap}>
      <View style={s.itemCard} {...responder.panHandlers}>
        {children}
        <Pressable
          accessibilityLabel={
            revealed ? "Hide remove action" : "Reveal remove action"
          }
          style={s.reveal}
          onPress={() => setRevealed(!revealed)}
        >
          <Text style={s.muted}>···</Text>
        </Pressable>
      </View>
      {revealed && (
        <Pressable
          style={s.removeButton}
          onPress={() => {
            setRevealed(false);
            onRemove();
          }}
        >
          <Text style={s.removeText}>Remove from inventory</Text>
        </Pressable>
      )}
      {revealed && onReport && (
        <Pressable style={s.secondary} onPress={onReport}>
          <Text style={s.adjustText}>Report catalog name / photo</Text>
        </Pressable>
      )}
    </View>
  );
}
function MobileReport({
  s,
  catalogId,
  onDone,
}: {
  s: ReturnType<typeof styles>;
  catalogId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <View style={s.form}>
      <Text style={s.sectionTitle}>Help keep the shared catalog useful</Text>
      <Text style={s.subtitle}>
        Tell us what needs fixing about this item’s name or photo.
      </Text>
      <TextInput
        style={s.input}
        accessibilityLabel="Report reason"
        multiline
        maxLength={500}
        value={reason}
        onChangeText={setReason}
      />
      <Pressable
        disabled={busy}
        style={s.primary}
        onPress={async () => {
          setBusy(true);
          try {
            if (reason.trim().length < 3)
              throw new Error("Add a short explanation.");
            const { error } = await supabase!.rpc("report_catalog", {
              catalog_id: catalogId,
              explanation: reason.trim(),
            });
            if (error) throw error;
            notify("Thanks for helping keep the catalog useful.");
            onDone();
          } catch (e) {
            notify((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text style={s.primaryText}>{busy ? "Sending…" : "Send report"}</Text>
      </Pressable>
    </View>
  );
}
function MobileForm({
  s,
  form,
  data,
  connected,
  onSave,
  onCreateCategory,
}: {
  s: ReturnType<typeof styles>;
  form: Exclude<
    Form,
    null | { kind: "login" } | { kind: "report"; item: Item }
  >;
  data: Snapshot;
  connected: boolean;
  onSave: (v: Record<string, unknown>) => Promise<void>;
  onCreateCategory: (
    name: string,
    parent: string | null,
  ) => Promise<import("@stocket/core").Category>;
}) {
  const original =
    form.kind === "add"
      ? null
      : data.catalog.find((c) => c.id === form.item.catalog_item_id);
  const [name, setName] = useState(original?.name ?? ""),
    [cat, setCat] = useState(original?.category_id ?? data.categories[0]?.id),
    [selected, setSelected] = useState<CatalogItem | null>(null),
    [quantity, setQuantity] = useState("1"),
    [threshold, setThreshold] = useState(
      form.kind === "add" ? "5" : String(form.item.low_stock_threshold),
    ),
    [direction, setDirection] = useState(1),
    [photo, setPhoto] = useState<string>(),
    [busy, setBusy] = useState(false),
    [categoryName, setCategoryName] = useState(""),
    [categoryParent, setCategoryParent] = useState<string | null>(null);
  async function camera() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted)
        throw new Error("Camera permission is needed for a photo.");
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (shot.canceled) return;
      const image = shot.assets[0];
      const resized = await ImageManipulator.manipulateAsync(
        image.uri,
        [
          {
            resize:
              image.width > image.height
                ? { width: Math.min(600, image.width) }
                : { height: Math.min(600, image.height) },
          },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.WEBP,
          base64: true,
        },
      );
      setPhoto("data:image/webp;base64," + resized.base64);
      notify("Photo ready for the shared catalog.");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <View style={s.form}>
      {form.kind === "add" ? (
        <>
          <Text style={s.subtitle}>
            Search the shared catalog first. The details may already be ready.
          </Text>
          <Text style={s.label}>Item name</Text>
          <TextInput
            style={s.input}
            placeholder="Printer paper A4"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setSelected(null);
            }}
            maxLength={160}
          />
          {!selected &&
            catalogMatches(data.catalog, name).map((c) => (
              <Pressable
                key={c.id}
                style={s.secondary}
                onPress={() => {
                  setSelected(c);
                  setName(c.name);
                  setCat(c.category_id);
                }}
              >
                <Text style={s.adjustText}>＋ {c.name}</Text>
              </Pressable>
            ))}
          {selected && (
            <Text style={s.adjustText}>✓ Linked to the shared catalog</Text>
          )}
          <Text style={s.label}>Category</Text>
          <View style={s.chipsWrap}>
            {data.categories.map((c) => (
              <Pressable
                key={c.id}
                disabled={!!selected}
                style={[s.chip, cat === c.id && s.chipActive]}
                onPress={() => setCat(c.id)}
              >
                <Text style={s.chipText}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
          {!selected && (
            <>
              <TextInput
                style={s.input}
                placeholder="New category name (optional)"
                value={categoryName}
                onChangeText={setCategoryName}
              />
              <Pressable
                style={s.secondary}
                onPress={() =>
                  void onCreateCategory(categoryName, categoryParent)
                    .then((c) => {
                      setCat(c.id);
                      setCategoryName("");
                      notify("Category created.");
                    })
                    .catch((e) => notify(e.message, "error"))
                }
              >
                <Text style={s.adjustText}>Create category</Text>
              </Pressable>
              <Pressable style={s.secondary} onPress={() => void camera()}>
                <Text style={s.adjustText}>
                  ▣ {photo ? "Retake photo" : "Take a photo"}
                </Text>
              </Pressable>
              {photo && (
                <Image
                  source={{ uri: photo }}
                  style={{ width: 120, height: 120, borderRadius: 16 }}
                />
              )}
              {connected && (
                <Pressable
                  style={s.secondary}
                  onPress={async () => {
                    try {
                      const { data: result, error } =
                        await supabase!.functions.invoke("suggest-category", {
                          body: { name },
                        });
                      if (error) throw error;
                      if (result.category_id) setCat(result.category_id);
                      else if (result.name) {
                        setCategoryName(result.name);
                        setCategoryParent(result.parent_id ?? null);
                      }
                      notify(
                        result.category_id
                          ? "Category suggested — feel free to change it."
                          : (result.message ??
                              "Review the suggested category name below, then create it."),
                        "info",
                      );
                    } catch (e) {
                      notify((e as Error).message, "error");
                    }
                  }}
                >
                  <Text style={s.adjustText}>✦ Suggest a category</Text>
                </Pressable>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <Text style={s.sectionTitle}>
            {data.catalog.find((c) => c.id === form.item.catalog_item_id)?.name}
          </Text>
          <Text style={s.subtitle}>
            {form.item.quantity} currently in stock
          </Text>
        </>
      )}
      {form.kind === "adjust" && (
        <View style={s.stats}>
          <Pressable
            style={[s.chip, direction === 1 && s.chipActive]}
            onPress={() => setDirection(1)}
          >
            <Text style={s.adjustText}>＋ Stock in</Text>
          </Pressable>
          <Pressable
            style={[s.chip, direction === -1 && s.chipActive]}
            onPress={() => setDirection(-1)}
          >
            <Text style={s.adjustText}>− Stock out</Text>
          </Pressable>
        </View>
      )}
      {form.kind === "edit" && (
        <>
          <Text style={s.subtitle}>
            Catalog names and categories are shared across companies. Your stock
            threshold stays private.
          </Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            maxLength={160}
          />
          <View style={s.chipsWrap}>
            {data.categories.map((c) => (
              <Pressable
                key={c.id}
                style={[s.chip, cat === c.id && s.chipActive]}
                onPress={() => setCat(c.id)}
              >
                <Text style={s.chipText}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {form.kind !== "edit" && (
        <>
          <Text style={s.label}>
            {form.kind === "add" ? "Starting quantity" : "How many units?"}
          </Text>
          <TextInput
            style={s.input}
            keyboardType="number-pad"
            value={quantity}
            onChangeText={setQuantity}
          />
        </>
      )}
      {form.kind !== "adjust" && (
        <>
          <Text style={s.label}>Alert below</Text>
          <TextInput
            style={s.input}
            keyboardType="number-pad"
            value={threshold}
            onChangeText={setThreshold}
          />
        </>
      )}
      <Pressable
        disabled={busy}
        style={s.primary}
        onPress={async () => {
          setBusy(true);
          try {
            if (!quantity.trim() || !threshold.trim())
              throw new Error("Enter a whole quantity and threshold.");
            if (form.kind === "add") {
              const c = selected ?? {
                id: Crypto.randomUUID(),
                name: name.trim(),
                category_id: cat,
              };
              if (!c.name) throw new Error("Give your supply a name.");
              if (data.items.some((i) => i.catalog_item_id === c.id))
                throw new Error(
                  "Already in your stock. Adjust it or restore it in Settings.",
                );
              await onSave({
                kind: "add",
                item_id: Crypto.randomUUID(),
                catalog: c,
                delta: Number(quantity),
                threshold: Number(threshold),
                ...(!selected && photo ? { photo } : {}),
              });
            } else if (form.kind === "adjust")
              await onSave({
                kind: "adjust",
                item_id: form.item.id,
                delta: Number(quantity) * direction,
              });
            else
              await onSave({
                kind: "edit",
                item_id: form.item.id,
                threshold: Number(threshold),
                catalog: original
                  ? { ...original, name: name.trim(), category_id: cat }
                  : undefined,
              });
          } catch (e) {
            notify((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text style={s.primaryText}>
          {busy
            ? "Saving…"
            : form.kind === "add"
              ? "Add to my inventory"
              : "Save update"}
        </Text>
      </Pressable>
      <Text style={s.footer}>
        Saved on this device first. Synced when you’re online.
      </Text>
    </View>
  );
}
function MobileCategoryEditor({
  s,
  categories,
  onSave,
}: {
  s: ReturnType<typeof styles>;
  categories: import("@stocket/core").Category[];
  onSave: (c: import("@stocket/core").Category) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState("new"),
    [name, setName] = useState(""),
    [parent, setParent] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <View style={s.settings}>
      <Text style={s.sectionTitle}>Create or edit a category</Text>
      <Text style={s.subtitle}>
        Names and nesting are shared across companies.
      </Text>
      <ScrollView horizontal contentContainerStyle={s.chips}>
        <Pressable
          style={[s.chip, selected === "new" && s.chipActive]}
          onPress={() => {
            setSelected("new");
            setName("");
            setParent(null);
          }}
        >
          <Text style={s.chipText}>New category</Text>
        </Pressable>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            style={[s.chip, selected === c.id && s.chipActive]}
            onPress={() => {
              setSelected(c.id);
              setName(c.name);
              setParent(c.parent_id);
            }}
          >
            <Text style={s.chipText}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <TextInput
        style={s.input}
        accessibilityLabel="Category name"
        placeholder="Category name"
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <Text style={s.label}>Parent category</Text>
      <View style={s.chipsWrap}>
        <Pressable
          style={[s.chip, !parent && s.chipActive]}
          onPress={() => setParent(null)}
        >
          <Text style={s.chipText}>No parent</Text>
        </Pressable>
        {categories
          .filter((c) => c.id !== selected)
          .map((c) => (
            <Pressable
              key={c.id}
              style={[s.chip, parent === c.id && s.chipActive]}
              onPress={() => setParent(c.id)}
            >
              <Text style={s.chipText}>{c.name}</Text>
            </Pressable>
          ))}
      </View>
      <Pressable
        disabled={busy}
        style={s.primary}
        onPress={async () => {
          setBusy(true);
          try {
            await onSave({
              id: selected === "new" ? Crypto.randomUUID() : selected,
              name,
              parent_id: parent,
            });
            setSelected("new");
            setName("");
            setParent(null);
            notify("Category saved.");
          } catch (e) {
            notify((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text style={s.primaryText}>
          {busy
            ? "Saving…"
            : selected === "new"
              ? "Create category"
              : "Save category"}
        </Text>
      </Pressable>
    </View>
  );
}
function MobileLogin({
  s,
  onDone,
}: {
  s: ReturnType<typeof styles>;
  onDone: () => void;
}) {
  const [stage, setStage] = useState("email"),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase?.auth.getSession().then(({ data }) => {
      if (data.session) setStage("profile");
    });
  }, []);
  if (stage === "passkey")
    return (
      <View style={s.form}>
        <Text style={s.subtitle}>
          Your workspace is ready, {name}. Set up a passkey for a quick hello
          next time?
        </Text>
        <Pressable
          style={s.primary}
          onPress={() =>
            void nativePasskey(true)
              .then(onDone)
              .catch((e) => notify(e.message, "error"))
          }
        >
          <Text style={s.primaryText}>Set up Face ID / fingerprint</Text>
        </Pressable>
        <Pressable style={s.secondary} onPress={onDone}>
          <Text style={s.adjustText}>Maybe later — open my workspace</Text>
        </Pressable>
      </View>
    );
  return (
    <View style={s.form}>
      <Pressable
        style={s.secondary}
        onPress={() =>
          void nativePasskey(false)
            .then(onDone)
            .catch((e) => notify(e.message, "error"))
        }
      >
        <Text style={s.adjustText}>Sign in with a passkey</Text>
      </Pressable>
      <Text style={s.subtitle}>
        Sign in with the company email your administrator invited. Check your
        inbox for the sign-in code.
      </Text>
      {stage === "email" ? (
        <TextInput
          style={s.input}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChangeText={setEmail}
        />
      ) : stage === "otp" ? (
        <TextInput
          style={s.input}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          placeholder="Email code"
          value={code}
          onChangeText={setCode}
        />
      ) : (
        <TextInput
          style={s.input}
          placeholder="Your display name"
          value={name}
          onChangeText={setName}
          maxLength={80}
        />
      )}
      <Pressable
        style={s.primary}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            if (!supabase)
              throw new Error(
                "Add Supabase environment variables to connect your company.",
              );
            if (stage === "email") {
              const { error } = await supabase.auth.signInWithOtp({
                email: email.trim(),
              });
              if (error) throw error;
              setStage("otp");
              notify("Your email code is on its way.");
            } else if (stage === "otp") {
              const { error } = await supabase.auth.verifyOtp({
                email: email.trim(),
                token: code.trim(),
                type: "email",
              });
              if (error) throw error;
              const {
                data: { user },
              } = await supabase.auth.getUser();
              const { data: profile } = await supabase
                .from("profiles")
                .select("id")
                .eq("id", user!.id)
                .maybeSingle();
              if (profile) onDone();
              else setStage("profile");
            } else {
              const { error } = await supabase.rpc("onboard", {
                display_name: name,
                device_label:
                  `${Device.deviceName ?? Device.modelName ?? "Phone"} · ${Device.osName} ${Device.osVersion}`.slice(
                    0,
                    200,
                  ),
              });
              if (error) throw error;
              setStage("passkey");
            }
          } catch (e) {
            notify((e as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text style={s.primaryText}>
          {busy
            ? "One moment…"
            : stage === "email"
              ? "Send my email code"
              : stage === "otp"
                ? "Verify email"
                : "Open my workspace"}
        </Text>
      </Pressable>
      {stage === "otp" && (
        <Pressable onPress={() => setStage("email")}>
          <Text style={s.adjustText}>Resend or use another email</Text>
        </Pressable>
      )}
      {stage === "profile" && (
        <Pressable
          onPress={async () => {
            await supabase?.auth.signOut();
            setStage("email");
          }}
        >
          <Text style={s.adjustText}>Use another company email</Text>
        </Pressable>
      )}
    </View>
  );
}
function styles(p: typeof palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: p.bg },
    header: {
      paddingHorizontal: 22,
      paddingVertical: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderColor: p.line,
    },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    brandMark: {
      height: 35,
      width: 35,
      borderRadius: 11,
      backgroundColor: p.primary,
      justifyContent: "center",
      alignItems: "center",
      transform: [{ rotate: "-6deg" }],
    },
    markText: { color: "#fff", fontSize: 27 },
    brand: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 30,
      color: p.text,
      letterSpacing: -1.4,
    },
    avatar: {
      width: 37,
      height: 37,
      backgroundColor: "#eadbeb",
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: "#664b7b",
      fontFamily: "Quicksand_700Bold",
      fontSize: 17,
    },
    content: { padding: 22, paddingBottom: 35 },
    workspaceRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
    },
    eyebrow: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 14,
      color: p.muted,
      letterSpacing: 1,
    },
    sync: {
      fontFamily: "Quicksand_600SemiBold",
      fontSize: 14,
      color: p.primary,
    },
    demo: {
      backgroundColor: p.soft,
      padding: 13,
      borderRadius: 12,
      marginBottom: 22,
    },
    demoText: {
      fontFamily: "Quicksand_500Medium",
      fontSize: 14,
      color: p.text,
      lineHeight: 21,
    },
    title: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 28,
      color: p.text,
      letterSpacing: -0.8,
    },
    subtitle: {
      fontFamily: "Quicksand_500Medium",
      fontSize: 16,
      color: p.muted,
      lineHeight: 24,
      marginTop: 7,
      marginBottom: 22,
    },
    stats: { flexDirection: "row", gap: 12, marginBottom: 25 },
    stat: {
      flex: 1,
      padding: 17,
      borderRadius: 16,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.line,
    },
    statLabel: {
      fontFamily: "Quicksand_600SemiBold",
      fontSize: 14,
      color: p.muted,
    },
    statNumber: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 32,
      color: p.text,
      marginVertical: 3,
    },
    muted: {
      fontFamily: "Quicksand_500Medium",
      fontSize: 14,
      color: p.muted,
      lineHeight: 21,
    },
    sectionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 17,
      gap: 10,
    },
    sectionTitle: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 21,
      color: p.text,
    },
    addButton: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 11,
      backgroundColor: p.primary,
    },
    primaryText: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 16,
      color: "#fff",
      textAlign: "center",
    },
    input: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.line,
      borderRadius: 12,
      padding: 14,
      fontFamily: "Quicksand_500Medium",
      fontSize: 16,
      color: p.text,
    },
    chips: { gap: 8, paddingVertical: 17 },
    chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.line,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 12,
    },
    chipActive: { backgroundColor: p.soft, borderColor: "#BAD6EB" },
    chipText: {
      fontFamily: "Quicksand_600SemiBold",
      fontSize: 14,
      color: p.text,
    },
    swipeWrap: { marginBottom: 14 },
    itemCard: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.line,
      borderRadius: 16,
      padding: 16,
      position: "relative",
    },
    itemRow: { flexDirection: "row", gap: 13 },
    letterTile: {
      width: 58,
      height: 67,
      borderRadius: 12,
      backgroundColor: "#edf0f7",
      alignItems: "center",
      justifyContent: "center",
    },
    letterText: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 28,
      color: "#334EAC",
    },
    itemBody: { flex: 1, paddingRight: 10 },
    itemName: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 17,
      color: p.text,
      lineHeight: 25,
    },
    itemStock: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginTop: 10,
    },
    quantity: { fontFamily: "Quicksand_700Bold", fontSize: 24, color: p.text },
    lowPill: {
      alignSelf: "flex-start",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 7,
      backgroundColor: p.alertBg,
      color: p.alert,
      fontFamily: "Quicksand_600SemiBold",
      fontSize: 14,
      marginTop: 10,
    },
    itemActions: {
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderColor: p.line,
      paddingTop: 11,
      marginTop: 13,
    },
    adjust: { flex: 1, paddingVertical: 3 },
    adjustText: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 16,
      color: p.primary,
    },
    editAction: { padding: 6 },
    reveal: { position: "absolute", right: 8, top: 4, padding: 8 },
    removeButton: {
      backgroundColor: p.alertBg,
      borderRadius: 12,
      padding: 15,
      marginTop: 6,
      alignItems: "center",
    },
    removeText: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 16,
      color: p.alert,
    },
    footer: {
      fontFamily: "Quicksand_500Medium",
      fontSize: 14,
      color: p.muted,
      textAlign: "center",
      lineHeight: 21,
      marginTop: 20,
    },
    bottomNav: {
      backgroundColor: p.surface,
      borderTopWidth: 1,
      borderColor: p.line,
      flexDirection: "row",
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    navItem: { flex: 1, alignItems: "center", gap: 4 },
    navIcon: { fontSize: 24, color: p.muted, lineHeight: 27 },
    navText: {
      fontFamily: "Quicksand_500Medium",
      fontSize: 14,
      color: p.muted,
    },
    primary: {
      backgroundColor: p.primary,
      borderRadius: 13,
      padding: 16,
      marginTop: 10,
    },
    secondary: {
      padding: 16,
      backgroundColor: p.soft,
      borderRadius: 12,
      marginTop: 8,
    },
    form: { gap: 14, paddingTop: 12 },
    label: { fontFamily: "Quicksand_600SemiBold", fontSize: 16, color: p.text },
    empty: { paddingVertical: 30, alignItems: "center" },
    settings: { gap: 16 },
    activityRow: {
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderColor: p.line,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
    },
    category: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.line,
      borderRadius: 16,
      padding: 23,
      marginBottom: 15,
      gap: 8,
    },
    alertText: {
      fontFamily: "Quicksand_500Medium",
      fontSize: 16,
      color: p.alert,
    },
    undoToast: {
      backgroundColor: p.surface,
      borderRadius: 13,
      padding: 17,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      width: "90%",
      borderWidth: 1,
      borderColor: p.line,
    },
    undoText: {
      flex: 1,
      fontFamily: "Quicksand_600SemiBold",
      fontSize: 16,
      color: p.text,
    },
    undoAction: {
      fontFamily: "Quicksand_700Bold",
      fontSize: 16,
      color: p.primary,
    },
  });
}
