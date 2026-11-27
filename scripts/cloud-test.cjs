const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { generateKeyPairSync, sign, randomUUID } = require("node:crypto");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const root = path.resolve(__dirname, "..");
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const issuer = "https://test.clerk.accounts.dev";
let activeSession = "sess_test";
const pushes = [];
const mediaRooms = new Map();
let pushError = null;
async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail("Timed out waiting for the local reminder alarm");
}
function jwt(user, overrides = {}) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body =
    encode({ alg: "RS256", typ: "JWT", kid: "test-key" }) +
    "." +
    encode({
      sub: user,
      sid: activeSession,
      iss: issuer,
      azp: "bloommed://",
      iat: now,
      nbf: now - 5,
      exp: now + 300,
      ...overrides,
    });
  return (
    body +
    "." +
    sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")
  );
}
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: "bloom-test",
        modules: true,
        scriptPath: path.join(root, "backend/backend-build/worker.js"),
        compatibilityDate: "2026-10-11",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: { DB: "bloom-test" },
        durableObjects: {
          REMINDERS: {
            className: "MedicineReminderScheduler",
            useSQLite: true,
          },
        },
        outboundService: async (req) => {
          const url = new URL(req.url);
          if (url.hostname === "livekit.test") {
            const payload = await req.json();
            if (url.pathname.endsWith("/CreateRoom")) {
              assert.equal(payload.maxParticipants, 2);
              mediaRooms.set(payload.name, {
                name: payload.name,
                sid: "RM_test",
              });
              return Response.json(mediaRooms.get(payload.name));
            }
            if (url.pathname.endsWith("/DeleteRoom")) {
              mediaRooms.delete(payload.room);
              return Response.json({});
            }
            if (url.pathname.endsWith("/RemoveParticipant"))
              return Response.json({});
            if (url.pathname.endsWith("/ListParticipants"))
              return Response.json({ participants: [] });
            if (url.pathname.endsWith("/ListRooms"))
              return Response.json({
                rooms: [...mediaRooms.values()].filter(
                  (room) =>
                    !payload.names?.length || payload.names.includes(room.name),
                ),
              });
            assert.fail("Unexpected media service request");
          }
          assert.equal(
            url.hostname,
            "exp.host",
            "Tests must never call a live push provider",
          );
          const body = await req.json();
          if (url.pathname.endsWith("/getReceipts"))
            return Response.json({
              data: Object.fromEntries(
                body.ids.map((id) => [id, { status: "ok" }]),
              ),
            });
          pushes.push(...body);
          return Response.json({
            data: body.map(() =>
              pushError
                ? { status: "error", details: { error: pushError } }
                : { status: "ok", id: randomUUID() },
            ),
          });
        },
        r2Buckets: ["FILES"],
        bindings: {
          CLERK_JWT_KEY: publicKey.export({ type: "spki", format: "pem" }),
          CLERK_ISSUER: issuer,
          FILES_PREFIX: "main/",
          ALLOWED_ORIGINS: "http://localhost:8083",
          AUTHORIZED_PARTIES: "bloommed://",
          LIVEKIT_URL: "wss://livekit.test",
          LIVEKIT_API_KEY: "test-api-key",
          LIVEKIT_API_SECRET: "a".repeat(64),
          LIVEKIT_E2EE_SECRET: "b".repeat(64),
        },
      },
    ],
  }),
);
async function request(
  user,
  endpoint,
  method = "GET",
  body,
  contentType = "application/json",
) {
  const response = await mf.dispatchFetch("http://test" + endpoint, {
    method,
    headers: {
      Authorization: "Bearer " + jwt(user),
      "Content-Type": contentType,
    },
    body:
      body === undefined
        ? undefined
        : contentType === "application/json"
          ? JSON.stringify(body)
          : body,
  });
  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}
