import { checkOrigin, errorResponse, supabase } from "@/lib/supabase";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = await req.json();
    const client = await supabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return errorResponse(
        new Error(
          "Connect your company to use the shared catalog. Manual categories work in the demo.",
        ),
        401,
      );
    if (body.action === "category") {
      const { data, error } = await client.rpc("create_category", {
        category_name: body.name,
        parent: body.parent ?? null,
      });
      if (error) throw error;
      return Response.json(data);
    }
    if (body.action === "report") {
      const { error } = await client.rpc("report_catalog", {
        catalog_id: body.catalog_id,
        explanation: body.reason,
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (body.action === "suggest") {
      const { data, error } = await client.functions.invoke(
        "suggest-category",
        { body: { name: body.name } },
      );
      if (error) throw error;
      return Response.json(data);
    }
    throw new Error("Unknown catalog action");
  } catch (e) {
    return errorResponse(e);
  }
}
