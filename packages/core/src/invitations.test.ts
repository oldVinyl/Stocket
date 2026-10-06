import test from "node:test";
import assert from "node:assert/strict";
import { inviteTeammate } from "./invitations";

test("invitations normalize addresses and persist eligibility before emailing", async () => {
  const calls: string[] = [];
  const result = await inviteTeammate("  TEAM@Office.com ", {
    allow: async (email) => {
      calls.push(`allow:${email}`);
      return { email, created: true };
    },
    sendEmail: async (email) => {
      calls.push(`email:${email}`);
    },
  });
  assert.deepEqual(calls, ["allow:team@office.com", "email:team@office.com"]);
  assert.equal(result.emailSent, true);
});
test("rejected or repeated invitations never send email", async () => {
  let sent = 0;
  const backend = {
    allow: async (email: string) => ({ email, created: false }),
    sendEmail: async () => {
      sent++;
    },
  };
  await assert.rejects(
    inviteTeammate("invalid", backend),
    /valid teammate email/,
  );
  await inviteTeammate("member@office.com", backend);
  await assert.rejects(
    inviteTeammate("member@office.com", {
      ...backend,
      allow: async () => {
        throw new Error("Not your company");
      },
    }),
    /Not your company/,
  );
  assert.equal(sent, 0);
});
test("email failure preserves the invitation and provides a sign-in recovery path", async () => {
  const result = await inviteTeammate("member@office.com", {
    allow: async (email) => ({ email, created: true }),
    sendEmail: async () => {
      throw new Error("SMTP unavailable");
    },
  });
  assert.equal(result.warning, true);
  assert.equal(result.emailSent, false);
  assert.match(result.message, /Teammate added/);
});
