# Stocket production setup and deployment

Follow these sections in order. Terminal commands use **Windows PowerShell**. SQL blocks go in your Supabase project's SQL Editor. This guide uses **Supabase + Netlify for web/PWA + Expo EAS for an Android APK on GitHub Releases**. Vercel and native iOS are alternatives described later.

Cloud accounts, credentials, publication, and live-device checks have not been performed by Codex. Completing a local build does not establish live production readiness.

## 1. Prerequisites and setup values

You need Git, Node.js 22+, GitHub, Supabase, Netlify, Expo, and a domain you control for sending sign-in emails. Resend supplies SMTP; Firebase enables native push; Gemini is optional.

Start from the repository root:

```powershell
Set-Location 'C:\Users\neame\Downloads\Stocket'
npm ci
npm run typecheck
npm test
npm run test:db
npm run build
```

Stop on a failed command. `npm ci` uses the committed lockfile. Review `npm audit` before public release: previous checks found unresolved transitive Expo/Firebase toolchain advisories. Do not use `npm audit fix --force` to downgrade/misalign Expo and React Native.

Save these values in a private note. **Every uppercase example below must be replaced with your actual value.**

| Value                    | Exact source / use                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| PROJECT_REF              | Supabase dashboard URL contains `/project/PROJECT_REF`; used by CLI linking                                   |
| SUPABASE_URL             | Supabase Connect / API settings: `https://PROJECT_REF.supabase.co`; same URL for both apps                    |
| PUBLIC_KEY               | Supabase API Keys: publishable `sb_publishable_...` or legacy `anon`; safe to bundle, access protected by RLS |
| DB_PASSWORD              | Password you choose creating Supabase; enter at CLI prompt                                                    |
| WEB_ORIGIN               | Stable HTTPS Netlify URL or your custom domain, with no trailing slash                                        |
| COMPANY_ID               | Returned by section 4's SQL                                                                                   |
| Resend key               | Resend API Keys; SMTP password and optional function email secret                                             |
| Gemini key               | Google AI Studio; Supabase function secret only                                                               |
| Firebase service account | Firebase Project settings → Service accounts; function secret only                                            |
| Firebase Android config  | Registered Firebase Android app's `google-services.json`; native build file                                   |
| ALERTS_CRON_SECRET       | Random value generated in section 9; function and Vault values must match                                     |

**Never put service-role/secret keys, Firebase service accounts, SMTP passwords, or Gemini keys into `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`.** App environment files use only the URL/public key. Supabase supplies privileged credentials inside its Edge Functions automatically.

## 2. Create Supabase and install the actual schema

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project**. Choose your organization, name `stocket-production`, a region near users, and a strong database password. Save the password privately.
2. Wait until provisioning completes. Copy PROJECT_REF, SUPABASE_URL, and PUBLIC_KEY from the project's Connect/API settings.
3. From the repository root:

```powershell
npx supabase login
npx supabase link --project-ref PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

Follow browser login and enter the database password if prompted. Confirm the linked project is your intended production project. The dry run must show these two pending files, and the migration list after pushing must show both applied remotely:

- `202610060001_inventory.sql`
- `202610060002_alerts.sql`

These migrations create tables, RPC functions, RLS, four shared categories, and Storage policies/bucket. Do not create look-alike tables or turn off RLS. Never use `db reset` on production.

In **SQL Editor → New query**, run:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'catalog-images';

select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace
and relname in ('companies','allowed_users','profiles','categories',
               'catalog_items','items','stock_events','push_tokens',
               'low_stock_deliveries');
```

Expected: all named tables exist; the bucket is private (`public=false`), limited to 1,048,576 bytes and WebP; every listed table has RLS enabled. Shared catalog/category/photo data crosses companies; stock counts, people, and events do not.

**If you already ran both migrations manually:** verify their actual schema first. Only then use `npx supabase migration repair 202610060001 202610060002 --status applied`, followed by `migration list` and `db push --dry-run`. Do not push the same SQL again blindly.

