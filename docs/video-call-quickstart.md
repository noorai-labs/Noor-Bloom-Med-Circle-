# Connecting a patient and doctor video consultation

Use the installed native BLOOM MED APK on two devices. Expo Go and web cannot load the app's native LiveKit call implementation.

1. Sign in with two distinct Clerk accounts: the patient on one phone, the doctor on the other. Select Doctor before Google/email sign-in on the doctor's phone. The choice is remembered through auth callbacks and cold starts. It is a navigation preference, not permission to access records.
2. In Verification, submit Patient evidence for the patient account and Doctor registration evidence for the doctor account. The configured reviewer must approve both, with future valid-until dates. Calls currently enforce these approvals even though general patient sign-in does not.
3. A trusted care administrator must assign the doctor Clerk user ID to the patient's care space in the existing backend, with a provider ID matching the appointment. There must be exactly one Patient membership and one matching Doctor membership for that appointment. Record permission is a separate patient-controlled grant. Clerk sign-in settings alone do not create these assignments.
4. The care space must contain an actual Online Consultation appointment, assigned to that doctor, with status Confirmed or In Progress and a valid scheduled India date/time. Provider discovery is intentionally empty until a real directory is connected, so there is not yet a complete self-service booking path from an empty new account. Administration must provision the real assignment and appointment; do not insert fictional clinicians to bypass this.
5. Open the same appointment on both phones. Join is allowed from 10 minutes before until 60 minutes after its scheduled start (Asia/Kolkata). Press Join consultation, choose video, and allow microphone/camera permissions. The backend issues both users credentials for the same appointment room. Do not paste a room URL or API secret into the app.
6. Use camera/microphone/speaker controls and Leave call. Server access limits the room to two people and the pilot to three concurrent calls. Two-device audio/video testing is still required before claiming end-to-end media success.

## Doctor sign-in behavior

An account with an assigned Doctor care space opens the doctor workspace. Without one, it opens Doctor account setup with its verification application and assignment instructions. It never silently sends a Doctor login to patient onboarding. A user can deliberately choose Continue as a patient instead. No self-service button changes a backend role or approves verification.

## Common blockers

- Doctor account setup: no Doctor space has been assigned, or approval is pending.
- Confirmed active consultation required: wrong service or appointment status.
- Care team must assign exactly one patient and doctor: backend membership/provider mapping incomplete.
- Active verification approval required: one account is unapproved, suspended or expired.
- Join time error: outside the appointment window.
- Native build required: install the APK rather than Expo Go.
- Three calls active: leave a pilot room or retry when capacity is released.

A working two-device call depends on these backend conditions and reachable OCI media ports. Login success by itself does not establish a consultation appointment.
