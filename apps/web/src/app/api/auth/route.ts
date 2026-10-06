import { supabase, errorResponse, checkOrigin } from "@/lib/supabase";
export async function GET() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return Response.json({ user: null, configured: false });
  try {
    const client = await supabase();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError")
      throw authError;
    if (!user) return Response.json({ user: null });
    const { data: profile } = await client
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    return Response.json({ user: { id: user.id, email: user.email }, profile });
  } catch (error) {
    return errorResponse(error, 503);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = await req.json();
    const client = await supabase();
    if (body.action === "logout") {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (body.action === "verify") {
      const { error } = await client.auth.verifyOtp({
        email: body.email,
        token: body.token,
        type: "email",
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (body.action === "profile") {
      const { data, error } = await client.rpc("onboard", {
        display_name: body.name,
        device_label: body.device,
      });
      if (error) throw error;
      return Response.json(data);
    }
    const { error } = await client.auth.signInWithOtp({
      email: body.email,
      options: { emailRedirectTo: new URL("/auth/callback", req.url).href },
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
