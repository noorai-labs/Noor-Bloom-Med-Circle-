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
function jwt(user) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body =
    encode({ alg: "RS256", typ: "JWT", kid: "test-key" }) +
    "." +
    encode({
      sub: user,
      sid: "sess_test",
      iss: issuer,
      azp: "bloommed://",
      iat: now,
      nbf: now - 5,
      exp: now + 300,
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
        r2Buckets: ["FILES"],
        bindings: {
          CLERK_JWT_KEY: publicKey.export({ type: "spki", format: "pem" }),
          CLERK_ISSUER: issuer,
          ALLOWED_ORIGINS: "http://localhost:8083",
          AUTHORIZED_PARTIES: "bloommed://",
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
  return { status: response.status, data };
}
async function main() {
  const forged = await mf.dispatchFetch("http://test/v1/state", {
    headers: { Authorization: "Bearer invalid.token.signature" },
  });
  assert.equal(forged.status, 401);
  const db = await mf.getD1Database("DB");
  for (const sql of fs
    .readFileSync(path.join(root, "backend/migrations/0001_care.sql"), "utf8")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(sql).run();
  assert.equal((await mf.dispatchFetch("http://test/v1/state")).status, 401);
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
  assert.equal(crossDoctorUpdate.status, 400);
  assert.equal(
    crossDoctorUpdate.data.error,
    "This visit belongs to another care professional.",
  );

  // 4. Defect reproduction: Booking a second visit must NOT corrupt historical visit status
  const date2 = new Date();
  date2.setDate(date2.getDate() + 4);
  const day2 = date2.toISOString().slice(0, 10);
  state = await mutate("user_patient", {
    type: "book",
    visit: {
      providerId: "1",
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
  assert.equal(
    state.visits[state.visits.length - 1].status,
    "Requested",
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
  console.log(
    "Passed: real local Worker + D1 + R2, signed JWT authentication, account isolation, server roles, complete doctor journey, private uploads/downloads, consent, conflicts and record removal.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mf.dispose());
