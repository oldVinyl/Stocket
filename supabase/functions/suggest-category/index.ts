import { createClient } from "npm:@supabase/supabase-js@2";
import { categoryProvider } from "../_shared/category-provider.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      return Response.json(
        { error: "Sign in first." },
        { status: 401, headers: cors },
      );
    const { data: profile } = await client
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile)
      return Response.json(
        { error: "Complete company sign-in first." },
        { status: 403, headers: cors },
      );
    const { name } = await req.json();
    if (typeof name !== "string" || !name.trim() || name.length > 160)
      throw new Error("Enter an item name.");
    const { data: existing } = await client
      .from("catalog_items")
      .select("id,category_id")
      .ilike("name", name)
      .limit(1);
    if (existing?.length)
      return Response.json(
        { category_id: existing[0].category_id },
        { headers: cors },
      );
    const provider = categoryProvider();
    if (!provider)
      return Response.json(
        {
          message:
            "Free-tier Gemini suggestions are not configured yet. Add GEMINI_API_KEY in Supabase Edge Function secrets. You can create a category manually meanwhile.",
        },
        { headers: cors },
      );
    const { data: categories, error: categoryError } = await client
      .from("categories")
      .select("id,name,parent_id");
    if (categoryError) throw categoryError;
    return Response.json(await provider.suggest(name, categories ?? []), {
      headers: cors,
    });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 400, headers: cors },
    );
  }
});
