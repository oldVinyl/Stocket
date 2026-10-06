# Stocket development guide

For the app introduction, see [README.md](README.md). For step-by-step deployment, see [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md).

**The stock manager you can keep in your pocket and operate from anywhere, at any time.**

An Expo mobile app and Next.js companion sharing a Supabase backend and a local-first inventory engine. The apps run immediately with a clearly labeled, persistent local demo. No demo data is uploaded or silently converted into company stock.

## Production setup

Follow [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) for the exact database, invitation, SMTP, hosting, scheduler, APK, and live verification steps. The approved logo has SVG and 2400px PNG exports in [assets/brand](assets/brand); browser and mobile/PWA icons are configured.

## Run locally

Node.js 22+ and npm are required.

```powershell
npm install
npm run dev
```

Open http://localhost:3000. For the mobile app:

```powershell
npm run mobile
```

The mobile app uses Expo SDK 57 and requires the SDK 57 version of Expo Go. After upgrading dependencies, stop the running Metro server with Ctrl+C and restart it with `npm run start -w @stocket/mobile -- --clear`, then scan the new QR code.

The pocket companion panel links to `https://github.com/oldVinyl` for now. Set `NEXT_PUBLIC_ANDROID_DOWNLOAD_URL` in the web environment to the GitHub release page or APK URL when it is ready, then rebuild. On iPhone/iPad, open the hosted web app in Safari and use Share → Add to Home Screen. The web manifest and Home Screen icon support opening it as a standalone app; production hosting should use HTTPS.

Expo Go can exercise the SQLite inventory, OTP flow, camera, and local exports. Passkeys and Firebase require a native development build. `npm run android -w @stocket/mobile` builds Android with its SDK installed; iOS builds require macOS/Xcode or EAS. No app-store deployment or EAS project has been created.

Remote push alerts are skipped in Expo Go; opening the push-alert setting explains that a development build is needed. Native notification modules load only after that runtime check, so Expo Go can open the inventory without the unsupported-push startup error. To test real push delivery, configure Firebase as described below, install a native Stocket development build on your device, and enable low-stock notifications there.

### Windows installation recovery

Before running `npm ci`, stop the Stocket web and Expo servers with **Ctrl+C** in their terminals. A running Next.js server can hold its native `.node` file open, causing `EPERM` when npm tries to replace it. Keep at least 2 GB of disk space available for installation, plus additional space for native builds.

If installation fails, fix the reported cause and rerun `npm ci` from the project root before running checks or starting the app. Missing `next`, `tsc`, `tsx`, or PGlite after a failed install means dependencies were only partly restored; those errors do not require changing application code.

In PowerShell, stop if installation reports an error:

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Installation failed. Fix the error before continuing.' }
npm run dev
```

## What is implemented

- Quicksand, Stocket colors, dark mode, safe areas, intentional catalog fallbacks, action toasts, and low-stock states using semantic orange.
- Inventory search, category/stock filters, grid/list views on web, stock adjustments, threshold editing, shared catalog name/category editing, history, local CSV/PDF exports, archive/undo, and later restoration.
- Shared catalog search before item creation; user-captured images compressed to WebP at a maximum 600px longest edge. Private Storage reads, cached images, and lightweight catalog reports on web.
- Manual category creation/editing/nesting on both platforms, cycle prevention, and optional provider-based AI category suggestions that require confirmation before creating a new category.
- Local SQLite on mobile, IndexedDB on web, serialized mutation queues, and retry-safe additive stock events. Web Locks prevent different tabs from overwriting each other's pending changes. A production service worker caches the app shell for offline reloads; development mode intentionally does not install it.
- Invitation-gated profile creation after email verification. Mobile sessions use versioned SecureStore chunks; web sessions stay in httpOnly, same-site cookies. Device information is only a label.
- Experimental passkey registration/sign-in on web and native, with an optional offer after first onboarding and an email fallback.
- Scheduled alert function with FCM on Android/iOS and optional Resend email, tenant-specific recipients, and deduplication until replenishment.

## Connect Supabase

1. Create a Supabase project, then apply both files in `supabase/migrations` using the CLI (`supabase link` / `supabase db push`) or the SQL editor in order. A local Docker-backed Supabase project can use `supabase start` / `supabase db reset`.
2. Copy `apps/web/.env.example` to `apps/web/.env.local`, and `apps/mobile/.env.example` to `apps/mobile/.env`. Fill in the same project URL and publishable/anon key. Never put the service-role key in either app. Restart the apps after changing environment variables.
3. Configure Auth's Site URL and allowed redirect URLs for your web origin and `/auth/callback`. The sample configuration includes localhost and `stocket://auth/callback`; mobile currently uses the email OTP entry flow, avoiding a dependency on deep-link behavior.
4. Configure the magic-link email template to include **`{{ .Token }}`**, so mobile users can enter the code. A web link can use `{{ .RedirectTo }}?token_hash={{ .TokenHash }}`; `/auth/callback` verifies that token hash. Standard PKCE confirmation links are also accepted through the `code` callback. Configure your SMTP sender for company email delivery.
5. Provision the company and invitation in the SQL editor or another trusted administrator environment. The application deliberately has no user-managed roles or client-writable allowlist:

```sql
with company as (
  insert into public.companies(name) values ('Your Company') returning id
)
insert into public.allowed_users(email,company_id)
select 'person@your-company.com',id from company;
```

Additional invitations use the existing company UUID. Emails must be lowercase; an email belongs to one company. Everyone who completes onboarding can manage that company's stock. Uninvited Auth accounts may exist, but cannot create a profile or read inventory/catalog data. Revoking a company member requires removing their profile (and, if needed, their Auth account) as well as their invitation; removing only an invitation does not revoke an existing profile.

## Data and sync behavior

`categories` and `catalog_items` are shared. `companies`, `profiles`, `items`, and `stock_events` use tenant RLS. `allowed_users`, mutation receipts, aliases, and notification tokens are inaccessible to clients. Stock writes go through `apply_inventory_mutation`; clients cannot overwrite quantities, change their company, or forge the actor.

Each queued command receives one UUID. The database claims that ID and writes the event and quantity inside one transaction. It locks the item and recomputes quantity from its events. Replaying a successful command does nothing. Independently added equivalent catalog names resolve to one catalog entry; client item aliases merge two devices' starting stock into the same company record and route later deltas correctly.

Negative quantities are preserved when concurrent offline deductions exceed stock, making the discrepancy visible. Quantities are never clamped or replaced by an absolute client value. Metadata uses timestamps for last-write-wins; an independent metadata timestamp prevents a later quantity event from suppressing an earlier metadata edit. Client clocks more than five minutes in the future are rejected. Queued changes are retained when sync fails, with a retry action on web; pending changes block sign-out.

Both apps paginate catalog/category/inventory reads. The visible stock log pulls the latest 200 events; older events remain in Postgres and still count toward stock. Company inventory is cached locally only after a verified session. A prior user identity lets an already-used browser reopen its local cache offline; that identity does not authorize server access. Signing out clears that user's inventory snapshot. Use separate OS/browser profiles on shared devices if local stock data should not be visible to the next device user.

## Passkeys

Enable experimental passkeys in Supabase Auth and configure a stable relying-party ID and allowed origins. The code opts into `auth.experimental.passkey` and uses the two-step API so web sessions can remain in httpOnly cookies. This API requires a current Supabase JS SDK; the lockfile pins the installed versions.