async function main() {
  const forged = await mf.dispatchFetch("http://test/v1/state", {
    headers: { Authorization: "Bearer invalid.token.signature" },
  });
  assert.equal(forged.status, 401);
  const db = await mf.getD1Database("DB");
  for (const sql of fs
    .readdirSync(path.join(root, "backend/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) =>
      fs.readFileSync(path.join(root, "backend/migrations", f), "utf8"),
    )
    .join(";")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(sql).run();
  assert.equal((await mf.dispatchFetch("http://test/v1/state")).status, 401);
  for (const overrides of [
    { exp: 1 },
    { iss: "https://wrong.clerk.accounts.dev" },
    { sid: "" },
  ]) {
    const denied = await mf.dispatchFetch("http://test/v1/state", {
      headers: { Authorization: "Bearer " + jwt("user_patient", overrides) },
    });
    assert.equal(denied.status, 401);
  }
  const first = await request("user_patient", "/v1/state");
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.state.records.length, 0);
  const space = first.data.spaceId;
  let revision = first.data.revision;
  const endpoint = "/v1/actions?space=" + space;
  async function mutate(user, action) {
    const result = await request(user, endpoint, "POST", {
      revision,
      action,
      operationId: randomUUID(),
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    revision = result.data.revision;
    return result.data.state;
  }
  assert.equal(
    (await request("user_other", "/v1/state?space=" + space)).status,
    403,
  );
  assert.equal(
    (
      await request("user_patient", endpoint, "POST", {
        revision,
        action: { type: "session", session: { role: "Admin" } },
        operationId: randomUUID(),
      })
    ).status,
    400,
  );
  let state = await mutate("user_patient", {
    type: "profile",
    profile: {
      ...first.data.state.profile,
      name: "Test Patient",
      age: "30",
      address: "Test address",
    },
    onboarding: true,
  });
  const date = new Date();
  date.setDate(date.getDate() + 2);
  const day = date.toISOString().slice(0, 10);
  state = await mutate("user_patient", {
    type: "book",
    visit: {
      providerId: "1",
      date: day,
      time: "10:00 AM",
      service: "Home Visit",
      frequency: "One visit",
      address: "Test address",
      reason: "Test visit",
    },
  });
  const visit = state.visits[0];
  assert.equal(visit.status, "Requested");
  await request("user_doctor", "/v1/state");
  await db
    .prepare(
      "INSERT INTO memberships (user_id,space_id,role,provider_id) VALUES (?,?,?,?)",
    )
    .bind("user_doctor", space, "Doctor", "1")
    .run();
  await db
    .prepare(
      "UPDATE memberships SET records_access=1 WHERE user_id=? AND space_id=?",
    )
    .bind("user_doctor", space)
    .run();
  await mutate("user_doctor", {
    type: "status",
    visitId: visit.id,
    status: "Confirmed",
  });
  await mutate("user_doctor", {
    type: "status",
    visitId: visit.id,
    status: "In Progress",
  });
  state = await mutate("user_doctor", {
    type: "consult",
    visitId: visit.id,
    text: "Test consultation",
    prescription: "Test plan",
    followUp: day,
    medicine: {
      name: "Test medicine",
      dosage: "As prescribed",
      time: "08:00",
      frequency: "Once daily",
      duration: "1 week",
    },
  });
  assert.equal(state.medicines.length, 1);
  await mutate("user_doctor", {
    type: "status",
    visitId: visit.id,
    status: "Completed",
  });
  // 1. Negative test: Rescheduling a completed visit is rejected
  const rescheduleCompleted = await request("user_patient", endpoint, "POST", {
    revision,
    action: {
      type: "reschedule",
      visitId: visit.id,
      date: day,
      time: "11:30 AM",
    },
    operationId: randomUUID(),
  });
  assert.equal(rescheduleCompleted.status, 400);
  assert.equal(
    rescheduleCompleted.data.error,
    "Only upcoming visits can be rescheduled.",
  );

  // 2. Negative test: Patient cannot mark a visit as Confirmed or Completed
  const patientStatusUpdate = await request("user_patient", endpoint, "POST", {
    revision,
    action: {
      type: "status",
      visitId: visit.id,
      status: "Confirmed",
    },
    operationId: randomUUID(),
  });
  assert.equal(patientStatusUpdate.status, 400);

  // 3. Negative test: Doctor cannot modify a visit assigned to a different provider
  await db
    .prepare(
      "INSERT INTO memberships (user_id,space_id,role,provider_id) VALUES (?,?,?,?)",
    )
    .bind("user_doctor_other", space, "Doctor", "2")
    .run();
  const crossDoctorUpdate = await request(
    "user_doctor_other",
    endpoint,
    "POST",
    {
      revision,
      action: {
        type: "status",
        visitId: visit.id,
        status: "In Progress",
      },
      operationId: randomUUID(),
    },
  );
  assert.equal(crossDoctorUpdate.status, 403);
  assert.equal(
    crossDoctorUpdate.data.error,
    "An active assigned visit is required.",
  );

  // 4. Defect reproduction: Booking a second visit must NOT corrupt historical visit status
  const date2 = new Date();
  date2.setDate(date2.getDate() + 4);
  const day2 = date2.toISOString().slice(0, 10);
  state = await mutate("user_patient", {
    type: "book",
    visit: {
      providerId: "2",
      date: day2,
      time: "11:30 AM",
      service: "Home Visit",
      frequency: "One visit",
      address: "Test address",
      reason: "Second checkup",
    },
  });
  assert.equal(state.visits.length, 2);
  assert.equal(
    state.visits.find((v) => v.id === visit.id)?.status,
    "Completed",
    "Regression: historical visit was corrupted back to Requested!",
  );
  const secondVisit = state.visits[state.visits.length - 1];
  assert.equal(secondVisit.status, "Requested");
  assert.equal(state.activities[0].title, "Care request sent");

  // Verify target-visit authorization: Doctor 2 is now admitted (has visit 2),
  // but attempting an action on Doctor 1's visit must be rejected by target-visit checks.
  const admittedState = await request(
    "user_doctor_other",
    "/v1/state?space=" + space,
  );
  assert.equal(admittedState.status, 200);
  const crossVisitUpdate = await request(
    "user_doctor_other",
    endpoint,
    "POST",
    {
      revision,
      action: {
        type: "status",
        visitId: visit.id,
        status: "In Progress",
      },
      operationId: randomUUID(),
    },
  );
  assert.equal(crossVisitUpdate.status, 400);
  assert.equal(
    crossVisitUpdate.data.error,
    "This visit belongs to another care professional.",
  );

  // 5. Concurrency Test: Competing bookings for the exact same slot by different patients
  const secondPatient = await request("user_patient_b", "/v1/state");
  assert.equal(secondPatient.status, 200);
  const spaceB = secondPatient.data.spaceId;
  let revisionB = secondPatient.data.revision;
  const endpointB = "/v1/actions?space=" + spaceB;
  const onboardB = await request("user_patient_b", endpointB, "POST", {
    revision: revisionB,
    action: {
      type: "profile",
      profile: {
        ...secondPatient.data.state.profile,
        name: "Patient B",
        age: "28",
        address: "Address B",
      },
      onboarding: true,
    },
    operationId: randomUUID(),
  });
  assert.equal(onboardB.status, 200);
  revisionB = onboardB.data.revision;

  const competingOpA = randomUUID();
  const competingOpB = randomUUID();
  const [resA, resB] = await Promise.all([
    request("user_patient", endpoint, "POST", {
      revision,
      action: {
        type: "book",
        visit: {
          providerId: "1",
          date: day2,
          time: "02:00 PM",
          service: "Home Visit",
          frequency: "One visit",
          address: "Address A",
          reason: "Consult A",
        },
      },
      operationId: competingOpA,
    }),
    request("user_patient_b", endpointB, "POST", {
      revision: revisionB,
      action: {
        type: "book",
        visit: {
          providerId: "1",
          date: day2,
          time: "02:00 PM",
          service: "Home Visit",
          frequency: "One visit",
          address: "Address B",
          reason: "Consult B",
        },
      },
      operationId: competingOpB,
    }),
  ]);

  const competingStatuses = [resA.status, resB.status].sort();
  assert.deepEqual(
    competingStatuses,
    [200, 409],
    "Exactly one competing booking must succeed and one must be rejected with 409",
  );
  const conflictRes = resA.status === 409 ? resA : resB;
  const successRes = resA.status === 200 ? resA : resB;
  assert.equal(
    conflictRes.data.error,
    "This slot is already booked for this care professional.",
  );
  if (resA.status === 200) {
    revision = resA.data.revision;
    state = resA.data.state;
  } else {
    revisionB = resB.data.revision;
  }

  // Verify only 1 active slot exists in appointment_slots
  const bookedSlots = await db
    .prepare(
      "SELECT * FROM appointment_slots WHERE provider_id='1' AND date=? AND time=? AND status IN ('Requested', 'Confirmed', 'In Progress')",
    )
    .bind(day2, "02:00 PM")
    .all();
  assert.equal(
    bookedSlots.results.length,
    1,
    "Only one accepted booking record can exist in database",
  );

  // 6. Idempotency Test: Resending identical operationId does NOT create duplicate booking
  const winningUser = resA.status === 200 ? "user_patient" : "user_patient_b";
  const winningEndpoint = resA.status === 200 ? endpoint : endpointB;
  const winningOp = resA.status === 200 ? competingOpA : competingOpB;
  const winningRevision = resA.status === 200 ? revision : revisionB;

  const replay = await request(winningUser, winningEndpoint, "POST", {
    revision: winningRevision,
    action: {
      type: "book",
      visit: {
        providerId: "1",
        date: day2,
        time: "02:00 PM",
        service: "Home Visit",
        frequency: "One visit",
        address: "Address A",
        reason: "Consult A",
      },
    },
    operationId: winningOp,
  });
  assert.equal(replay.status, 200, "Idempotent replay must succeed with 200");
  assert.equal(
    replay.headers.get("x-idempotent-replay"),
    "true",
    "Must indicate idempotent replay in headers",
  );

  const afterReplaySlots = await db
    .prepare(
      "SELECT * FROM appointment_slots WHERE provider_id='1' AND date=? AND time=?",
    )
    .bind(day2, "02:00 PM")
    .all();
  assert.equal(
    afterReplaySlots.results.length,
    1,
    "Idempotent retry must not create a second booking slot",
  );

  // 6b. Regression test: A new operation ID appearing in unrelated saved text is processed normally
  const textCollisionOp = randomUUID();
  // Save unrelated text containing textCollisionOp in patient profile address
  await mutate("user_patient", {
    type: "profile",
    profile: {
      ...state.profile,
      name: "Test Patient",
      age: "30",
      address: "Address with ref: " + textCollisionOp,
    },
    onboarding: true,
  });
  // Now request a new booking using that exact textCollisionOp
  const bookingWithCollisionOp = await request("user_patient", endpoint, "POST", {
    revision,
    action: {
      type: "book",
      visit: {
        providerId: "1",
        date: day2,
        time: "11:30 AM",
        service: "Home Visit",
        frequency: "One visit",
        address: "Address Text Collision",
        reason: "Consult with UUID in note text",
      },
    },
    operationId: textCollisionOp,
  });
  assert.equal(
    bookingWithCollisionOp.status,
    200,
    "Operation ID matching unrelated text must not be rejected or dropped",
  );
  assert.notEqual(
    bookingWithCollisionOp.headers.get("x-idempotent-replay"),
    "true",
    "Request with new operation ID must not be treated as an idempotent replay",
  );
  revision = bookingWithCollisionOp.data.revision;
  const collisionSlot = await db
    .prepare(
      "SELECT * FROM appointment_slots WHERE provider_id='1' AND date=? AND time=?",
    )
    .bind(day2, "11:30 AM")
    .first();
  assert.ok(collisionSlot, "Expected booking must be saved in appointment_slots");

  // 7. Reschedule Conflict Test & Lifecycle audit attribution
  const losingUser = resA.status === 409 ? "user_patient" : "user_patient_b";
  const losingEndpoint = resA.status === 409 ? endpoint : endpointB;
  let losingRev = resA.status === 409 ? revision : revisionB;

  const losingBook = await request(losingUser, losingEndpoint, "POST", {
    revision: losingRev,
    action: {
      type: "book",
      visit: {
        providerId: "1",
        date: day2,
        time: "04:30 PM",
        service: "Home Visit",
        frequency: "One visit",
        address: "Address X",
        reason: "Consult X",
      },
    },
    operationId: randomUUID(),
  });
  assert.equal(losingBook.status, 200);
  losingRev = losingBook.data.revision;
  const losingVisitId =
    losingBook.data.state.visits[losingBook.data.state.visits.length - 1].id;

  // Attempting to reschedule to the already booked 02:00 PM slot must fail with 409
  const badReschedule = await request(losingUser, losingEndpoint, "POST", {
    revision: losingRev,
    action: {
      type: "reschedule",
      visitId: losingVisitId,
      date: day2,
      time: "02:00 PM",
    },
    operationId: randomUUID(),
  });
  assert.equal(badReschedule.status, 409);
  assert.equal(badReschedule.data.error, "That slot is already booked.");

  // Cancellation frees the slot and records audit attribution
  const winningVisitId =
    successRes.data.state.visits[successRes.data.state.visits.length - 1].id;
  const cancelRes = await request(winningUser, winningEndpoint, "POST", {
    revision: resA.status === 200 ? revision : revisionB,
    action: {
      type: "status",
      visitId: winningVisitId,
      status: "Cancelled",
    },
    operationId: randomUUID(),
  });
  assert.equal(cancelRes.status, 200);
  if (resA.status === 200) {
    revision = cancelRes.data.revision;
    state = cancelRes.data.state;
  } else {
    revisionB = cancelRes.data.revision;
  }

  // Audit attribution check
  const auditLogs = await db
    .prepare(
      "SELECT * FROM security_audit WHERE actor_id=? AND action='care.status'",
    )
    .bind(winningUser)
    .all();
  assert.ok(
    auditLogs.results.length >= 1,
    "Audit attribution must be recorded on cancellation",
  );

  // Once freed, rescheduling to 02:00 PM now succeeds!
  const freedReschedule = await request(losingUser, losingEndpoint, "POST", {
    revision: losingRev,
    action: {
      type: "reschedule",
      visitId: losingVisitId,
      date: day2,
      time: "02:00 PM",
    },
    operationId: randomUUID(),
  });
  assert.equal(freedReschedule.status, 200);
  if (resA.status === 409) {
    revision = freedReschedule.data.revision;
    state = freedReschedule.data.state;
  } else {
    revisionB = freedReschedule.data.revision;
  }

  // 8. Negative test: Malformed booking payload returns 400 validation error
  const malformedBooking = await request("user_patient", endpoint, "POST", {
    revision,
    action: { type: "book" },
    operationId: randomUUID(),
  });
  assert.equal(malformedBooking.status, 400);
  assert.equal(malformedBooking.data.error, "Invalid booking request.");

  // 9. Negative test: Stale revision rejects with 409 without mutating appointment_slots
  const slotCountBeforeStale = (
    await db.prepare("SELECT COUNT(*) as cnt FROM appointment_slots").first()
  ).cnt;
  const staleBooking = await request("user_patient", endpoint, "POST", {
    revision: revision - 1,
    action: {
      type: "book",
      visit: {
        providerId: "1",
        date: day2,
        time: "10:00 AM",
        service: "Home Visit",
        frequency: "One visit",
        address: "Address",
        reason: "Stale test",
      },
    },
    operationId: randomUUID(),
  });
  assert.equal(staleBooking.status, 409);
  const slotCountAfterStale = (
    await db.prepare("SELECT COUNT(*) as cnt FROM appointment_slots").first()
  ).cnt;
  assert.equal(
    slotCountAfterStale,
    slotCountBeforeStale,
    "Stale revision must not insert a reservation into appointment_slots",
  );

  // 10. Regression test: Seed two active legacy appointments for the same provider, date, and time in different care spaces
  const legacySpace1 = "legacy_space_alpha";
  const legacySpace2 = "legacy_space_beta";
  const conflictDate = day2;
  const conflictTime = "09:00 AM";
  const legacyVisit1 = {
    id: "visit_legacy_alpha",
    providerId: "1",
    date: conflictDate,
    time: conflictTime,
    service: "Home Visit",
    frequency: "One visit",
    address: "Alpha St",
    reason: "Routine checkup",
    status: "Confirmed",
    checklist: [],
    notes: "Legacy booking alpha",
  };
  const legacyVisit2 = {
    id: "visit_legacy_beta",
    providerId: "1",
    date: conflictDate,
    time: conflictTime,
    service: "Home Visit",
    frequency: "One visit",
    address: "Beta St",
    reason: "Follow-up visit",
    status: "Requested",
    checklist: [],
    notes: "Legacy booking beta",
  };

  await db
    .prepare("INSERT INTO care_spaces (id, state, revision) VALUES (?, ?, 0)")
    .bind(legacySpace1, JSON.stringify({ ...state, visits: [legacyVisit1] }))
    .run();
  await db
    .prepare("INSERT INTO care_spaces (id, state, revision) VALUES (?, ?, 0)")
    .bind(legacySpace2, JSON.stringify({ ...state, visits: [legacyVisit2] }))
    .run();

  // Run the rollout reconciliation path
  const { reconcileAppointments } = require("./reconcile-appointments.cjs");
  const reconReport = await reconcileAppointments(db);

  assert.ok(
    reconReport.duplicates >= 1,
    "Reconciliation must report detected legacy overlap conflicts",
  );
  const conflictDetail = reconReport.details.find(
    (d) =>
      d.type === "legacy_overlap" &&
      d.providerId === "1" &&
      d.date === conflictDate &&
      d.time === conflictTime,
  );
  assert.ok(
    conflictDetail,
    "Reconciliation report must include the specific overlapping slot",
  );
  assert.equal(
    conflictDetail.primarySpace,
    legacySpace1,
    "Report must identify primary care space",
  );
  assert.equal(
    conflictDetail.primaryVisit,
    "visit_legacy_alpha",
    "Report must identify primary visit ID",
  );
  assert.equal(
    conflictDetail.overlappingSpace,
    legacySpace2,
    "Report must identify conflicting care space",
  );
  assert.equal(
    conflictDetail.overlappingVisit,
    "visit_legacy_beta",
    "Report must identify conflicting visit ID",
  );
  await mutate("user_patient", {
    type: "dose",
    medicineId: state.medicines[0].id,
    status: "Taken",
  });
  const upload = await request(
    "user_patient",
    "/v1/files?space=" + space + "&name=test.pdf",
    "POST",
    "%PDF-1.7 test attachment",
    "application/pdf",
  );
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  const storedFiles = await mf.getR2Bucket("FILES");
  const uploadedKey = space + "/" + upload.data.fileId;
  assert.ok(await storedFiles.head("main/" + uploadedKey));
  assert.equal(await storedFiles.head(uploadedKey), null);
  assert.equal(await storedFiles.head("dev/" + uploadedKey), null);
  assert.equal(await storedFiles.head("qa/" + uploadedKey), null);

  state = await mutate("user_patient", {
    type: "record",
    record: {
      name: "test.pdf",
      category: "Lab report",
      date: day,
      detail: "Test attachment",
      mime: "application/pdf",
      fileId: upload.data.fileId,
    },
  });
  const downloadPath = "/v1/files/" + upload.data.fileId + "?space=" + space;
  const file = await mf.dispatchFetch("http://test" + downloadPath, {
    headers: { Authorization: "Bearer " + jwt("user_patient") },
  });
  assert.equal(file.status, 200);
  assert.equal(await file.text(), "%PDF-1.7 test attachment");
  assert.equal((await request("user_other", downloadPath)).status, 403);
  await db
    .prepare("INSERT INTO memberships (user_id,space_id,role) VALUES (?,?,?)")
    .bind("user_family", space, "Family")
    .run();
  assert.equal(
    (await request("user_family", "/v1/state?space=" + space)).status,
    403,
  );
  state = await mutate("user_patient", {
    type: "profile",
    profile: { ...state.profile, consent: true },
  });
  assert.equal(
    (await request("user_family", "/v1/state?space=" + space)).status,
    200,
  );
  const familyView = await request("user_family", "/v1/state?space=" + space);
  assert.equal(familyView.data.state.records.length, 0);
  assert.equal(familyView.data.state.consultations.length, 0);
  assert.equal((await request("user_family", downloadPath)).status, 403);
  const recordId = state.records[0].id;
  assert.equal(state.records[0].provenance.authorId, "user_patient");
  assert.equal(state.records[0].provenance.version, 1);
  const historyPath =
    "/v1/records/" + encodeURIComponent(recordId) + "/history?space=" + space;
  const amendPath =
    "/v1/records/" + encodeURIComponent(recordId) + "/amend?space=" + space;
  assert.equal((await request("user_family", historyPath)).status, 403);
  assert.equal((await request("user_other", historyPath)).status, 403);
  assert.equal(
    (
      await request("user_doctor", amendPath, "POST", {
        revision,
        detail: "Changed",
        reason: "Not owner",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("user_patient", amendPath, "POST", {
        revision,
        detail: "Changed",
        reason: "",
      })
    ).status,
    400,
  );
  const amendments = await Promise.all(
    ["Correction A", "Correction B"].map((detail) =>
      request("user_patient", amendPath, "POST", {
        revision,
        detail,
        reason: "Corrected description",
      }),
    ),
  );
  assert.deepEqual(amendments.map((r) => r.status).sort(), [200, 409]);
  const corrected = await request("user_patient", "/v1/state?space=" + space);
  revision = corrected.data.revision;
  const history = await request("user_patient", historyPath);
  assert.equal(history.data.length, 2);
  assert.equal(history.data[0].version, 2);
  assert.equal(JSON.parse(history.data[1].metadata).detail, "Test attachment");
  assert.equal(
    (
      await request("user_patient", amendPath, "POST", {
        revision: revision - 1,
        detail: "Stale",
        reason: "Stale",
      })
    ).status,
    409,
  );
  await db
    .prepare("INSERT INTO memberships(user_id,space_id,role) VALUES (?,?,?)")
    .bind("user_admin", space, "Admin")
    .run();
  assert.equal(
    (await request("user_admin", "/v1/state?space=" + space)).status,
    403,
  );
  assert.equal((await request("user_admin", downloadPath)).status, 403);
  const accessPath = "/v1/records/access?space=" + space;
  assert.equal((await request("user_family", accessPath)).status, 403);
  assert.equal(
    (
      await request("user_patient", accessPath, "POST", {
        userId: "user_other",
        granted: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("user_patient", accessPath, "POST", {
        userId: "user_admin",
        granted: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("user_patient", accessPath, "POST", {
        userId: "user_family",
        granted: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("user_family", "/v1/state?space=" + space)).data.state
      .records.length,
    1,
  );
  assert.equal(
    (
      await request("user_patient", accessPath, "POST", {
        userId: "user_family",
        granted: false,
      })
    ).status,
    200,
  );
  assert.equal((await request("user_family", downloadPath)).status, 403);
  const audits = await db
    .prepare("SELECT action FROM security_audit WHERE space_id=?")
    .bind(space)
    .all();
  assert.ok(audits.results.some((r) => r.action === "record.file.read"));
  assert.ok(audits.results.some((r) => r.action === "record.amend"));
  const concurrent = await Promise.all(
    [1, 2].map((i) =>
      request("user_patient", endpoint, "POST", {
        revision,
        operationId: randomUUID(),
        action: { type: "issue", subject: "Concurrent " + i },
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  revision = (await request("user_patient", "/v1/state?space=" + space)).data
    .revision;
  await mutate("user_patient", {
    type: "deleteRecord",
    recordId: state.records[0].id,
  });
  assert.equal((await request("user_patient", downloadPath)).status, 404);
  const badOrigin = await mf.dispatchFetch("http://test/v1/state", {
    headers: {
      Origin: "https://untrusted.example",
      Authorization: "Bearer " + jwt("user_patient"),
    },
  });
  assert.equal(badOrigin.status, 403);
  await require("./verification-cloud-test.cjs")({
    db,
    request,
    space,
    raw: (user, path) =>
      mf.dispatchFetch("http://test" + path, {
        headers: { Authorization: "Bearer " + jwt(user) },
      }),
  });
  await require("./calls-cloud-test.cjs")({ db, request, mediaRooms });
  await require("./provider-cloud-test.cjs")({ db, request, mf });
  await require("./workspace-cloud-test.cjs")({ db, request });
  const remindersPath = "/v1/reminders?space=" + space;
  const devicePath = "/v1/reminders/device?space=" + space;
  const settings = { enabled: true, showNames: false, medicines: {} };
  assert.equal((await request("user_other", remindersPath)).status, 403);
  assert.equal((await request("user_doctor", remindersPath)).status, 403);
  assert.equal((await request("user_patient", remindersPath)).data.revision, 0);
  assert.equal(
    (
      await request("user_patient", remindersPath, "POST", {
        preferences: settings,
        revision: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("user_patient", remindersPath, "POST", {
        preferences: settings,
        revision: 0,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("user_patient", remindersPath, "POST", {
        preferences: {
          ...settings,
          medicines: { bad: { enabled: true, times: ["25:00"] } },
        },
        revision: 1,
      })
    ).status,
    400,
  );
  const device = {
    id: randomUUID(),
    mode: "server",
    timezone: "Asia/Kolkata",
    ownerTag: "a".repeat(24),
    token: "ExponentPushToken[test_device]",
  };
  assert.equal(
    (
      await request("user_patient", devicePath, "POST", {
        ...device,
        timezone: "Invalid/Zone",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("user_patient", devicePath, "POST", device)).status,
    200,
  );
  const privateTest = await request(
    "user_patient",
    "/v1/reminders/test?space=" + space,
    "POST",
    { id: device.id },
  );
  assert.equal(privateTest.status, 200, JSON.stringify(privateTest.data));
  await until(() => pushes.length === 1);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].to, device.token);
  assert.ok(!pushes[0].body.includes("Test medicine"));
  assert.equal(
    (
      await request(
        "user_patient",
        "/v1/reminders/test?space=" + space,
        "POST",
        { id: device.id },
      )
    ).status,
    429,
  );
  const otherSpace = (await request("user_other", "/v1/state")).data.spaceId;
  assert.equal(
    (
      await request(
        "user_other",
        "/v1/reminders/device?space=" + otherSpace,
        "POST",
        device,
      )
    ).status,
    403,
  );
  const delivery = await db
    .prepare("SELECT * FROM reminder_deliveries WHERE device_id=?")
    .bind(device.id)
    .first();
  assert.equal(delivery.status, "accepted");
  await db
    .prepare("UPDATE reminder_deliveries SET receipt_at=? WHERE id=?")
    .bind(Date.now() - 1000, delivery.id)
    .run();
  await request("user_patient", devicePath, "POST", device);
  await until(
    async () =>
      (
        await db
          .prepare("SELECT status FROM reminder_deliveries WHERE id=?")
          .bind(delivery.id)
          .first()
      ).status === "provider_received",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM reminder_deliveries WHERE id=?")
        .bind(delivery.id)
        .first()
    ).status,
    "provider_received",
  );
  assert.equal(
    pushes.length,
    1,
    "receipt checks and repeated registrations must not resend",
  );
  await db
    .prepare(
      "INSERT INTO reminder_deliveries(id,device_id,user_id,space_id,medicine_id,due_at,status,next_attempt,created_at) VALUES (?,?,?,?,?,?,'pending',?,?)",
    )
    .bind(
      "invalid-med",
      device.id,
      "user_patient",
      space,
      "archived-or-missing",
      Date.now(),
      Date.now(),
      Date.now(),
    )
    .run();
  await request("user_patient", devicePath, "POST", device);
  await until(
    async () =>
      (
        await db
          .prepare(
            "SELECT status FROM reminder_deliveries WHERE id='invalid-med'",
          )
          .first()
      ).status === "cancelled",
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT status FROM reminder_deliveries WHERE id='invalid-med'",
        )
        .first()
    ).status,
    "cancelled",
  );
  assert.equal(pushes.length, 1, "missing/archived medicines must not send");
  pushError = "DeviceNotRegistered";
  await db
    .prepare(
      "INSERT INTO reminder_deliveries(id,device_id,user_id,space_id,medicine_id,due_at,status,next_attempt,created_at) VALUES (?,?,?,?,?,?,'pending',?,?)",
    )
    .bind(
      "invalid-token-test",
      device.id,
      "user_patient",
      space,
      "test",
      Date.now(),
      Date.now(),
      Date.now(),
    )
    .run();
  await request("user_patient", devicePath, "POST", device);
  await until(
    async () =>
      (
        await db
          .prepare("SELECT mode FROM reminder_devices WHERE id=?")
          .bind(device.id)
          .first()
      ).mode === "off",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT mode FROM reminder_devices WHERE id=?")
        .bind(device.id)
        .first()
    ).mode,
    "off",
  );
  pushError = null;
  await request("user_patient", devicePath, "POST", {
    ...device,
    mode: "local",
  });
  const before = pushes.length;
  await request("user_patient", devicePath, "POST", {
    ...device,
    mode: "local",
  });
  assert.equal(
    pushes.length,
    before,
    "local devices must not get cloud alerts",
  );
  assert.equal(
    (await request("user_patient", "/v1/reminders/revoke-session", "POST", {}))
      .status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM reminder_devices WHERE user_id=?",
        )
        .bind("user_patient")
        .first()
    ).count,
    0,
  );
  // Execute a real scheduled medicine occurrence via the local DO alarm.
  assert.equal(
    (await request("user_patient", devicePath, "POST", device)).status,
    403,
    "a late registration from a signed-out session must not resurrect push delivery",
  );
  activeSession = "sess_new_login";
  const current = (await request("user_patient", "/v1/state?space=" + space))
    .data.state;
  const med = current.medicines.find((m) => m.active);
  assert.ok(med);
  const dueTime = new Date(Date.now() - 60000).toISOString().slice(11, 16);
  const timedSettings = {
    ...settings,
    medicines: Object.fromEntries(
      current.medicines.map((m) => [
        m.id,
        { enabled: m.id === med.id, times: [dueTime] },
      ]),
    ),
  };
  assert.equal(
    (
      await request("user_patient", remindersPath, "POST", {
        preferences: timedSettings,
        revision: 1,
      })
    ).status,
    200,
  );
  const timedDevice = { ...device, id: randomUUID(), timezone: "UTC" };
  const sentBeforeSchedule = pushes.length;
  await request("user_patient", devicePath, "POST", timedDevice);
  await db
    .prepare("UPDATE reminder_devices SET active_since=? WHERE id=?")
    .bind(Date.now() - 180000, timedDevice.id)
    .run();
  await request("user_patient", devicePath, "POST", timedDevice);
  await until(() => pushes.length === sentBeforeSchedule + 1);
  assert.equal(pushes.at(-1).data.medicineId, med.id);
  assert.ok(!pushes.at(-1).body.includes(med.name));
  await request("user_patient", devicePath, "POST", timedDevice);
  await new Promise((resolve) => setTimeout(resolve, 1400));
  assert.equal(
    pushes.length,
    sentBeforeSchedule + 1,
    "replayed alarms must deduplicate a medicine occurrence",
  );
  await mutate("user_patient", { type: "archiveMedicine", medicineId: med.id });
  await db
    .prepare(
      "INSERT INTO reminder_deliveries(id,device_id,user_id,space_id,medicine_id,due_at,status,next_attempt,created_at) VALUES (?,?,?,?,?,?,'pending',?,?)",
    )
    .bind(
      "archived-real-med",
      timedDevice.id,
      "user_patient",
      space,
      med.id,
      Date.now(),
      Date.now(),
      Date.now(),
    )
    .run();
  await request("user_patient", devicePath, "POST", timedDevice);
  await until(
    async () =>
      (
        await db
          .prepare(
            "SELECT status FROM reminder_deliveries WHERE id='archived-real-med'",
          )
          .first()
      ).status === "cancelled",
  );
  assert.equal(pushes.length, sentBeforeSchedule + 1);
  await request("user_patient", "/v1/reminders/revoke-session", "POST", {});
  console.log(
    "Passed: reminder authorization, concurrent revision checks, device ownership, timezone validation, private push payloads, receipt tracking, cancellation, invalid tokens, exclusive local delivery and session revocation.",
  );
  console.log(
    "Passed: Worker/D1/R2, invalid/expired/wrong-issuer sessions, complete care journey, record provenance, atomic concurrent amendments and history, audited reads, admin isolation, consent plus explicit sharing grants and revocation, private file removal.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mf.dispose());
