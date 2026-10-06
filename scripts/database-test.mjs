import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name,'/') $$;
GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`);
for (const file of [
  "202610060001_inventory.sql",
  "202610060002_alerts.sql",
  "202610060003_teammate_invitations.sql",
])
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/" + file, import.meta.url),
      "utf8",
    ),
  );
const companyA = "20000000-0000-4000-8000-000000000001",
  companyB = "20000000-0000-4000-8000-000000000002",
  userA = "50000000-0000-4000-8000-000000000001",
  userB = "50000000-0000-4000-8000-000000000002",
  outsider = "50000000-0000-4000-8000-000000000003";
await db.exec(
  `INSERT INTO public.companies(id,name) VALUES('${companyA}','A'),('${companyB}','B'); INSERT INTO auth.users VALUES('${userA}','a@a.com',now()),('${userB}','b@b.com',now()),('${outsider}','x@x.com',now()); INSERT INTO public.allowed_users(email,company_id) VALUES('a@a.com','${companyA}'),('b@b.com','${companyB}');`,
);
const asUser = async (id) => {
  await db.exec(
    `RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`,
  );
};
await asUser(outsider);
await assert.rejects(
  db.query("SELECT public.onboard('Outsider','Phone')"),
  /not invited/,
);
await assert.rejects(
  db.query("SELECT public.invite_teammate('new@office.com')"),
  /Complete company sign-in/,
);
for (const id of [userA, userB]) {
  await asUser(id);
  await db.query("SELECT public.onboard('Member','Phone')");
}
const op = {
  id: crypto.randomUUID(),
  item_id: "40000000-0000-4000-8000-000000000001",
  kind: "add",
  source: "online",
  created_at: new Date().toISOString(),
  delta: 24,
  threshold: 5,
  catalog: {
    id: "30000000-0000-4000-8000-000000000001",
    name: "Paper",
    category_id: "10000000-0000-4000-8000-000000000001",
  },
};
const push = (op) =>
  db.query("SELECT public.apply_inventory_mutation($1::jsonb)", [
    JSON.stringify(op),
  ]);
await asUser(userA);
await push(op);
await push(op);
assert.equal(
  Number((await db.query("SELECT quantity FROM items")).rows[0].quantity),
  24,
);
assert.equal((await db.query("SELECT * FROM stock_events")).rows.length, 1);
await assert.rejects(
  db.query("UPDATE items SET quantity=999"),
  /permission denied/,
);
await assert.rejects(
  db.query("UPDATE profiles SET company_id=$1", [companyB]),
  /permission denied/,
);
await assert.rejects(
  db.query("SELECT * FROM allowed_users"),
  /permission denied/,
);
await asUser(userB);
assert.equal((await db.query("SELECT * FROM items")).rows.length, 0);
assert.equal((await db.query("SELECT * FROM stock_events")).rows.length, 0);
assert.equal((await db.query("SELECT * FROM catalog_items")).rows.length, 1);
assert.equal((await db.query("SELECT * FROM profiles")).rows.length, 1);
await assert.rejects(
  push({ ...op, id: crypto.randomUUID(), kind: "adjust", delta: -1 }),
  /not in your company/,
);
await assert.rejects(push(op), /another company/);
await asUser(userA);
const change = { ...op, id: crypto.randomUUID(), kind: "adjust", delta: -4 };
await push(change);
await push(change);
await push({ ...change, id: crypto.randomUUID(), delta: -3 });
assert.equal(
  Number((await db.query("SELECT quantity FROM items")).rows[0].quantity),
  17,
);
assert.equal((await db.query("SELECT * FROM stock_events")).rows.length, 3);
// Simultaneous offline additions of the same catalog supply merge into one stock
// row; later commands using the losing client ID still reach that row.
const duplicate = {
  ...op,
  id: crypto.randomUUID(),
  item_id: crypto.randomUUID(),
  delta: 5,
  catalog: { ...op.catalog, id: crypto.randomUUID() },
};
await push(duplicate);
await push({
  ...duplicate,
  id: crypto.randomUUID(),
  kind: "adjust",
  delta: -2,
});
assert.equal(
  Number((await db.query("SELECT quantity FROM items")).rows[0].quantity),
  20,
);
assert.equal((await db.query("SELECT * FROM items")).rows.length, 1);
const historical = new Date(Date.now() - 3600000).toISOString(),
  offline = {
    ...op,
    id: crypto.randomUUID(),
    item_id: crypto.randomUUID(),
    created_at: historical,
    catalog: {
      ...op.catalog,
      id: crypto.randomUUID(),
      name: "Offline stapler",
    },
  };
await push(offline);
await push({
  ...offline,
  id: crypto.randomUUID(),
  kind: "adjust",
  delta: 1,
  created_at: new Date(Date.now() - 1000000).toISOString(),
});
await push({
  ...offline,
  id: crypto.randomUUID(),
  kind: "edit",
  threshold: 12,
  created_at: new Date(Date.now() - 2000000).toISOString(),
});
assert.equal(
  (
    await db.query("SELECT low_stock_threshold FROM items WHERE id=$1", [
      offline.item_id,
    ])
  ).rows[0].low_stock_threshold,
  12,
);
const child = crypto.randomUUID(),
  childOp = {
    id: crypto.randomUUID(),
    item_id: child,
    created_at: new Date(Date.now() + 1000).toISOString(),
    source: "online",
    kind: "category",
    category: {
      id: child,
      name: "Nested paper",
      parent_id: op.catalog.category_id,
    },
  };
await push(childOp);
await assert.rejects(
  push({
    ...childOp,
    id: crypto.randomUUID(),
    item_id: op.catalog.category_id,
    category: { id: op.catalog.category_id, name: "Paper", parent_id: child },
  }),
  /nested inside itself/,
);
await asUser(userA);
await assert.rejects(
  db.query("SELECT public.invite_teammate('invalid')"),
  /valid teammate email/,
);
await assert.rejects(
  db.query("SELECT public.invite_teammate('b@b.com')"),
  /cannot be invited/,
);
const invitation = await db.query(
  "SELECT public.invite_teammate('  X@X.COM  ') AS result",
);
assert.equal(invitation.rows[0].result.created, true);
assert.equal(
  (await db.query("SELECT public.invite_teammate('x@x.com') AS result")).rows[0]
    .result.created,
  false,
);
await db.exec("RESET ROLE");
const allowed = (
  await db.query("SELECT * FROM allowed_users WHERE email='x@x.com'")
).rows[0];
assert.equal(allowed.company_id, companyA);
assert.equal(allowed.invited_by, userA);
await asUser(userB);
await assert.rejects(
  db.query("SELECT public.invite_teammate('x@x.com')"),
  /cannot be invited/,
);
await asUser(outsider);
const joined = await db.query(
  "SELECT to_jsonb(public.onboard('Teammate','Phone')) AS profile",
);
assert.equal(joined.rows[0].profile.company_id, companyA);
await db.exec(
  `RESET ROLE; INSERT INTO auth.users VALUES('${crypto.randomUUID()}','unverified@a.com',null);`,
);
const unverified = (
  await db.query("SELECT id FROM auth.users WHERE email='unverified@a.com'")
).rows[0].id;
await asUser(userA);
await db.query("SELECT public.invite_teammate('unverified@a.com')");
await asUser(unverified);
await assert.rejects(
  db.query("SELECT public.onboard('Unverified','Phone')"),
  /Verify your email/,
);
await db.exec("RESET ROLE; SET ROLE anon;");
await assert.rejects(
  db.query("SELECT public.invite_teammate('anonymous@a.com')"),
  /permission denied/,
);
console.log(
  "Database checks passed: migrations, invitation gating, shared catalog, tenant isolation, blocked direct writes, additive quantities, and idempotent retries.",
);
await db.close();
