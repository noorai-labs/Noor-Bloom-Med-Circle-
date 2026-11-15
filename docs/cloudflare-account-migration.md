# Cloudflare account migration

Destination account: `5f60fb51e83a434162045c3ba7049f9a` (`admin.dev@noorailabs.com`). Original account: `ff179fd6f1ff6020cae136d46d74c7f7`.

## Deployed resources

| Purpose | Worker URL | Database | Private bucket prefix |
| --- | --- | --- | --- |
| Main copied application | https://bloom-med-api.bloom-med.workers.dev | bloom-med-main | main/ |
| Development | https://bloom-med-api-dev.bloom-med.workers.dev | bloom-med-dev | dev/ |
| QA | https://bloom-med-api-qa.bloom-med.workers.dev | bloom-med-qa | qa/ |

All environments bind `bloom-med-storage`. `FILES_PREFIX` comes from server configuration and prefixes records and verification evidence. Empty configuration retains legacy key behavior for the original account. Environment prefixes are application isolation, not a substitute for least-privilege account access. Interns do not receive bucket tokens.

Only the exact public logo path `/branding/bloom-logo-v2.png` serves `branding/bloom-logo-v2.png`. The bucket itself has no public development URL. Other requests still require existing authentication and authorization. Temporary destination buckets were removed after verifying copies. Original source resources remain intact.

## Copy verification

The snapshot copied all rows across 18 D1 tables. Source/destination row content matched. It includes 9 care spaces, their memberships, audit history, record metadata and existing device/session data. One private record object and one BLOOM MED branding object were copied with SHA-256 verification. Unrelated objects in the old branding bucket were excluded. Backups and detailed reports are in ignored `tmp/cloudflare-migration/` and must never be committed or shared.

The main database is `ecaa22e4-5fb5-4254-880b-44aa529d3165`. Dev and QA retain separate databases without copied patient data. This remains D1; Swathi's PostgreSQL migration is separate work.

## Integrations

Clerk public verification key is configured for main/dev/qa. Main has the existing LiveKit service endpoint/API credentials, copied through authenticated memory-only stdin. Its new media-encryption master supports new rooms. The source snapshot contained no active calls. Existing Worker secret values cannot be exported. Source had no EXPO_ACCESS_TOKEN secret. Reminder settings and deliveries were empty at snapshot time; Durable Object in-memory/alarm state was not copied.

Main cron triggers remain disabled until controlled cutover to avoid concurrent maintenance with the original backend. Restore the main schedules after source traffic and jobs are retired and re-check any active calls/reminders at that time. Dev/QA schedules are deployed against isolated test databases.

## Cutover still requires review

1. Merge Expo ownership PR #4 and configure a destination-team EXPO_TOKEN before a new build.
2. Review this migration PR. Development builds point to the dev Worker. Preview builds point to the copied main Worker. The branding URL also moves to the new main Worker.
3. Before retiring the old API, stop old-client writes or arrange a maintenance window. Re-export/reconcile source changes since the snapshot. Do not blindly re-import over destination writes. Validate counts and file checksums again.
4. Test authenticated sign-in, existing record download, verification access and a real consultation/push flow on the new build. Health/unauthenticated smoke checks alone do not prove these handset flows.
5. Switch clients in a controlled rollout, retire old writes/jobs, then enable main cron schedules. Keep original backups/resources for rollback until accepted.

This PR prepares mobile cutover; it does not switch installed APKs automatically. The backend CI token still needs provisioning in GitHub. Pending PR #3 must use the consolidated bucket config and storage helper before deployment. No paid Workers-plan upgrade was performed. R2 still has usage-based charges beyond its free allowance.
