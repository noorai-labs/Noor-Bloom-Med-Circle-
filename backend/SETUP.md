# Google authentication and private cloud care

The Expo app has two explicit modes. `demo` preserves the existing local walkthrough. `cloud` uses Clerk Google sign-in and a Cloudflare Worker with D1 and a private R2 bucket. Cloud mode never imports the shared demo data into a new account or accepts client-selected roles.

## Account configuration

1. In Clerk, enable Google as the only sign-in connection. Disable email/password, phone, and other social sign-in methods. Enable the Native API. For the custom OAuth flow, register the native app redirect `bloommed://sso-callback`. Google SSO needs an installed development or release build; do not test this flow in Expo Go. Clerk production Google connections need your Google OAuth credentials configured in its dashboard. Configure sign-up requirements so Google supplies all required identity fields; patient details are collected inside BLOOM MED. MFA and Clerk session-task continuation are not implemented in this initial Google-only flow, so do not enable those requirements yet.
2. Set native app identifiers before making your own development/release build. Register those identifiers and the callback with Clerk. Use the configured `com.noorailabs.bloommed` identifiers and a development build for the OAuth callback.
3. Create or select an R2 bucket and D1 database. Keep R2 public development URLs disabled. Change `bucket_name`, `database_name`, and `database_id` in `wrangler.jsonc` to your resources. Configure `CLERK_ISSUER` to your exact Clerk frontend API issuer URL. Set `AUTHORIZED_PARTIES` to the comma-separated OAuth application origins used by your sessions, and `ALLOWED_ORIGINS` to any browser preview origins you explicitly want to allow. Native bearer requests do not need CORS origins.
4. Put the Clerk **JWT public PEM key** in the Worker's `CLERK_JWT_KEY` secret binding using `npx wrangler secret put CLERK_JWT_KEY --config backend/wrangler.jsonc`. This is the verification public key from Clerk, not the publishable key or a Google credential. No R2 access keys are needed: the Worker accesses R2 through its bucket binding.
5. Apply the schema with `npx wrangler d1 migrations apply bloom-med --remote --config backend/wrangler.jsonc` and deploy with `npx wrangler deploy --config backend/wrangler.jsonc`. Substitute your configured database name. These commands change your cloud account. The initial deployment has now been applied to the configured BLOOM MED account.
6. Copy `.env.example` to `.env.local`, set `EXPO_PUBLIC_APP_MODE=cloud`, your Clerk publishable key, and `EXPO_PUBLIC_API_URL=https://YOUR-WORKER-URL`. Restart Expo. Secrets must never use the `EXPO_PUBLIC_` prefix.

## Care team access

Each Google account automatically gets an empty patient care space. Its ID is `personal_<Clerk user ID>`. A trusted operator grants staff/family membership through D1. The client has no endpoint for granting itself access:

```sql
INSERT INTO memberships (user_id, space_id, role, provider_id)
VALUES ('user_DOCTOR_ID', 'personal_user_PATIENT_ID', 'Doctor', '1');
```

Use `Nurse` and the corresponding provider ID, or `Family` with an empty provider ID. Family membership also needs the patient's consent switch. Delete the membership to revoke staff access. The app's Profile screen lists the user's authorized care spaces and roles. IDs `1`, `2`, etc. and `n1`, `n2` refer to the existing **fictional** provider directory; replace those fixtures with your verified provider directory before offering real care bookings. Cloud bookings stay requested until an assigned professional confirms them. Staff access is scoped to the patient care space and the professional's assigned visits; patient records are shared within that authorized care space.

## Data behavior and limits

- Profiles, visit transitions, consultations, prescriptions, dose logs, activity, consent and support requests are validated by the Worker and stored in D1. Optimistic changes have stable IDs, serialize per client, and rebase on confirmed snapshots. Revision checks prevent one device from silently overwriting another. Failed writes revert; refresh before retrying. There is no offline write queue. Updates refresh on app foreground and every 30 seconds while active.
- R2 accepts PDF/JPEG/PNG/WebP up to 15 MB. Private downloads require a valid Clerk session and authorized care-space membership; objects do not have public URLs. Removing the last record referencing an attachment schedules its deletion. Uploads that never become records can leave orphan objects; add scheduled cleanup and storage quotas before a public launch.
- Tokens use Clerk's SecureStore cache on native devices. Cloud care data is held in memory rather than the demo AsyncStorage key. Downloaded attachment cache is scoped by user and removed on sign-out.
- The assistant, voice interaction, SOS and payments remain simulations. Support requests are saved in the care space; there is no external notification dispatch yet. Audit trails, production monitoring, backup/retention policy, invite UI, verified provider onboarding and real care-service integrations remain rollout work.