There is no separate database server or connection string to deploy. The apps talk to this Supabase project using its URL, public key, and verified user sessions.

## 3. Connect both local apps

Create these files once; edit existing files instead of overwriting saved credentials:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

`apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_KEY
NEXT_PUBLIC_ANDROID_DOWNLOAD_URL=https://github.com/oldVinyl
```

`apps/mobile/.env`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_KEY
```

The `_ANON_KEY` variable names accept a publishable key too. Both apps must use the same project. Restart web with `npm run dev`; in a second terminal at the root run `npm run start -w @stocket/mobile -- --clear`.

The real company appears only after sign-in/onboarding. Studio North/Alex/Local demo are isolated local demo data; they are not uploaded. Stocket branding stays the same for every company. A signed-out visitor can still intentionally explore the local demo.

## 4. Provision a company and invite real inboxes

In the production **SQL Editor**, replace the company name/email and run once:

```sql
with company as (
  insert into public.companies(name)
  values ('YOUR ACTUAL COMPANY NAME') returning id
)
insert into public.allowed_users(email,company_id)
select lower('YOUR_REAL_EMAIL@example.com'),id from company
returning company_id,email;
```

Save the returned COMPANY_ID. To add another person to that same company:

```sql
insert into public.allowed_users(email,company_id)
values (lower('SECOND_REAL_EMAIL@example.com'),
        'PASTE_EXISTING_COMPANY_UUID_HERE'::uuid);
```

Run the first query separately for each new company, not each new user. Each email belongs to one company and must be a reachable inbox. Do not manually insert `profiles`: verified onboarding creates them. Supabase's **Invite user** button does not replace this app's `allowed_users` record.

## 5. Configure production email authentication

Supabase's built-in test SMTP restricts recipients and is not a general production sender. Configure custom SMTP before inviting people. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

1. [Resend](https://resend.com) → **Domains → Add domain**: enter a sending domain/subdomain you own. Add the exact DNS records Resend shows at your DNS provider. Wait for **Verified**.
2. Resend → **API Keys**: create a sending key; save it privately.
3. Supabase → **Authentication → Email → SMTP Settings** (under Notifications): enable custom SMTP and enter:

| Field        | Exact value                             |
| ------------ | --------------------------------------- |
| Sender email | `no-reply@YOUR_VERIFIED_SENDING_DOMAIN` |
| Sender name  | `Stocket`                               |
| Host         | `smtp.resend.com`                       |
| Port         | `465`                                   |
| Username     | `resend`                                |
| Password     | Your Resend sending API key             |

Save. [Resend's Supabase SMTP instructions](https://resend.com/docs/send-with-supabase-smtp).

4. Supabase → **Authentication → Sign In / Providers**: enable Email, allow new email signups, and keep email confirmation enabled. First-time OTP users need an Auth account; `allowed_users`/RLS independently restrict company membership.
5. **Authentication → URL Configuration**: initially set Site URL `http://localhost:3000`; allow `http://localhost:3000/auth/callback` and `stocket://auth/callback`. If your dev server uses 3001, add its exact callback too. Section 7 sets the production address.
6. **Authentication → Email Templates**: edit **Magic Link** and **Confirm signup**. Set subject `Your Stocket sign-in code` and use this body for both:

```html
<h2>Sign in to Stocket</h2>
<p>Enter this code in the app:</p>
<p style="font-size:28px;letter-spacing:4px;font-weight:bold">{{ .Token }}</p>
<p>If you did not request this email, ignore it.</p>
```

