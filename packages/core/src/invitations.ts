export interface InvitationBackend {
  allow(email: string): Promise<{ email: string; created: boolean }>;
  sendEmail(email: string): Promise<void>;
}

/** Persist membership eligibility before sending a verification email. */
export async function inviteTeammate(
  email: string,
  backend: InvitationBackend,
) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error("Enter a valid teammate email.");
  const invitation = await backend.allow(normalized);
  if (!invitation.created)
    return {
      emailSent: false,
      warning: false,
      message:
        "Already invited! They can request a fresh code from Stocket's sign-in screen.",
    };
  try {
    await backend.sendEmail(invitation.email);
    return {
      emailSent: true,
      warning: false,
      message:
        "Teammate invited! Ask them to open Stocket and enter the code in their email.",
    };
  } catch {
    return {
      emailSent: false,
      warning: true,
      message:
        "Teammate added, but the email couldn't be sent. They can request a code from Stocket's sign-in screen. If that fails, check Auth email delivery.",
    };
  }
}
