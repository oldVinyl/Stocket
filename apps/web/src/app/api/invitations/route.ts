import { inviteTeammate } from "@stocket/core";
import { supabase, checkOrigin, errorResponse } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = await req.json();
    if (typeof body.email !== "string")
      throw new Error("Enter a teammate email.");
    const client = await supabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return errorResponse(
        new Error("Sign in before inviting teammates."),
        401,
      );
    const result = await inviteTeammate(body.email, {
      allow: async (email) => {
        const { data, error } = await client.rpc("invite_teammate", {
          invitee_email: email,
        });
        if (error) throw new Error(error.message);
        return data;
      },
      sendEmail: async (email) => {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: new URL("/auth/callback", req.url).href },
        });
        if (error) throw error;
      },
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
