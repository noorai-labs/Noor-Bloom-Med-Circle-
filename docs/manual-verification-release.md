# Manual verification release — India

This release adds manual identity and professional application review to the existing Cloudflare Worker, D1 and private R2. It does not call a paid identity-check API, authenticate against Aadhaar, or automatically validate government registration numbers.

## Applicant flow

Sign in to the cloud account, then open **Profile → Open verification**. Choose Patient, Doctor or Nurse. Enter a full name; professionals also supply the registering council, professional registration number and qualification. Give consent before uploading 1–4 PDF/JPEG/PNG evidence documents (maximum 5 MB each). Submit and refresh to see the staff decision. A correction request or rejection permits a new submission with a new revision and evidence. Pending or approved submissions cannot be silently edited.

Do not enter Aadhaar numbers into text fields. Prefer masked identity evidence and collect only what is necessary. The release is a manual review workflow, not an automated identity/liveness or medical-licence verification service. A reviewer must actually perform the checks and record a non-sensitive reference before approval.

## Staff flow

Reviewer privileges are stored separately in `verification_reviewers`. There is no public reviewer signup or self-assignment endpoint. A trusted backend operator provisions a Clerk user ID; this privilege does not grant clinical-record access. The designated reviewer opens **Profile → Open verification → Open staff review queue**.

Review submitted evidence, request more information, reject or approve. Approval requires a completed identity-check reference, a professional-register-check reference for Doctor/Nurse applications, a future review expiry date and a reason. Review references should identify the completed review, not repeat identity numbers. Reasons are visible to the applicant. A reviewer cannot review their own application; use a second reviewer where needed.

Approved applications can be suspended or returned for more information; suspended applications can be returned for corrections. Expired professional approvals are blocked by backend clinical-role checks. Review actions use revision checks and atomic audit writes. The first 50 applications in each status queue are shown, oldest first; large-scale queue pagination is future work.

## Permissions and rollout

Approval does **not** create Doctor/Nurse care-space memberships, register a new professional in the booking catalogue, or grant document sharing. Trusted care assignment remains a separate step. Existing server-assigned professionals without a verification application retain their legacy access for migration compatibility; once an application exists, their professional role requires an active approved review. Migrate existing professionals before treating every legacy professional as reviewed. Building the staff assignment/catalogue management flow is the next implementation phase.

Patient verification is recorded independently of login. Existing patient access is retained. Optional Worker variable `PATIENT_VERIFICATION_REQUIRED=true` gates new bookings on an active approved Patient review for the care-space patient, including bookings initiated by Family. It does not lock patients out of their own existing records. Leave it unset until reviewers and applicant support are available. Review expiry comparisons use the India calendar date.

## Private evidence and retention

Evidence lives under a separate private R2 `verification/` prefix and separate D1 metadata, not in the patient's shared care records. Applicants can read their own evidence; active verification reviewers can read submitted evidence. Every evidence download is audited. Downloaded temporary files use the app's user-scoped cache, which is cleared at sign-out. The system share sheet may create copies outside BLOOM MED that cannot be recalled.

Unused evidence can be removed before submission. Withdrawing consent in the unsent form removes its attached uploads. A daily Worker job removes up to 100 unattached uploads older than seven days; such uploads cannot be submitted after that period. Submitted evidence, submission revisions and decision history are retained. Define and configure a reviewed retention/deletion policy for submitted identity evidence before a broad public rollout; there is no automatic purge of submitted evidence in this release.

## Deployment and testing

Apply migration `0004_manual_verification.sql`, deploy the existing Worker, then provision the authorised reviewer account in `verification_reviewers`. The same Worker deployment adds a daily unused-evidence cleanup Cron Trigger. No extra public API service or identity-provider account is needed.

`npm run test:cloud` includes consent, file-content validation, evidence ownership, private downloads, removal, reviewer isolation/revocation, self-approval denial, corrections, concurrent resubmission, approval-reference validation, suspension and professional expiry tests. These use isolated local D1/R2 and synthetic evidence; they do not test the truth of a real identity or a professional registration.

The native routes are `/verification` and `/verification-review`. A new APK is needed to distribute the screens. Complete a real two-account phone walkthrough with non-production evidence before inviting applicants.

## Deployment status — 1 November 2026

Migration 0004 was applied to the existing `bloom-med` database. The existing Worker was deployed as version `863ce627-7937-40d3-8041-013f8eaac706`, including the daily unused-evidence cleanup job. The user-designated Clerk account was provisioned as an active verification reviewer. Health returned 200 and unauthenticated verification/review endpoints returned 401. Actual authenticated phone review has not been tested.

Android release 1.0.3 (build 4) was submitted after the user explicitly approved uploading the project and using configured Firebase build files. EAS build ID: a57c911f-de5d-40ce-9707-221c7f587309. Build page: https://expo.dev/accounts/dominateranc/projects/bloom-med/builds/a57c911f-de5d-40ce-9707-221c7f587309. APK completion and physical-device review testing remain unconfirmed.
