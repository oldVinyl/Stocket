import { supabase, errorResponse, checkOrigin } from "@/lib/supabase";
export async function GET() {
  try {
    const client = await supabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return errorResponse(new Error("Sign in to sync."), 401);
    const { data: profile, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (error) throw error;
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
      client
        .from("companies")
        .select("*")
        .eq("id", profile.company_id)
        .single(),
      rows("categories"),
      rows("catalog_items"),
      rows("items"),
      client
        .from("stock_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    for (const r of results) if (r.error) throw r.error;
    return Response.json({
      profile,
      company: results[0].data,
      categories: results[1].data,
      catalog: results[2].data,
      items: results[3].data,
      events: results[4].data,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const op = await req.json();
    const client = await supabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return errorResponse(new Error("Sign in to sync."), 401);
    if (op.photo) {
      if (
        typeof op.photo !== "string" ||
        !op.photo.startsWith("data:image/webp;base64,") ||
        op.photo.length > 1500000
      )
        throw new Error("Photo must be a compressed WebP under 1 MB.");
      const bytes = Buffer.from(op.photo.split(",")[1], "base64");
      const path = `${user.id}/${op.catalog.id}.webp`;
      const { error } = await client.storage
        .from("catalog-images")
        .upload(path, bytes, { contentType: "image/webp", upsert: false });
      if (error && !error.message.includes("already exists")) throw error;
      op.catalog.image_url = path;
      delete op.photo;
    }
    const { data, error } = await client.rpc("apply_inventory_mutation", {
      operation: op,
    });
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