For native builds, set `PASSKEY_RP_DOMAIN` and host the Apple `apple-app-site-association` and Android `assetlinks.json` association files for your bundle/package identifiers and signing certificates. Add your Android native origin to Supabase. Face ID/fingerprint capability, associations, cancellation, and returning-user sessions need physical-device verification. Email sign-in remains available when passkeys are unavailable. See [Supabase passkey setup](https://supabase.com/docs/guides/auth/passkeys).

## AI category suggestions

Deploy `suggest-category` with a verified JWT. Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` as Edge Function secrets. The default model is `gemini-2.5-flash`; choose a currently supported Flash model in your account. No API key reaches the client. The provider interface is in `supabase/functions/_shared/category-provider.ts`; another provider can implement the same interface.

Existing catalog entries reuse their category. New names can request a suggestion, then select/edit the category manually. New nested suggestions are shown for confirmation. Missing keys or provider failures leave manual categorization usable. No image generation or image search is used.

## Push and email alerts

Deploy `low-stock-alerts` with gateway JWT verification disabled (`supabase functions deploy low-stock-alerts --no-verify-jwt`). It performs its own check against a dedicated random `ALERTS_CRON_SECRET`; do not disable that check. Set the following Edge Function secrets:

- `ALERTS_CRON_SECRET`: random private scheduler secret.
- `FIREBASE_SERVICE_ACCOUNT`: full service-account JSON for FCM HTTP v1, with messaging permission.
- Optional `RESEND_API_KEY` and `ALERT_EMAIL_FROM`: an authorized sender address.

For native Firebase builds, set `GOOGLE_SERVICES_JSON` and/or `GOOGLE_SERVICE_PLIST` to your Firebase mobile config files. `app.config.ts` adds the Firebase plugins and static iOS frameworks when these files are configured. Enable FCM and configure an APNs key in Firebase for iOS. The native notification action obtains an **FCM token on both platforms**, rather than confusing an APNs token with an FCM token. The Firebase configurations and service-account secrets are not included. See [React Native Firebase setup](https://rnfirebase.io/) and [iOS messaging setup](https://rnfirebase.io/messaging/usage/ios-setup).

In Supabase Cron, schedule an HTTP POST to `https://YOUR_PROJECT.supabase.co/functions/v1/low-stock-alerts`, for example hourly, with `Authorization: Bearer YOUR_ALERTS_CRON_SECRET`. Store that secret in Vault or the dashboard's secret configuration, not in a committed migration. The repository does not create an external schedule automatically.

Alerts go to profiles/tokens from the item's own company. Successfully claimed alerts are deduplicated while stock stays low and reset after replenishment or removal. Failed deliveries release the claim for retry. A process crash after claiming but before delivery can leave an alert claim stranded; inspect `low_stock_deliveries` and remove that claim to retry. This lightweight delivery flow is not a guaranteed-delivery messaging system.

## Assets

The approved brand mark and launcher icons are supplied; see `ASSETS_NEEDED.md` for exact asset paths. The original vector sidebar/mobile headers are preserved. Shared photos can be reported through the web item menu; an operator can review `catalog_reports` and replace a bad image through a trusted Storage/SQL environment. No full moderation workflow is implemented.

## Verify

```powershell
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
# With the web server running:
npm run test:e2e
```

The database test executes the actual migrations in embedded Postgres (PGlite) with small Auth/Storage schema stubs. It verifies invitation gating, tenant isolation, shared catalog reads, blocked direct writes, additive stock, and retry idempotency. It does not replace testing hosted Supabase Auth and Storage.

To test the production offline shell, build/start the web app first, then set `TEST_OFFLINE_SHELL=1` and `PLAYWRIGHT_BASE_URL` to that server's URL before `npm run test:e2e`. To validate the native JS bundle:

```powershell
cd apps/mobile
npx expo export --platform android --output-dir ../../artifacts/mobile-bundle
```

**Deployment verification still required:** real email delivery, hosted RLS/Storage, two signed-in physical devices, passkeys, camera capture, native notification permissions/delivery, AI responses, and scheduling. No Supabase/Firebase/Gemini/Resend credentials were provided, so these integrations have implementation and setup instructions but were not exercised against live accounts. Native JS bundling is not an APK/IPA build or a device test.

Dependency audit currently reports transitive advisories in the Expo/React Native build toolchain and Firebase dependencies. No compatible automatic fix resolved all of them; forcing npm's suggested SDK downgrades/major React Native upgrades would break the Expo version alignment. Review upstream patches before production deployment. The earlier direct jsPDF advisory was resolved by upgrading to 4.2.1.

Conventional Commits are used at logical milestones. No hosting, app-store publication, or external account changes have been performed.
