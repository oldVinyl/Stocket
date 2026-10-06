import { supabase } from "./backend";
export async function nativePasskey(register: boolean) {
  if (!supabase) throw new Error("Connect Supabase first.");
  // Dynamic import keeps Expo Go usable. Native passkeys require a development
  // build, Associated Domains on iOS, and assetlinks.json on Android.
  const { Passkey } = await import("react-native-passkey");
  if (!Passkey.isSupported())
    throw new Error(
      "Passkeys require a supported native build. Email sign-in is always available.",
    );
  if (register) {
    const { data, error } = await supabase.auth.passkey.startRegistration();
    if (error) throw error;
    if (!data.options.rp.id)
      throw new Error("Configure a passkey relying party ID in Supabase.");
    const credential = await Passkey.create({
      ...data.options,
      rp: { ...data.options.rp, id: data.options.rp.id },
    } as Parameters<typeof Passkey.create>[0]);
    const result = await supabase.auth.passkey.verifyRegistration({
      challengeId: data.challenge_id,
      credential: {
        ...credential,
        type: credential.type ?? "public-key",
        rawId: credential.rawId ?? credential.id,
        clientExtensionResults: credential.clientExtensionResults ?? {},
      } as Parameters<
        typeof supabase.auth.passkey.verifyRegistration
      >[0]["credential"],
    });
    if (result.error) throw result.error;
  } else {
    const { data, error } = await supabase.auth.passkey.startAuthentication();
    if (error) throw error;
    if (!data.options.rpId)
      throw new Error("Configure a passkey relying party ID in Supabase.");
    const credential = await Passkey.get({
      ...data.options,
      rpId: data.options.rpId,
    } as Parameters<typeof Passkey.get>[0]);
    const result = await supabase.auth.passkey.verifyAuthentication({
      challengeId: data.challenge_id,
      credential: {
        ...credential,
        type: credential.type ?? "public-key",
        rawId: credential.rawId ?? credential.id,
        clientExtensionResults: credential.clientExtensionResults ?? {},
      } as Parameters<
        typeof supabase.auth.passkey.verifyAuthentication
      >[0]["credential"],
    });
    if (result.error) throw result.error;
  }
}
