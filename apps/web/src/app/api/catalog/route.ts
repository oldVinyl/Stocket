import { checkOrigin, errorResponse, supabase } from "@/lib/supabase";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = await req.json();
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
      return errorResponse(
        new Error(
          "Category suggestions need your connected workspace. Configure Supabase, add GEMINI_API_KEY to its function secrets, and deploy suggest-category. Manual categories work now.",
        ),
        503,
      );
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
      if (error) {
        const context = (error as { context?: Response }).context;
        const payload = context
          ? await context
              .clone()
              .json()
              .catch(() => null)
          : null;
        return errorResponse(
          new Error(
            payload?.error ??
              "AI suggestions could not connect. Check that suggest-category is deployed and GEMINI_API_KEY is set; manual categories are available.",
          ),
          context?.status === 429 ? 429 : 503,
        );
      }
      return Response.json(data);
    }
    throw new Error("Unknown catalog action");
  } catch (e) {
    return errorResponse(e);
  }
}
