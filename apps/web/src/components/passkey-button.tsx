"use client";
import { useState } from "react";
import { Fingerprint, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { request } from "@/lib/local";
const decode = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  ).buffer;
const encode = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export default function PasskeyButton({
  register = false,
  onDone,
}: {
  register?: boolean;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="button secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (!window.PublicKeyCredential)
            throw new Error(
              "This browser does not support passkeys. Email sign-in is always available.",
            );
          const prefix = register ? "register" : "login";
          const start = await request("/api/passkey", {
            method: "POST",
            body: JSON.stringify({ action: prefix + "-start" }),
          });
          const options = start.options;
          options.challenge = decode(options.challenge);
          if (register) {
            options.user.id = decode(options.user.id);
            options.excludeCredentials = options.excludeCredentials?.map(
              (c: any) => ({ ...c, id: decode(c.id) }),
            );
          } else
            options.allowCredentials = options.allowCredentials?.map(
              (c: any) => ({ ...c, id: decode(c.id) }),
            );
          const credential = (await (register
            ? navigator.credentials.create({ publicKey: options })
            : navigator.credentials.get({
                publicKey: options,
              }))) as PublicKeyCredential | null;
          if (!credential)
            throw new Error("Passkey prompt was closed. You can try again.");
          const r = credential.response;
          const response =
            r instanceof AuthenticatorAttestationResponse
              ? {
                  clientDataJSON: encode(r.clientDataJSON),
                  attestationObject: encode(r.attestationObject),
                  transports: r.getTransports(),
                }
              : {
                  clientDataJSON: encode(r.clientDataJSON),
                  authenticatorData: encode(
                    (r as AuthenticatorAssertionResponse).authenticatorData,
                  ),
                  signature: encode(
                    (r as AuthenticatorAssertionResponse).signature,
                  ),
                  userHandle: (r as AuthenticatorAssertionResponse).userHandle
                    ? encode((r as AuthenticatorAssertionResponse).userHandle!)
                    : null,
                };
          await request("/api/passkey", {
            method: "POST",
            body: JSON.stringify({
              action: prefix + "-verify",
              challengeId: start.challenge_id,
              credential: {
                id: credential.id,
                rawId: encode(credential.rawId),
                type: credential.type,
                authenticatorAttachment: credential.authenticatorAttachment,
                response,
                clientExtensionResults: credential.getClientExtensionResults(),
              },
            }),
          });
          toast.success(
            register ? "Your passkey is ready for next time." : "Welcome back.",
          );
          onDone?.();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <LoaderCircle size={18} className="spin" />
      ) : (
        <Fingerprint size={18} />
      )}{" "}
      {register ? "Set up Face ID / fingerprint" : "Sign in with a passkey"}
    </button>
  );
}