## Verification

`npm run test:cloud` bundles the Worker without deploying and runs an isolated local Miniflare instance. It exercises signed JWTs, account isolation, server-assigned doctor access, complete booking/consultation/medicine flow, private R2 uploads/downloads, family consent, revision conflicts, and record removal. It uses generated test RSA keys, not your cloud credentials. Live Google OAuth and your actual R2/D1 resources still need verification after account configuration.

References: [Clerk Expo OAuth](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections), [Clerk token verification](https://clerk.com/docs/reference/backend/verify-token), [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).

## Current deployment

Worker: https://bloom-med-api.ancdominater.workers.dev

D1 `bloom-med` uses the configured database ID; migrations 0001, 0002 and 0003 are applied. R2 `bloom-med-records` has public development URL access disabled. Clerk verification uses the public signing key from the configured issuer. Live Google sign-in still requires testing on the phone and Google/Native API configuration in the Clerk dashboard.

## Records and session update (25 October 2026)

Patient identity verification is deferred and no verification gate is enabled. Google remains the only sign-in provider; do not require a phone number in Clerk unless an additional completion flow is built. Sessions use SecureStore on native devices, fresh API tokens, a waiting callback screen, persistent flow errors across navigation, and sign-out cache isolation. Google recovery opens Google's official recovery flow; BLOOM MED does not handle passwords. Test login, app termination/relaunch, account switching and sign-out on the installed APK.

Apply migration 0002_records.sql before deploying this Worker. Patients retain their own access. Operations Admin memberships cannot read clinical care spaces. Assigned doctors/nurses must have at least one non-cancelled visit; clinical history/documents additionally require records_access. Family members require patient consent and records_access. New grants default to zero; patients can review and grant/revoke access for already assigned non-admin members in Records. Granting does not create memberships. Revocation blocks future requests but cannot recall copies downloaded outside the app.

Uploads get server-authored provenance and are explicitly labeled as patient-provided, not clinically verified. Existing uploads have unknown original provenance until amended. Patients can correct their own document descriptions with a required reason; D1 transactions preserve versions and reject stale/concurrent writes. Original file bytes are unchanged. Metadata versions and audit events are retained when a document is removed; private file removal uses the existing asynchronous cleanup. Define an approved retention/purge policy before using real patient records. Audit events contain actor/target IDs and action names, not document text or audio; access to audit tables is restricted to backend operators.

Verification regression: npm run test:cloud exercises expired/forged/wrong-issuer tokens, patient isolation, admin denial, explicit grants and revocation, file authorization, audit events, original provenance and concurrent amendments. Live OAuth cannot be completed by the automated backend suite.

## Email-code sign-in

The app now supports Google plus passwordless email codes for existing and new accounts. Enable Email address and email verification codes for sign-in/sign-up in the same Clerk instance as the app publishable key. Keep password and phone requirements disabled unless a completion UI is implemented. Sign-in and sign-up are separate. Clerk's identifier-not-found result shows Account not found with an explicit Create account action; no account is created until the user chooses registration. Email codes are issued and verified by Clerk, never by the Worker. Wrong/expired codes leave the form retryable, resend has a 30-second local cooldown in addition to Clerk rate limits, and sessions use the same SecureStore and cloud authorization. Email ownership is not patient identity verification. Account linking remains governed by Clerk; this app never merges patient care spaces based on an unverified address. No email-delivery success is claimed until the dashboard configuration and real inbox/device flow are tested.

## Explicit account creation and brand assets

Email login does not create accounts automatically. An unknown email shows Account not found and a Create account action; the separate signup route sends its own verification code. Clerk must have Require password at sign-up disabled for OTP-only signup. The app handles an already-verified email by resuming a completed Clerk session or reporting incomplete account setup without asking for the same code repeatedly.

Public brand image: https://pub-b3a4fce9843242c59ef266bfd5409265.r2.dev/bloom-med/branding/bloom-logo-v2.png (diffusionbucket, public artwork only). BloomLogo uses this URL with its bundled image as a fallback. Health attachments remain in the separate private bloom-med-records bucket. For Clerk-rendered emails, the application branding/email template must be configured in Clerk separately; uploading to R2 does not itself change Clerk settings.

## Cloud medicine reminders — existing Worker

Implemented in `worker.ts` and `reminders.ts`; no additional public service or domain is needed. The existing D1 holds shared reminder preferences, revision numbers, patient-scoped device registrations and a 30-day delivery ledger. A SQLite-backed `MedicineReminderScheduler` Durable Object per patient/care space runs the next due alarm, reads current medicine and membership data, and sends generic notifications through Expo Push Service. R2 remains for files and is not used as a scheduler.

Authenticated endpoints: GET/POST `/v1/reminders?space=...`, POST `/v1/reminders/device?space=...`, POST `/v1/reminders/test?space=...`, POST `/v1/reminders/revoke-session`. Only Patient memberships can manage settings/devices. The last endpoint removes registrations for the current Clerk session before native sign-out. Backend session revocation outside the app (including Clerk dashboard revocations) requires a verified Clerk webhook integration before claiming immediate remote revocation; this implementation does not poll Clerk session status for each push.

Preferences are shared across a patient's devices; delivery mode and IANA timezone are per device. Each phone explicitly uses local alerts OR cloud push. Switching back to local revokes its cloud push registration first. No automatic failover sends both methods. Offline phones retain their last local schedule until they sync; server push needs connectivity. Foreground sync runs every 30 seconds and on app activation. Medicine edits wake the existing scheduler; every alarm checks current active medicines. Already submitted pushes cannot be recalled. Daily schedules do not infer free-text prescription duration and do not stop merely because a dose is marked taken.

Alarms and repeated hours are deduplicated by device, medicine, local date and selected time. A DST spring gap skips that nonexistent wall-clock time; a repeated fall time produces one occurrence. Overdue alerts expire after a 15-minute catch-up window. Push requests are batched up to 100. Explicit per-ticket rate errors retry with bounded exponential backoff. An ambiguous timeout/crash is recorded as uncertain and is not blindly resent, since Expo provides no exactly-once guarantee. Accepted tickets are checked after 15 minutes; `provider_received` means handoff to FCM/APNs, not seen by the patient. Invalid tokens are disabled. Do not describe this system as guaranteed or safety-critical delivery.

Activation steps (not executed by local tests):

1. Review and apply migrations 0002 and 0003 to the existing database: `npx wrangler d1 migrations apply bloom-med --remote --config backend/wrangler.jsonc`.
2. Deploy the existing Worker with its new Durable Object binding and migration: `npx wrangler deploy --config backend/wrangler.jsonc`. This creates scheduler storage in the same Cloudflare account; it does not create another API project.
3. For Android package `com.noorailabs.bloommed`, download Firebase's **client** `google-services.json` into the app root, or configure the EAS file variable `GOOGLE_SERVICES_JSON`. `app.config.ts` detects either. The ignored local file must be provided again to EAS (file environment variable) for cloud builds. Separately upload the **FCM V1 service account private key** to the Expo project's Android push credentials using `npx eas-cli@latest credentials`; never bundle that private key or send it to the app/Worker. For iOS, configure APNs credentials in EAS as well.
4. Enable Expo enhanced push security if desired, then set its access token as a Worker secret using `npx wrangler secret put EXPO_ACCESS_TOKEN --config backend/wrangler.jsonc`. The Worker supports this optional header. Never use an `EXPO_PUBLIC_` variable for this token.
5. Build a new APK: `npx eas-cli@latest build --platform android --profile preview`. Server push is blocked with a clear explanation in Expo Go; local reminders remain available there.
6. On a physical installed build, enable medicine notifications, choose cloud push, send the cloud test, then test a future medicine time with the app closed. Check provider receipts, archive cancellation, app restart, sign-out and a second account. Local tests mock all Expo network responses and do not verify a live handset.

Local verification: `npm test`, `npm run typecheck`, `npm run lint`, `npm run typecheck:backend`, `npm run test:cloud`. The integration suite uses an isolated D1/R2/DO instance and actual local alarm execution; all outbound push traffic is intercepted, so tests do not send notifications or deploy resources.

## Live reminder deployment — 25 October 2026

User-approved migrations 0002_records.sql and 0003_reminders.sql were applied successfully to the existing bloom-med D1 database. The existing bloom-med-api Worker was deployed with the REMINDERS Durable Object binding; version d845a004-d0ac-43ef-a117-975dbd21db48. Health returned HTTP 200, and unauthenticated state/reminder requests returned HTTP 401. Wrangler confirms no pending migrations. Live authenticated reminder delivery has not yet been tested. Firebase FCM/EAS credentials, a configured client build and a physical-device push test remain necessary.