Keep `{{ .Token }}` exactly. Both apps accept that email code; this path requires no deep link. [Template variables](https://supabase.com/docs/guides/auth/auth-email-templates).

7. Local web → **Connect your company** → enter allowed inbox → request/enter code → choose display name → finish onboarding. Skip passkey setup until section 11.
8. Expected: your actual company/name, empty real inventory. Add a supply; confirm `items` and `stock_events` rows in Supabase. Sign in with the same inbox on mobile, request a fresh code, and check it appears after sync.

Configure Auth email rate limits for expected usage; do not disable verification. Adding CAPTCHA in the Supabase dashboard requires a corresponding CAPTCHA-token flow in the apps, which is not currently implemented.

## 6. Deploy the companion web app to Netlify

The committed `netlify.toml` supplies workspace build paths and Netlify's Next.js adapter. **GitHub Pages/static export cannot host this app's Auth and sync route handlers.**

Netlify's Free plan allows commercial projects, with usage limits/credits that can pause a site. Review your account's limits before daily operational use. [Free-plan use](https://www.netlify.com/blog/introducing-netlify-free-plan/), [pricing](https://www.netlify.com/pricing/).

1. From the root, make sure the intended committed code reaches GitHub:

```powershell
git status
git push origin main
```

If you have uncommitted source changes, commit the intended files first. Do not commit environment files, `.secrets`, keystores, or APKs.

2. Netlify → **Add new project → Import an existing project → GitHub** → authorize/select **oldVinyl/Stocket**.
3. Production branch `main`; configure:

| Setting             | Exact value                                             |
| ------------------- | ------------------------------------------------------- |
| Base directory      | Empty (repository root)                                 |
| Package directory   | `apps/web`                                              |
| Build command       | `npm run build`                                         |
| Publish directory   | `apps/web/.next`                                        |
| Functions directory | Default; the Next.js adapter generates server functions |
| Node version        | `22` (also committed in config)                         |

Root installation is required for `@stocket/core`. The adapter hosts server routes instead of treating `.next` as static-only output. [Monorepo settings](https://docs.netlify.com/build/configure-builds/monorepos/), [Next.js support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

4. Add project environment variables for the **Production** context, available to **builds and runtime functions**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PUBLIC_KEY
NEXT_PUBLIC_ANDROID_DOWNLOAD_URL=https://github.com/oldVinyl
```

5. Deploy. Wait for **Published**. The build log must show Next.js and its adapter configuring server functions. Copy the stable HTTPS site URL as WEB_ORIGIN. A custom domain is optional: follow Netlify's supplied DNS values and wait for HTTPS before using it.
6. Open `WEB_ORIGIN/api/auth`. Signed out, it must return JSON with `user:null`, and must not say `configured:false`. If it serves a static 404, correct the Next.js adapter before continuing.

Whenever `NEXT_PUBLIC_*` changes, rebuild/redeploy: changing a dashboard value alone does not update compiled JavaScript. Keep production credentials out of untrusted Deploy Previews; use a separate Supabase test project for previews.

### Vercel alternative

If you choose Vercel instead, import the same repo, framework **Next.js**, Root Directory `apps/web`, enable **Include source files outside of the Root Directory in the Build Step**, install command `cd ../.. && npm ci`, build command `cd ../.. && npm run build`, output directory default. Set the same three Production environment variables, deploy, and use its stable HTTPS URL as WEB_ORIGIN. [Monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq).

Vercel Hobby is personal/noncommercial; company/commercial use requires an appropriate plan. Do not assume it is the free company hosting path. [Hobby restrictions](https://vercel.com/docs/plans/hobby). Choose one hosting path, not both.

## 7. Finalize hosted Auth and iPhone PWA

1. Supabase **Authentication → URL Configuration**: Site URL = WEB_ORIGIN, without `/auth/callback`; add exact `WEB_ORIGIN/auth/callback` to Redirect URLs. Keep explicit localhost redirects if needed; avoid arbitrary production wildcards.
2. Sign in to the deployed app with a fresh code. Confirm your real company and locally created stock appear.
3. Optionally append this browser link to both email templates after Site URL is production:

```html
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}"
    >Open Stocket in your browser</a
  >
</p>
```

The mobile code remains usable. Tokens/codes are one use: request a new code for each device login.

4. iPhone/iPad: open WEB_ORIGIN in **Safari → Share → Add to Home Screen**, name Stocket, enable **Open as Web App** if offered, then Add. Open the icon and sign in there; do not assume its session/cache is shared with Safari.
5. Load inventory online once, switch to airplane mode, reopen, adjust stock, reconnect, and confirm queue sync. First sign-in requires internet.

The iPhone PWA has web features/in-app stock reminders, **not native Firebase or browser Web Push**. This repository does not implement browser push subscriptions. Optional low-stock emails work for PWA users. A native iOS app is a separate later build.

## 8. Optional Gemini category suggestions

Manual categories and shared-catalog reuse work without AI.

1. [Google AI Studio](https://aistudio.google.com/api-keys): create a key and check that account's available Flash models/quota.
2. Supabase → **Edge Functions → Secrets**: add `GEMINI_API_KEY`; optionally `GEMINI_MODEL`. Code defaults to `gemini-2.5-flash`; verify its availability rather than assuming a permanent free allowance.
3. From the repository root:

```powershell
npx supabase functions deploy suggest-category
```

4. Verify it appears in Edge Functions. JWT verification is enabled in committed config; the handler also verifies the user/company profile. [Deployment](https://supabase.com/docs/guides/functions/deploy).
5. Signed-in Add item → use a name absent from the shared catalog → **Suggest a category**. Expect an existing category or editable suggestion. Confirm new categories manually. Missing/unavailable provider leaves manual selection usable.

## 9. Low-stock email/push and hourly schedule

The in-app bell works without these providers. Configure email first if desired; native push additionally needs section 10's registered device.

### Delivery secrets

Generate a private scheduler secret in PowerShell:

```powershell
$stocketCronSecret = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$stocketCronSecret | Set-Clipboard
```

Save privately; paste the same value into Supabase **Edge Functions → Secrets** as `ALERTS_CRON_SECRET`, and Vault below. This command copies it without printing it.

For email add function secrets `RESEND_API_KEY` and `ALERT_EMAIL_FROM`, e.g. `Stocket <no-reply@YOUR_VERIFIED_SENDING_DOMAIN>`. SMTP configuration alone does not supply these function secrets.

For native push:

1. Firebase → create a project → **Project settings → Cloud Messaging** → ensure **Firebase Cloud Messaging API (HTTP v1)** is enabled.
2. **Service accounts → Generate new private key**. Store privately, e.g. `.secrets/firebase-service-account.json` (ignored by Git).
3. Supabase function secret `FIREBASE_SERVICE_ACCOUNT` = **entire JSON contents**, not its path/base64. Includes `project_id`, `client_email`, `private_key`. Never put this file in the app bundle. [FCM v1 credentials](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

Deploy from the root:

```powershell
npx supabase functions deploy low-stock-alerts
```

Its gateway JWT check is disabled in `supabase/config.toml` because Cron uses a dedicated secret. The handler still checks exact `ALERTS_CRON_SECRET`; keep that authorization check.

### Vault and Cron

Supabase **Database → Extensions**: enable `pg_cron` and `pg_net` if needed. Open **Vault** (dashboard search can locate it) and create:

| Vault secret name            | Value                                                       |
| ---------------------------- | ----------------------------------------------------------- |
| `stocket_supabase_url`       | SUPABASE_URL, no trailing slash                             |
| `stocket_alerts_cron_secret` | Same generated secret as Edge Function `ALERTS_CRON_SECRET` |

SQL Editor, run once:

```sql
select cron.schedule(
  'stocket-low-stock-hourly', '0 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'stocket_supabase_url') || '/functions/v1/low-stock-alerts',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets
         where name = 'stocket_alerts_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);
select jobid,jobname,schedule,active from cron.job
where jobname = 'stocket-low-stock-hourly';
```

Expected: one active hourly UTC job. The stored job reads credentials from Vault. [Scheduling functions](https://supabase.com/docs/guides/functions/schedule-functions).

Create a below-threshold item, then test immediately (replace PROJECT_REF):

```powershell
$stocketAlertsUrl = 'https://PROJECT_REF.supabase.co/functions/v1/low-stock-alerts'
Invoke-RestMethod -Method Post -Uri $stocketAlertsUrl -Headers @{Authorization="Bearer $stocketCronSecret"} -ContentType 'application/json' -Body '{}'
```

With a configured reachable recipient, expect `sent` greater than zero and `failed=0`, plus an actual message. `sent=0` may mean no providers/tokens, no low stock, or a deduplicated prior alert; it is not evidence of delivery. Run twice while low: no spam. Replenish above threshold, run once to clear the claim, reduce stock, then run again: a new alert.

Check Edge Function logs and Cron job runs. SQL can inspect actual HTTP results:

```sql
select id,status_code,timed_out,error_msg,created
from net._http_response order by created desc limit 10;
```

Cron SQL success alone does not establish HTTP delivery. A 401 means mismatched secrets/gateway configuration; 500/207 requires function/provider log review.

## 10. Signed Android APK and GitHub download

### Firebase Android config, if using push

Firebase **Project settings → General → Add app → Android**: package **`com.stocket.app`**, nickname Stocket Android. Download `google-services.json` to `apps/mobile/google-services.json`. This is app config, **not** the private service account. Both belong to the same Firebase project. FCM does not need a signing fingerprint; passkeys later do.

For local native builds add `GOOGLE_SERVICES_JSON=./google-services.json` to `apps/mobile/.env`. It is ignored by Git. Dynamic config enables Firebase plugins when its file variable is present. Expo Go cannot test native remote push.

### EAS cloud setup

```powershell
Set-Location 'C:\Users\neame\Downloads\Stocket\apps\mobile'
npx eas-cli@latest login
npx eas-cli@latest init
```

Log in, create/link Stocket, and permit storing its public EAS project ID. This repo already supplies `eas.json`: do not replace its profiles. If EAS cannot edit the dynamic config, add `extra: { ...config.extra, eas: { projectId: "THE_EXACT_ID_EAS_RETURNED" } }` to the returned object in `app.config.ts`, then rerun `init`. Commit the actual project ID, not a placeholder.

Expo Dashboard → that project → **Environment variables**, production environment:

| Name                            | Type / visibility   | Value                          |
| ------------------------------- | ------------------- | ------------------------------ |
| `EXPO_PUBLIC_SUPABASE_URL`      | String / Plain text | SUPABASE_URL                   |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | String / Plain text | PUBLIC_KEY                     |
| `GOOGLE_SERVICES_JSON`          | File / Secret       | Upload the Android config file |

The APK profile uses the production environment explicitly. Local ignored `.env` files do not replace cloud variables. If launching without push, omit the Firebase file and do not enable remote notifications until a Firebase-enabled rebuild. [EAS variables](https://docs.expo.dev/eas/environment-variables/).

From `apps/mobile`:

```powershell
npx eas-cli@latest build --platform android --profile apk
```

Allow EAS to generate/manage the Android keystore if asked; securely back it up through EAS credentials management and use the same signing key for updates. This produces a signed release APK, not a development client/AAB/Expo Go URL, and opens without Metro. [APK configuration](https://docs.expo.dev/build-reference/apk/).

Download the finished APK. Install on a physical Android phone, authorize installation from that download source if asked, sign in, check tour/dark mode/icons, and enable low-stock notifications if Firebase is configured. Background the app, trigger section 9's delivery test, and verify actual receipt. A row in `push_tokens` must have the expected user/company and android platform.

### Publish the APK

1. [oldVinyl/Stocket Releases](https://github.com/oldVinyl/Stocket/releases) → **Draft a new release**.
2. Tag `v0.1.0` on the tested main commit, title Stocket v0.1.0, attach the signed file named **`stocket-android.apk`**, publish after physical checks.
3. Web hosting Production variable:

```dotenv
NEXT_PUBLIC_ANDROID_DOWNLOAD_URL=https://github.com/oldVinyl/Stocket/releases/latest/download/stocket-android.apk
```

4. Redeploy web. Open Meet your pocket companion and verify the Android button downloads that file. Keep the same asset filename on future releases. Private repos require recipient GitHub access; use public releases for public downloads.

For Google Play later, `--profile production` makes an AAB; follow Play's requirements separately. An AAB is not the APK people install from GitHub. Native configuration changes require a new binary; an OTA update cannot add native modules.

## 11. Optional passkeys and native iOS

OTP plus remembered sessions works without these. Passkeys are experimental; keep OTP available and verify actual supported devices before advertising them.

**Web:** Supabase Authentication → Sign In / Providers → Passkeys. Enable; display name Stocket; RP ID = bare stable WEB_ORIGIN hostname (no scheme/path/port); allowed origin = exact WEB_ORIGIN. Register after email verification, sync/sign out, verify passkey login. Changing the RP ID invalidates enrolled passkeys. [Passkey configuration](https://supabase.com/docs/guides/auth/passkeys).

**Android:** use a hostname you control, set local/EAS `PASSKEY_RP_DOMAIN`, host `/.well-known/assetlinks.json` with package `com.stocket.app`, relation `delegate_permission/common.get_login_creds`, and the actual production SHA-256 signing certificate fingerprint from EAS. Add Supabase's native origin `android:apk-key-hash:` plus the **base64url SHA-256 certificate digest**, not colon-separated hex. Include all production distribution signing certificates; Play signing can differ from your upload key. Rebuild/install and verify registration/login. Follow the native association format in the [Supabase guide](https://supabase.com/docs/guides/auth/passkeys).

**iOS native later:** section 7's PWA is the initial iPhone delivery. Native iOS requires Apple Developer provisioning/signing, App Store Connect/TestFlight, a Firebase iOS app registered as `com.stocket.app`, its `GoogleService-Info.plist` uploaded as EAS File variable `GOOGLE_SERVICE_PLIST`, and an APNs authentication key in Firebase Cloud Messaging. For passkeys set `PASSKEY_RP_DOMAIN` and host Apple's `apple-app-site-association` using your actual Apple Team ID and bundle identifier. Build with `npx eas-cli@latest build --platform ios --profile production`, test physical devices/TestFlight, then submit separately. Windows JS bundling is not an IPA/device test. [Firebase iOS setup](https://rnfirebase.io/messaging/usage/ios-setup).

## 12. Checks before giving it to companies

Run these on the hosted site and signed APK, not just localhost:

| Test                                            | Expected result                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| New invited email verifies and onboards         | Correct company/name; no demo stock                                                         |
| Uninvited email attempts onboarding             | Cannot enter/read a company's inventory                                                     |
| Company A adds stock; company B signs in        | B sees shared catalog contribution, not A's counts/users/events                             |
| Mobile add, web reload                          | Same stock record/count                                                                     |
| Add already stocked item with 3 units           | Count +3, same item count and threshold                                                     |
| Both devices offline; deduct 2 and 3; reconnect | Original minus 5, both events, no double retry                                              |
| Reopen previously loaded app offline            | Cache opens; changes queue and sync after reconnect                                         |
| New supply photo, reused by another company     | Shared photo/category, independent stock; signed-out Storage inaccessible                   |
| Remove/undo/restore, Activity                   | Correct record/history and actor labels                                                     |
| Scheduled alert, then repeat/reset              | Actual receipt, no spam until replenished and low again                                     |
| CSV/PDF both platforms                          | Current company only, correct counts, readable branded table                                |
| Short laptop, Android dark/light, iPhone PWA    | Controls visible, contrasts readable, guide usable                                          |
| Session restart/sign-out                        | Session persists; pending queue blocks sign-out; completed sign-out clears company snapshot |
| Optional passkeys                               | Verified registration/login/cancellation and OTP fallback on physical devices               |

Before operational release:

- Review Supabase Security Advisor/RLS, compatible dependency patches, and email rate limits.
- Establish and test backup/restore for **database, Auth identities/config, and Storage files** in a separate project. App CSV/PDF is not a full backup; database backups do not include stored image objects. Choose the backup facilities for your actual plan and separately copy Storage photos. Do not claim restore readiness until the restored test project signs in and shows its inventory/photos.
- Use a separate Supabase development/staging project once production contains real stock. New schema changes are new migrations; dry-run against the correct linked project and back up before applying.
- Monitor host credits/pausing, database/storage/function quotas, SMTP bounces, and Cron/FCM failures. Free plans are not unlimited capacity or uptime guarantees.
- A crash after an alert is claimed can strand a `low_stock_deliveries` row without delivery. Inspect that specific item/recipient and remove only the stranded claim in trusted SQL to retry; don't clear all claims.
- Revoke membership by removing both `allowed_users` invitation and `profiles` row, and disabling/deleting the Auth user if necessary. Removing only an invitation does not revoke an existing profile. Already cached offline data is not remotely erased; reconnect/sign-out and shared-device procedures remain necessary.
- Review `catalog_reports` as an operator and replace bad shared photos through trusted Storage/SQL. No automated moderation/operator UI exists.
- Sync pending changes before changing domains, uninstalling, or clearing browser storage. PWA/IndexedDB belong to an origin; a new domain gets a new cache/session and may require passkey changes.

## 13. Troubleshooting

| Symptom                           | Exact next check                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Studio North/Alex remains         | Connect your company, verify invitation/keys and complete verified profile; signed-out demo deliberately remains available |
| `/api/auth` says configured:false | Add both hosting Production variables and rebuild                                                                          |
| No OTP / Email not authorized     | Custom SMTP, verified domain, Auth logs, Resend delivery logs                                                              |
| Profile rejected                  | Lowercase allowed inbox, correct company UUID, schema applied to the apps' project                                         |
| Missing table/RPC                 | `migration list`, correct linked project, apply missing migration                                                          |
| Host cannot find @stocket/core    | Install from repo root; correct package/root-directory settings                                                            |
| Photo upload fails                | Private bucket, onboarded profile, WebP under 1 MB, Storage policy/logs; don't make bucket public                          |
| AI 401                            | Signed-in JWT and profile, correct project, function JWT config                                                            |
| AI error otherwise                | Deployment, Gemini key/model/quota, function logs; manual categories still work                                            |
| Alerts 401                        | JWT gateway disabled for scheduler function; Vault/function secrets exactly match                                          |
| Alerts sent:0                     | Low-stock items, configured providers/tokens, and prior delivery claims                                                    |
| Expo Go remote push error         | Test signed native APK; Expo Go lacks these native remote-push modules                                                     |
| Firebase default app missing      | Correct platform file variable present at build; rebuild/install                                                           |
| APK backend missing/wrong         | Correct EAS production EXPO_PUBLIC variables; rebuild; local .env edits do not change an installed APK                     |
| Passkey failure                   | Stable RP/origin, association file, actual signing certificate; use OTP fallback                                           |
| Cached old icon                   | Reload online; recreate PWA shortcut; native launcher changes need a new binary; sync before clearing data                 |

## Supplied logo assets

The menu/mobile logo remains its original vector implementation. Clean portable exports are in `assets/brand`: `stocket-logo.svg` and 2400px PNG, cream and dark-background variants, and `stocket-mark.svg`. Lettering is outlined, so recipients do not need a font installed. Browser favicon, PWA icon, Expo launcher, and Android adaptive foreground are configured from that chosen mark. No manual logo replacement is needed.
