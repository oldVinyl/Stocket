import { errorResponse, supabase } from "@/lib/supabase";
export async function GET(req: Request) {
  try {
    const path = new URL(req.url).searchParams.get("path");
    if (!path) throw new Error("Missing photo path.");
    const client = await supabase();
    const { data, error } = await client.storage
      .from("catalog-images")
      .download(path);
    if (error) throw error;
    return new Response(data, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
