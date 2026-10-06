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
  Keyboard,
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
  ArrowRight,
  Bell,
  Camera,
  LayoutDashboard,
  FileText,
  Printer,
  Pencil,
  Folder,
  Check,
  Circle,
  Cloud,
  CloudOff,
  Grid2X2,
  Heart,
  History,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Sun,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import {
  useFonts,
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from "@expo-google-fonts/quicksand";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import * as Device from "expo-device";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import Toast, { BaseToast } from "react-native-toast-message";
import {
  InventoryStore,
  catalogMatches,
  resolveStockAddition,
  validateQuantity,
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
import BottomSheet from "./src/bottom-sheet";
import { isExpoGo } from "./src/runtime";
import {
  enableNotifications,
  disableNotifications,
  listenForStockAlerts,
} from "./src/notifications";
const palette = {
  bg: "#FFF9F0",
  surface: "#fffdfa",
  text: "#102B53",
  muted: "#617187",
  primary: "#334EAC",
  button: "#334EAC",
  line: "#e5e8e9",
  soft: "#edf2fb",
  alert: "#AF4822",
  alertBg: "#fff1e6",
  movementPositive: "#217A4B",
  movementNegative: "#C7353A",
};
const darkPalette = {
  ...palette,
  bg: "#081F5C",
  primary: "#A7BCFF",
  surface: "#112c63",
  text: "#D0E3FF",
  muted: "#a4b9d6",
  line: "#2b4576",
  soft: "#203f71",
  alert: "#ffc09d",
  alertBg: "#533c3d",
  movementPositive: "#72D9A2",
  movementNegative: "#FF8E95",
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
function CategoryArt({ name }: { name: string }) {
  const Icon = /paper|note/i.test(name)
    ? FileText
    : /ink|toner|print/i.test(name)
      ? Printer
      : /filing|packing|folder/i.test(name)
        ? Folder
        : /desk|pen|writing/i.test(name)
          ? Pencil
          : Grid2X2;
  return (
    <Icon size={30} color="#334EAC" strokeWidth={1.8} accessible={false} />
  );
}
const pocketGuide = [
  {
    title: "Hello, and welcome",
    tab: "Overview",
    body: "Overview shows the health of your workspace, supplies that need a top-up, and recent movements. Your company name replaces the local demo after sign-in. Your stock stays inside your company.",
  },
  {
    title: "Add your everyday essentials",
    tab: "Inventory",
    body: "Tap Add item and search the shared catalog. Choose a match to reuse its photo and category, or create a new supply with a photo and a manual or suggested category. If you already stock it, the quantity you enter is added to its current count.",
  },
  {
    title: "Keep counts moving",
    tab: "Inventory",
    body: "Tap Adjust stock on a supply, choose adding or taking out, and enter the number of units. The preview shows the result. Edit changes its alert threshold. Swipe a card to reveal Remove; use the Undo toast or restore it from Settings.",
  },
  {
    title: "Know when to top up",
    tab: "Inventory",
    body: "The bell lists supplies below their individual alert thresholds. Tap View low-stock inventory to filter them. Push alerts require a native build; Expo Go still has the in-app reminders.",
  },
  {
    title: "Find supplies and their history",
    tab: "Categories",
    body: "Categories show a supply photo or an illustrated tile. Tap a category to see its inventory. Create or rename categories below the list. Activity records signed quantities, the person who updated stock, and whether a change synced from offline.",
  },
  {
    title: "Work anywhere",
    tab: "Settings",
    body: "Changes save on your phone first. Offline stock movements wait in the sync queue and merge as additions or deductions when you reconnect. Settings lets you export CSV or a branded PDF, choose light/dark/device appearance, enable notifications, and replay this guide. Sync pending changes before signing out.",
  },
];
const ThemePalette = React.createContext(palette);
function ThemedInput(props: React.ComponentProps<typeof TextInput>) {
  const p = React.useContext(ThemePalette);
  return (
    <TextInput
      placeholderTextColor={p.muted}
      selectionColor={p.primary}
      {...props}
    />
  );
}
function IconLabel({
  icon: Icon,
  children,
  textStyle,
  color,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  textStyle?: React.ComponentProps<typeof Text>["style"];
  color?: string;
}) {
  const theme = React.useContext(ThemePalette);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
      <Icon
        size={18}
        color={color ?? theme.primary}
        strokeWidth={2}
        accessible={false}
      />
      <Text style={[textStyle, { flexShrink: 1 }]}>{children}</Text>
    </View>
  );
}
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
  const systemDark = useColorScheme() === "dark";
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">(
    "system",
  );
  const dark = appearance === "system" ? systemDark : appearance === "dark";
  const p = dark ? darkPalette : palette;
  const s = useMemo(() => styles(p), [dark]);
  const [guide, setGuide] = useState<number | null>(null);
  const [reminders, setReminders] = useState(false);
  useEffect(() => {
    void SecureStore.getItemAsync("stocket.appearance").then((value) => {
      if (value === "light" || value === "dark") setAppearance(value);
    });
  }, []);

  const [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState("Overview"),
    [query, setQuery] = useState(""),
    [onlyLow, setOnlyLow] = useState(false),
    [category, setCategory] = useState("all"),
    [form, setForm] = useState<Form>(null),
    [connected, setConnected] = useState(false),
    [online, setOnline] = useState(true),
    [syncing, setSyncing] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!connected || !data) return;
    let active = true;
    const key = `stocket.tour.${data.profile.id}`;
    void SecureStore.getItemAsync(key).then((seen) => {
      if (active && !seen) {
        setGuide(0);
        void SecureStore.setItemAsync(key, "1");
      }
    });
    return () => {
      active = false;
    };
  }, [connected, data?.profile.id]);
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
    <ThemePalette.Provider value={p}>
      <SafeAreaView style={s.safe}>
        <StatusBar style={dark ? "light" : "dark"} />
        <View style={s.header}>
          <View style={s.brandRow}>
            <View style={s.brandMark}>
              <Wallet
                size={24}
                color="#FFF9F0"
                strokeWidth={2.2}
                accessible={false}
              />
            </View>
            <Text style={s.brand}>
              stocket<Text style={{ color: "#CEB5D4" }}>.</Text>
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Stock reminders: ${low.length} low-stock supplies`}
            onPress={() => setReminders(true)}
            style={{ padding: 10 }}
          >
            <Bell size={23} color={p.primary} />
            <Text style={s.muted}>{low.length}</Text>
          </Pressable>
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
              <IconLabel
                icon={
                  syncing
                    ? RefreshCw
                    : !online
                      ? CloudOff
                      : connected
                        ? Cloud
                        : Circle
                }
                textStyle={s.sync}
                color={p.primary}
              >
                {syncing
                  ? "Syncing…"
                  : !online
                    ? "Offline"
                    : connected
                      ? data?.queue.length
                        ? `${data.queue.length} pending`
                        : "Synced"
                      : "Local demo"}
              </IconLabel>
            </Pressable>
          </View>
          {!connected && (
            <Pressable
              style={s.demo}
              onPress={() => setForm({ kind: "login" })}
            >
              <Text style={s.demoText}>
                You’re exploring the local demo.{" "}
                <Text style={{ fontFamily: "Quicksand_700Bold" }}>
                  Connect your company
                </Text>
              </Text>
            </Pressable>
          )}
          <View style={s.titleRow}>
            <Text style={[s.title, { flexShrink: 1 }]}>
              {tab === "Inventory" || tab === "Overview"
                ? `Hello, ${data?.profile.name ?? "there"}`
                : tab === "Activity"
                  ? "The little things, logged"
                  : tab === "Categories"
                    ? "A place for everything"
                    : "Your pocket, your way"}
            </Text>
            {tab === "Inventory" && (
              <Sun size={23} color={p.primary} accessible={false} />
            )}
          </View>
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
          {data && tab === "Overview" && (
            <View style={s.settings}>
              <Text style={s.subtitle}>Your workspace at a glance.</Text>
              <View style={s.stats}>
                <View style={s.stat}>
                  <Text style={s.statLabel}>Supplies</Text>
                  <Text style={s.statNumber}>{active.length}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>Units in stock</Text>
                  <Text style={s.statNumber}>
                    {active.reduce((sum, item) => sum + item.quantity, 0)}
                  </Text>
                </View>
              </View>
              <Pressable
                style={[s.secondary, { backgroundColor: p.alertBg }]}
                onPress={() => setReminders(true)}
              >
                <Text style={s.alertText}>
                  {low.length
                    ? `${low.length} supplies need a top-up`
                    : "All supplies are above their alert thresholds"}
                </Text>
              </Pressable>
              <Pressable
                style={s.primary}
                onPress={() => setForm({ kind: "add" })}
              >
                <Text style={s.primaryText}>Add a supply</Text>
              </Pressable>
              <Pressable
                style={s.secondary}
                onPress={() => {
                  setOnlyLow(false);
                  setCategory("all");
                  setQuery("");
                  setTab("Inventory");
                }}
              >
                <Text style={s.adjustText}>Browse inventory</Text>
              </Pressable>
              <Text style={s.sectionTitle}>Recent movement</Text>
              {data.events.slice(0, 5).map((event) => (
                <Pressable
                  key={event.id}
                  style={s.secondary}
                  onPress={() => setTab("Activity")}
                >
                  <Text style={s.itemName}>
                    {data.catalog.find(
                      (c) =>
                        c.id ===
                        data.items.find((i) => i.id === event.item_id)
                          ?.catalog_item_id,
                    )?.name ?? "Supply"}
                  </Text>
                  <Text
                    style={[
                      s.quantity,
                      {
                        color:
                          event.delta > 0
                            ? p.movementPositive
                            : event.delta < 0
                              ? p.movementNegative
                              : p.muted,
                      },
                    ]}
                  >
                    {event.delta > 0 ? "+" : ""}
                    {event.delta}
                  </Text>
                  <Text style={s.muted}>
                    Updated by{" "}
                    {event.created_by === data.profile.id
                      ? data.profile.name
                      : (data.people?.find(
                          (person) => person.id === event.created_by,
                        )?.name ?? "a teammate")}
                  </Text>
                </Pressable>
              ))}
              {!data.events.length && (
                <Text style={s.muted}>
                  Your stock movements will appear here.
                </Text>
              )}
              <Pressable style={s.secondary} onPress={() => setGuide(0)}>
                <Text style={s.adjustText}>Get to know your pocket</Text>
              </Pressable>
            </View>
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
                    need a top-up
                  </Text>
                </Pressable>
              </View>
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>Your inventory</Text>
                <Pressable
                  style={s.addButton}
                  onPress={() => setForm({ kind: "add" })}
                >
                  <IconLabel
                    icon={Plus}
                    textStyle={s.primaryText}
                    color="#FFF9F0"
                  >
                    Add item
                  </IconLabel>
                </Pressable>
              </View>
              <View style={s.searchField}>
                <Search size={19} color={p.muted} accessible={false} />
                <ThemedInput
                  accessibilityLabel="Search inventory"
                  style={s.searchInput}
                  placeholder="Find a supply…"
                  placeholderTextColor={p.muted}
                  value={query}
                  onChangeText={setQuery}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chips}
              >
                <Pressable
                  style={[
                    s.chip,
                    category === "all" && !onlyLow && s.chipActive,
                  ]}
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
                    onPress={() =>
                      setCategory(category === c.id ? "all" : c.id)
                    }
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
                            {item.quantity}{" "}
                            <Text style={s.muted}>in stock</Text>
                          </Text>
                          <Text style={s.muted}>
                            Min. {item.low_stock_threshold}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {isLow(item) && (
                      <View style={s.lowBadge}>
                        <IconLabel
                          icon={TriangleAlert}
                          textStyle={s.lowPill}
                          color={p.alert}
                        >
                          Running a little low
                        </IconLabel>
                      </View>
                    )}
                    <View style={s.itemActions}>
                      <Pressable
                        style={s.adjust}
                        onPress={() => setForm({ kind: "adjust", item })}
                      >
                        <IconLabel icon={Plus} textStyle={s.adjustText}>
                          Adjust stock
                        </IconLabel>
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
                  <Text style={s.sectionTitle}>
                    Nothing in this pocket yet.
                  </Text>
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
              <View style={s.footerRow}>
                <Text style={s.footer}>
                  Your stock levels stay inside your company.
                </Text>
                <Heart size={14} color={p.muted} accessible={false} />
              </View>
            </>
          )}
          {data &&
            tab === "Activity" &&
            data.events.map((e) => (
              <View key={e.id} style={s.activityRow}>
                <Text
                  style={[
                    s.quantity,
                    {
                      color:
                        e.delta > 0
                          ? p.movementPositive
                          : e.delta < 0
                            ? p.movementNegative
                            : p.muted,
                    },
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
                    Updated by{" "}
                    {e.created_by === data.profile.id
                      ? data.profile.name
                      : (data.people?.find(
                          (person) => person.id === e.created_by,
                        )?.name ?? "a teammate")}
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
                <View style={s.categoryTitle}>
                  {data.catalog.find(
                    (item) => item.category_id === c.id && item.image_url,
                  )?.image_url ? (
                    <Image
                      source={{
                        uri: data.catalog.find(
                          (item) => item.category_id === c.id && item.image_url,
                        )!.image_url!,
                      }}
                      style={{ width: 58, height: 58, borderRadius: 12 }}
                    />
                  ) : (
                    <View style={[s.letterTile, { height: 58 }]}>
                      <CategoryArt name={c.name} />
                    </View>
                  )}

                  <Text style={[s.sectionTitle, { flex: 1 }]}>{c.name}</Text>
                  <ArrowRight size={20} color={p.primary} accessible={false} />
                </View>
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
              <Text style={s.sectionTitle}>Appearance</Text>
              <View style={s.chipsWrap}>
                {(["system", "light", "dark"] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityState={{ selected: appearance === mode }}
                    style={[s.chip, appearance === mode && s.chipActive]}
                    onPress={() => {
                      setAppearance(mode);
                      void SecureStore.setItemAsync("stocket.appearance", mode);
                    }}
                  >
                    <Text style={s.chipText}>
                      {mode === "system"
                        ? "Use device"
                        : mode === "dark"
                          ? "Dark mode"
                          : "Light mode"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={s.secondary} onPress={() => setGuide(0)}>
                <Text style={s.adjustText}>Help & getting started</Text>
              </Pressable>
              <Text style={s.sectionTitle}>{data.company.name}</Text>
              <Text style={s.subtitle}>
                {data.profile.name} · {data.profile.email}
              </Text>
              <Text style={s.muted}>
                Signed in on {data.profile.device_info}
              </Text>
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
                      {isExpoGo
                        ? "About push alerts in Expo Go"
                        : "Enable low-stock notifications"}
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
                    <Text style={s.adjustText}>
                      Set up Face ID / fingerprint
                    </Text>
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
          {(
            [
              ["Overview", LayoutDashboard],
              ["Inventory", Package],
              ["Categories", Grid2X2],
              ["Activity", History],
              ["Settings", Settings],
            ] as const
          ).map(([name, Icon]) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityLabel={name}
              accessibilityState={{ selected: tab === name }}
              onPress={() => setTab(name)}
              style={s.navItem}
            >
              <Icon
                size={24}
                color={tab === name ? p.primary : p.muted}
                strokeWidth={2}
                accessible={false}
              />
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
        <BottomSheet
          visible={reminders || guide !== null}
          backgroundColor={p.surface}
          handleColor={p.muted}
          onClose={() => {
            setReminders(false);
            setGuide(null);
          }}
        >
          <SafeAreaView
            edges={["bottom", "left", "right"]}
            style={[s.safe, { backgroundColor: p.surface }]}
          >
            <ScrollView contentContainerStyle={s.content}>
              <View style={s.sectionRow}>
                <Text style={[s.sectionTitle, { flex: 1 }]}>
                  {reminders ? "Stock reminders" : "Your pocket, explained"}
                </Text>
                <Pressable
                  accessibilityLabel="Close guide or reminders"
                  onPress={() => {
                    setReminders(false);
                    setGuide(null);
                  }}
                >
                  <Text style={s.adjustText}>Close</Text>
                </Pressable>
              </View>
              {reminders ? (
                <View style={s.form}>
                  <Text style={s.subtitle}>
                    {low.length
                      ? `${low.length} supplies are below their alert thresholds.`
                      : "Looking good — no supplies are running low."}
                  </Text>
                  {low.map((item) => (
                    <View key={item.id} style={s.category}>
                      <Text style={s.itemName}>
                        {
                          data?.catalog.find(
                            (c) => c.id === item.catalog_item_id,
                          )?.name
                        }
                      </Text>
                      <Text style={s.alertText}>
                        {item.quantity} left · alert below{" "}
                        {item.low_stock_threshold}
                      </Text>
                    </View>
                  ))}
                  {!!low.length && (
                    <Pressable
                      style={s.primary}
                      onPress={() => {
                        setQuery("");
                        setCategory("all");
                        setOnlyLow(true);
                        setTab("Inventory");
                        setReminders(false);
                      }}
                    >
                      <Text style={s.primaryText}>
                        View low-stock inventory
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                guide !== null && (
                  <View style={s.form}>
                    <Text style={s.muted}>
                      Step {guide + 1} of {pocketGuide.length}
                    </Text>
                    <Text style={s.title}>{pocketGuide[guide].title}</Text>
                    <Text style={s.subtitle}>{pocketGuide[guide].body}</Text>
                    <View style={s.chipsWrap}>
                      {pocketGuide.map((step, index) => (
                        <Pressable
                          key={step.title}
                          style={[s.chip, index === guide && s.chipActive]}
                          onPress={() => setGuide(index)}
                        >
                          <Text style={s.chipText}>{index + 1}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable
                      style={s.secondary}
                      onPress={() => {
                        setTab(pocketGuide[guide].tab);
                        setGuide(null);
                      }}
                    >
                      <Text style={s.adjustText}>
                        Open {pocketGuide[guide].tab}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={s.primary}
                      onPress={() => {
                        if (guide < pocketGuide.length - 1) setGuide(guide + 1);
                        else {
                          void SecureStore.setItemAsync(
                            `stocket.tour.${userId.current}`,
                            "1",
                          );
                          setGuide(null);
                          notify("You're ready to keep things moving.");
                        }
                      }}
                    >
                      <Text style={s.primaryText}>
                        {guide === pocketGuide.length - 1
                          ? "Ready to go"
                          : "Next step"}
                      </Text>
                    </Pressable>
                  </View>
                )
              )}
            </ScrollView>
          </SafeAreaView>
        </BottomSheet>
        <BottomSheet
          visible={!!form}
          backgroundColor={p.surface}
          handleColor={p.muted}
          onClose={() => setForm(null)}
        >
          <SafeAreaView
            edges={["bottom", "left", "right"]}
            style={[s.safe, { backgroundColor: p.surface }]}
          >
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
                          () =>
                            notify("This supply could use a top-up.", "info"),
                          900,
                        );
                    }}
                  />
                )
              )}
            </ScrollView>
          </SafeAreaView>
        </BottomSheet>
        <Toast
          config={{
            success: (props) => (
              <BaseToast
                {...props}
                style={{
                  borderLeftColor: "#334EAC",
                  backgroundColor: p.surface,
                }}
                text1Style={{
                  fontFamily: "Quicksand_600SemiBold",
                  fontSize: 16,
                  color: p.text,
                }}
                text1NumberOfLines={3}
              />
            ),
            error: (props) => (
              <BaseToast
                {...props}
                style={{ borderLeftColor: p.alert, backgroundColor: p.surface }}
                text1Style={{
                  fontFamily: "Quicksand_600SemiBold",
                  fontSize: 16,
                  color: p.text,
                }}
                text2Style={{ color: p.muted, fontSize: 14 }}
                text1NumberOfLines={4}
              />
            ),
            info: (props) => (
              <BaseToast
                {...props}
                style={{
                  borderLeftColor: p.primary,
                  backgroundColor: p.surface,
                }}
                text1Style={{
                  fontFamily: "Quicksand_600SemiBold",
                  fontSize: 16,
                  color: p.text,
                }}
                text2Style={{ color: p.muted, fontSize: 14 }}
                text1NumberOfLines={4}
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
    </ThemePalette.Provider>
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
      <ThemedInput
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
    [photoOptions, setPhotoOptions] = useState(false),
    [busy, setBusy] = useState(false),
    [categoryName, setCategoryName] = useState(""),
    [categoryParent, setCategoryParent] = useState<string | null>(null);
  async function camera(fromLibrary = false) {
    try {
      const permission = fromLibrary
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          fromLibrary
            ? "Photo library permission is needed to choose a photo."
            : "Camera permission is needed for a photo.",
        );
      const shot = fromLibrary
        ? await ImagePicker.launchImageLibraryAsync({
            quality: 0.8,
            mediaTypes: ["images"],
          })
        : await ImagePicker.launchCameraAsync({ quality: 0.8 });
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
  const addition = resolveStockAddition(data, name, selected);
  const theme = React.useContext(ThemePalette);
  return (
    <View style={s.form}>
      <BottomSheet
        visible={photoOptions}
        onClose={() => setPhotoOptions(false)}
        backgroundColor={theme.surface}
        handleColor={theme.muted}
      >
        <SafeAreaView edges={["bottom"]} style={[s.content, { flex: 1 }]}>
          <Text style={s.sectionTitle}>Add a supply photo</Text>
          <Text style={s.subtitle}>
            Take a new photo or choose one already on your phone.
          </Text>
          <Pressable
            style={s.primary}
            onPress={() => {
              setPhotoOptions(false);
              setTimeout(() => void camera(), 250);
            }}
          >
            <Text style={s.primaryText}>Use camera</Text>
          </Pressable>
          <Pressable
            style={s.secondary}
            onPress={() => {
              setPhotoOptions(false);
              setTimeout(() => void camera(true), 250);
            }}
          >
            <Text style={s.adjustText}>Choose from photo library</Text>
          </Pressable>
          <Pressable style={s.secondary} onPress={() => setPhotoOptions(false)}>
            <Text style={s.adjustText}>Cancel</Text>
          </Pressable>
        </SafeAreaView>
      </BottomSheet>
      {form.kind === "add" ? (
        <>
          <Text style={s.subtitle}>
            Search the shared catalog first. The details may already be ready.
          </Text>
          {addition.item && (
            <Text style={s.muted}>
              Already in your stock: {addition.item.quantity} units. This adds
              units and keeps your current alert threshold
              {addition.item.archived_at
                ? "; the item will also be restored"
                : ""}
              .
            </Text>
          )}
          <Text style={s.label}>Item name</Text>
          <ThemedInput
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
                <IconLabel icon={Plus} textStyle={s.adjustText}>
                  {c.name}
                </IconLabel>
              </Pressable>
            ))}
          {addition.catalog && (
            <IconLabel icon={Check} textStyle={s.adjustText}>
              Linked to the shared catalog
            </IconLabel>
          )}
          <Text style={s.label}>Category</Text>
          <View style={s.chipsWrap}>
            {data.categories.map((c) => (
              <Pressable
                key={c.id}
                disabled={!!addition.catalog}
                style={[
                  s.chip,
                  (addition.catalog?.category_id ?? cat) === c.id &&
                    s.chipActive,
                ]}
                onPress={() => setCat(c.id)}
              >
                <Text style={s.chipText}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
          {!addition.catalog && (
            <>
              <ThemedInput
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
              <Pressable
                style={s.secondary}
                onPress={() => {
                  Keyboard.dismiss();
                  setPhotoOptions(true);
                }}
              >
                <IconLabel icon={Camera} textStyle={s.adjustText}>
                  {photo ? "Retake photo" : "Take a photo"}
                </IconLabel>
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
                      if (error) {
                        const response = (error as { context?: Response })
                          .context;
                        const detail = response
                          ? await response.json().catch(() => null)
                          : null;
                        throw new Error(
                          detail?.error ??
                            "AI suggestions need the deployed suggest-category function and GEMINI_API_KEY. Manual categories still work.",
                        );
                      }
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
                  <IconLabel icon={Sparkles} textStyle={s.adjustText}>
                    Suggest a category
                  </IconLabel>
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
            <IconLabel icon={Plus} textStyle={s.adjustText}>
              Stock in
            </IconLabel>
          </Pressable>
          <Pressable
            style={[s.chip, direction === -1 && s.chipActive]}
            onPress={() => setDirection(-1)}
          >
            <IconLabel icon={Minus} textStyle={s.adjustText}>
              Stock out
            </IconLabel>
          </Pressable>
        </View>
      )}
      {form.kind === "edit" && (
        <>
          <Text style={s.subtitle}>
            Catalog names and categories are shared across companies. Your stock
            threshold stays private.
          </Text>
          <ThemedInput
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
            {form.kind === "add"
              ? addition.item
                ? "Quantity to add"
                : "Starting quantity"
              : "How many units?"}
          </Text>
          <ThemedInput
            style={s.input}
            keyboardType="number-pad"
            value={quantity}
            onChangeText={setQuantity}
          />
        </>
      )}
      {form.kind !== "adjust" && !(form.kind === "add" && addition.item) && (
        <>
          <Text style={s.label}>Alert below</Text>
          <ThemedInput
            style={s.input}
            keyboardType="number-pad"
            value={threshold}
            onChangeText={setThreshold}
          />
        </>
      )}
      {form.kind === "adjust" && (
        <Text style={s.subtitle}>
          After this update: {form.item.quantity + Number(quantity) * direction}{" "}
          in stock
        </Text>
      )}
      <Pressable
        disabled={busy}
        style={s.primary}
        onPress={async () => {
          setBusy(true);
          try {
            if (!quantity.trim() || (!addition.item && !threshold.trim()))
              throw new Error("Enter a whole quantity and threshold.");
            if (form.kind === "add") {
              validateQuantity(Number(quantity));
              if (addition.item && Number(quantity) === 0)
                throw new Error("Enter at least one unit to add.");
              const c = addition.catalog ?? {
                id: Crypto.randomUUID(),
                name: name.trim(),
                category_id: cat,
              };
              if (!c.name) throw new Error("Give your supply a name.");
              if (addition.item) {
                if (addition.item.archived_at)
                  await onSave({
                    kind: "archive",
                    item_id: addition.item.id,
                    archived: false,
                  });
                await onSave({
                  kind: "adjust",
                  item_id: addition.item.id,
                  delta: Number(quantity),
                });
              } else
                await onSave({
                  kind: "add",
                  item_id: Crypto.randomUUID(),
                  catalog: c,
                  delta: Number(quantity),
                  threshold: Number(threshold),
                  ...(!addition.catalog && photo ? { photo } : {}),
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
              ? addition.item
                ? "Add to existing stock"
                : "Add to my inventory"
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
      <ThemedInput
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
        <ThemedInput
          style={s.input}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChangeText={setEmail}
        />
      ) : stage === "otp" ? (
        <ThemedInput
          style={s.input}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          placeholder="Email code"
          value={code}
          onChangeText={setCode}
        />
      ) : (
        <ThemedInput
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
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      flexWrap: "wrap",
      marginTop: 20,
    },
    categoryTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
    searchField: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.line,
      borderRadius: 12,
      paddingHorizontal: 14,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 14,
      fontFamily: "Quicksand_500Medium",
      fontSize: 16,
      color: p.text,
    },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    brandMark: {
      height: 35,
      width: 35,
      borderRadius: 11,
      backgroundColor: p.button,
      justifyContent: "center",
      alignItems: "center",
      transform: [{ rotate: "-6deg" }],
    },

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
      backgroundColor: p.button,
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
    lowBadge: {
      alignSelf: "flex-start",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 7,
      backgroundColor: p.alertBg,
      marginTop: 10,
    },
    lowPill: {
      color: p.alert,
      fontFamily: "Quicksand_600SemiBold",
      fontSize: 14,
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

    navText: {
      fontFamily: "Quicksand_500Medium",
      fontSize: 14,
      color: p.muted,
    },
    primary: {
      backgroundColor: p.button,
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
