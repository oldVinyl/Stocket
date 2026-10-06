import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { secureSessionStorage } from "./storage";
import type { Mutation, Remote } from "@stocket/core";
import * as FileSystem from "expo-file-system/legacy";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          experimental: { passkey: true },
          storage: secureSessionStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase?.auth.startAutoRefresh();
  else supabase?.auth.stopAutoRefresh();
});
export const remote: Remote = {
  async pull() {
    if (!supabase) throw new Error("Connect Supabase first.");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in first.");
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    const client = supabase;
    async function rows(table: "categories" | "catalog_items" | "items") {
      const data: Record<string, any>[] = [];
      for (let from = 0; ; from += 1000) {
        const page = await client
          .from(table)
          .select("*")
          .order("id")
          .range(from, from + 999);
        if (page.error) throw page.error;
        data.push(...page.data);
        if (page.data.length < 1000) break;
      }
      return { data, error: null };
    }
    const results = await Promise.all([
      supabase
        .from("companies")
        .select("*")
        .eq("id", profile.company_id)
        .single(),
      rows("categories"),
      rows("catalog_items"),
      rows("items"),
      supabase
        .from("stock_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    for (const r of results) if (r.error) throw r.error;
    const { data: people, error: peopleError } = await supabase
      .from("profiles")
      .select("id,name")
      .eq("company_id", profile.company_id);
    if (peopleError) throw peopleError;
    const catalog = results[2].data as Record<string, any>[];
    const paths = catalog
      .filter((c) => c.image_url)
      .map((c) => c.image_url as string);
    if (paths.length) {
      const { data: urls } = await client.storage
        .from("catalog-images")
        .createSignedUrls(paths, 3600);
      const directory = FileSystem.documentDirectory + "catalog-photos/";
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      await Promise.all(
        catalog
          .filter((c) => c.image_url)
          .map(async (c) => {
            try {
              const file =
                directory +
                c.id +
                "-" +
                String(c.updated_at ?? "").replace(/[^0-9]/g, "") +
                ".webp";
              const existing = await FileSystem.getInfoAsync(file);
              if (!existing.exists) {
                const url = urls?.find(
                  (u) => u.path === c.image_url,
                )?.signedUrl;
                if (!url) return;
                await FileSystem.downloadAsync(url, file);
              }
              c.image_url = file;
            } catch {
              c.image_url = null;
            }
          }),
      );
    }
    return {
      profile,
      people: people ?? [],
      company: results[0].data,
      categories: results[1].data ?? [],
      catalog: results[2].data ?? [],
      items: results[3].data ?? [],
      events: results[4].data ?? [],
    } as Awaited<ReturnType<Remote["pull"]>>;
  },
  async push(mutation: Mutation) {
    if (!supabase) throw new Error("Connect Supabase first.");
    const op = JSON.parse(JSON.stringify(mutation));
    if (op.photo) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again.");
      const base64 = op.photo.split(",")[1];
      const binary = Uint8Array.from(atob(base64), (c: string) =>
        c.charCodeAt(0),
      );
      const path = `${user.id}/${op.catalog.id}.webp`;
      const { error } = await supabase.storage
        .from("catalog-images")
        .upload(path, binary, { contentType: "image/webp", upsert: false });
      if (error && !error.message.includes("already exists")) throw error;
      op.catalog.image_url = path;
      delete op.photo;
    }
    const { error } = await supabase.rpc("apply_inventory_mutation", {
      operation: op,
    });
    if (error) throw error;
  },
};
