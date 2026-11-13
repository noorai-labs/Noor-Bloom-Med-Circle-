# Self-hosted LiveKit consultations

BLOOM MED uses its existing Cloudflare Worker to authorise appointments and issue LiveKit credentials. Audio/video runs on the user-owned OCI Ubuntu ARM64 VM, SSH alias `Neon-VC`, at `140.245.16.5`. No paid call-service account is used.

## Deployment

- Signalling/API: `wss://bloom-calls.140-245-16-5.sslip.io`.
- TURN hostname: `bloom-turn.140-245-16-5.sslip.io`.
- Host directory: `/opt/bloom-livekit`, root-only permissions.
- Official LiveKit server v1.13.11 and LiveKit Caddy L4 containers, pinned by immutable image digests in the generated Compose configuration.
- Trusted certificates obtained and renewed by Caddy. The free IP-based DNS hostnames avoid a purchased domain for the pilot; they depend on the external DNS service and a stable OCI public IP. Move to an owned domain for a public launch.
- OCI NSG and host firewall permit TCP 80/443/7881, UDP 3478 and UDP 50000–50100. Internal signalling 7880, internal TURN 5349, Redis 6379 and Caddy administration 2019 are not opened publicly. Existing SSH rules and Redis are preserved.
- No recording/egress service is deployed. There is no recording action in the app.

Provisioning source: `infra/livekit/configure-host.py`. It accepts public IP and hostnames, preserves existing service credentials, generates dedicated configuration and firewall rules, and starts the isolated Compose project. It does not alter or use the VM's existing Redis. `scripts/publish-livekit-secrets.cjs` publishes service credentials through authenticated stdin to Cloudflare; it never writes them locally or displays them. The E2EE master secret is generated in process memory and retained as a Worker secret only, not on the SFU host. Do not blindly rotate it during active calls.

## Appointment access

Only the care-space Patient and the exact assigned Doctor can join a Confirmed or In Progress Online Consultation. Both require active approved manual verification. Family, Nurse, Admin, unassigned users, expired/suspended applicants and unrelated patients are rejected by the backend. Exactly one patient and one doctor must be assigned to the care space/provider pair. This module does not itself create care assignments or verification approvals.

The current appointment timezone is Asia/Kolkata. Joining opens ten minutes before the scheduled start and ends sixty minutes after it. These are initial product defaults, not a clinical scheduling policy. They must be revised if appointment durations/timezones are added to the booking model.

The Worker creates opaque, appointment-specific rooms. Join tokens expire after 90 seconds and grant only room joining, camera/microphone publication and subscription; they do not grant room administration, recording, arbitrary room creation or data publishing. Tokens, encryption keys and consultation content are not written to logs or client persistent storage. The LiveKit API secret never reaches the mobile client.

## Three-call capacity

D1 atomically reserves one of exactly three global call slots. Multiple participants in the same room share its slot. A fourth consultation receives a clear busy response before a media room is created. Every media room allows at most two participants, so the pilot cap is three consultations / six participants.

Slots are released after server-confirmed room deletion. Empty rooms expire automatically; a minute maintenance job reconciles abandoned slots, expired appointments, changed schedules and revoked verification. Failed or ambiguous server cleanup retains capacity conservatively until reconciliation succeeds. Network failures may delay release. This cap applies to app-managed rooms; administrators with the server API secret must not create unrelated rooms on this dedicated service.

## Encryption and call lifecycle

The native SDK sets a room-specific shared key before publishing, enables E2EE, and refuses unencrypted subscribed media. An encryption failure closes the call. Media is encrypted between the authorised clients; the Worker is trusted for authentication and secure key distribution, while the SFU does not hold the E2EE master key. TLS still protects signalling; signalling metadata is not end-to-end encrypted.

The app checks backend authorisation every fifteen seconds and closes the call if it cannot confirm access. Moving the app to the background or leaving the screen stops participation. Appointment cancellation/completion/rescheduling triggers room deletion. Sign-out immediately revokes further token issuance and marks associated rooms for cleanup; outages are retried by the maintenance job rather than preventing account sign-out. Revocation is not claimed instantaneous across unavailable network services. Participant devices can independently capture content outside the app; disabling app/server recording does not prevent that.

## Client

Open a confirmed online appointment and choose **Join online consultation → Join with audio / Join with video**. Camera is off for an audio join. Controls provide microphone mute, camera on/off, camera switching, speaker/earpiece routing and leave. Permission/connection failures show retryable messages. Rejoining requires fresh backend authorisation.

LiveKit uses native WebRTC modules and requires a new APK/development build. Expo Go and the browser preview display an explanation instead of loading the native SDK. Native permissions/configuration are managed through the official Expo plugins; handwritten native projects are not added.

## Verification and operations

- `npm run test:cloud`: isolated D1/R2/SFU mocks test verification and assignment gates, room-scoped tokens, key matching, concurrent three-slot claims, busy response, slot reuse, cancellation and sign-out cleanup.
- `node scripts/livekit-smoke.cjs`: checks trusted TLS on both real OCI hostnames, authenticated room create/list/delete, rejection of unauthenticated administration, the two-person room cap and external TURN UDP reachability. It creates and deletes one synthetic operator smoke-test room and does not record media.
- Physical-device testing must still verify two-party audio/video, E2EE, permissions, Wi-Fi/mobile-data/TURN fallback, reconnect, app backgrounding and cancellation. Successful token/API tests do not prove media delivery or native SDK compatibility on every handset.

Inspect the server with `sudo docker compose -f /opt/bloom-livekit/compose.yaml ps` and logs for the dedicated containers. Back up the root-only configuration and Caddy certificate state securely, monitor CPU/bandwidth and availability, and patch pinned images deliberately. The initial deployment is a single-server pilot, with no high-availability failover or production SLO established.

## Deployment status — 10 November 2026

The OCI containers are running. Trusted TLS was verified externally on both hostnames, authenticated room creation/listing/deletion passed, unauthenticated room administration was rejected, and TURN UDP responded externally. The end-to-end native media path is not yet device-tested.

Migration 0005 is applied. Worker version `66465659-4587-488a-a040-ac87f18d5187` is deployed with the minute maintenance job and private LiveKit configuration. The public health endpoint returned 200 and unauthenticated call requests returned 401. Local integration tests passed, including simultaneous claims for four different consultations yielding exactly three successes and one busy response.

APK 1.0.4 (build 5) was submitted to the existing Expo project: https://expo.dev/accounts/dominateranc/projects/bloom-med/builds/985f0bd1-46e4-457c-8aff-77c197eea890. Build completion and two-phone consultation testing must be checked before treating this as a completed pilot acceptance test.
