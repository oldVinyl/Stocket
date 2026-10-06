import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const client = await supabase();
  const token_hash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  let error;
  if (token_hash)
    ({ error } = await client.auth.verifyOtp({ token_hash, type: "email" }));
  else if (code) ({ error } = await client.auth.exchangeCodeForSession(code));
  else error = new Error("Missing sign-in code");
  return NextResponse.redirect(new URL(error ? "/?authError=1" : "/", req.url));
}
