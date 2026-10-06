import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./backend";
import * as SecureStore from "expo-secure-store";
export async function enableNotifications() {
  if (!Device.isDevice || !supabase)
    throw new Error("Notifications need a connected physical device.");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("stock-alerts", {
      name: "Low stock",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  if ((await Notifications.requestPermissionsAsync()).status !== "granted")
    throw new Error("Notification permission was not granted.");
  // FCM tokens work on both platforms. An iOS APNs token cannot be sent to FCM.
  const { getMessaging, getToken } =
    await import("@react-native-firebase/messaging");
  const token = await getToken(getMessaging());
  const { error } = await supabase.rpc("register_push_token", {
    device_token: token,
    platform: Platform.OS,
  });
  if (error) throw error;
  await SecureStore.setItemAsync("stocket.push-token", token);
}
export async function disableNotifications() {
  const token = await SecureStore.getItemAsync("stocket.push-token");
  if (token && supabase) {
    const { error } = await supabase.rpc("unregister_push_token", {
      device_token: token,
    });
    if (error) throw error;
  }
  await SecureStore.deleteItemAsync("stocket.push-token");
}
export async function listenForStockAlerts(onAlert: (body: string) => void) {
  if (!(await SecureStore.getItemAsync("stocket.push-token"))) return () => {};
  const { getMessaging, onMessage, onTokenRefresh } =
    await import("@react-native-firebase/messaging");
  const messaging = getMessaging();
  const stopMessages = onMessage(messaging, (m) =>
    onAlert(
      m.notification?.body ?? "A supply is running low. Time for a top-up?",
    ),
  );
  const stopTokens = onTokenRefresh(messaging, () => {
    void enableNotifications().catch(() => {});
  });
  return () => {
    stopMessages();
    stopTokens();
  };
}
