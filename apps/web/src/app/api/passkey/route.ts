import { supabase, errorResponse, checkOrigin } from "@/lib/supabase";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const body = await req.json();
    const client = await supabase();
    if (body.action === "register-start" || body.action === "register-verify") {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user)
        throw new Error("Verify your company email before adding a passkey.");
    }
    let result;
    if (body.action === "register-start")
      result = await client.auth.passkey.startRegistration();
    else if (body.action === "login-start")
      result = await client.auth.passkey.startAuthentication();
    else if (body.action === "register-verify")
      result = await client.auth.passkey.verifyRegistration({
        challengeId: body.challengeId,
        credential: body.credential,
      });
    else if (body.action === "login-verify")
      result = await client.auth.passkey.verifyAuthentication({
        challengeId: body.challengeId,
        credential: body.credential,
      });
    else throw new Error("Unknown passkey action.");
    if (result.error) throw result.error;
    // Verification persists the session into httpOnly cookies; tokens never go to JS.
    return Response.json(
      body.action.endsWith("start") ? result.data : { ok: true },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
