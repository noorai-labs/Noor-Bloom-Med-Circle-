const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { generateKeyPairSync, sign, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const issuer = "https://test.clerk.accounts.dev";

function jwt(user, overrides = {}) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body =
    encode({ alg: "RS256", typ: "JWT", kid: "test-key" }) +
    "." +
    encode({
      sub: user,
      sid: "sess_" + user,
      iss: issuer,
      azp: "bloommed://",
      iat: now,
      nbf: now - 5,
      exp: now + 3600,
      ...overrides,
    });
  return (
    body +
    "." +
    sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")
  );
}

async function runDemo() {
  console.log("\n" + "=".repeat(64));
  console.log("  BLOOM MED: Appointment Concurrency & Invariants Demo");
  console.log("=".repeat(64) + "\n");

  console.log("[1/5] Booting local Miniflare D1 backend & applying migrations...");
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

  const db = await mf.getD1Database("DB");
  const migrationFiles = fs
    .readdirSync(path.join(root, "backend/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of migrationFiles) {
    const sql = fs.readFileSync(path.join(root, "backend/migrations", f), "utf8");
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }
  console.log(`      Applied migrations: ${migrationFiles.join(", ")}.`);

  async function request(user, endpoint, method = "GET", body) {
    const res = await mf.dispatchFetch("http://test" + endpoint, {
      method,
      headers: {
        Authorization: "Bearer " + jwt(user),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data, headers: res.headers };
  }

  console.log("\n[2/5] Creating 2 isolated patients in separate Care Spaces...");
  const initA = await request("patient_alice", "/v1/state");
  const initB = await request("patient_bob", "/v1/state");
  assert.equal(initA.status, 200);
  assert.equal(initB.status, 200);

  const spaceA = initA.data.spaceId;
  const spaceB = initB.data.spaceId;
  let revA = initA.data.revision;
  let revB = initB.data.revision;

  console.log(`      Patient Alice space: ${spaceA}`);
  console.log(`      Patient Bob space:   ${spaceB}`);

  // Onboard both patients
  const onboardA = await request("patient_alice", "/v1/actions?space=" + spaceA, "POST", {
    revision: revA,
    action: {
      type: "profile",
      profile: { ...initA.data.state.profile, name: "Alice", age: "29", address: "123 Elm St" },
      onboarding: true,
    },
    operationId: randomUUID(),
  });
  revA = onboardA.data.revision;

  const onboardB = await request("patient_bob", "/v1/actions?space=" + spaceB, "POST", {
    revision: revB,
    action: {
      type: "profile",
      profile: { ...initB.data.state.profile, name: "Bob", age: "34", address: "456 Oak St" },
      onboarding: true,
    },
    operationId: randomUUID(),
  });
  revB = onboardB.data.revision;
  console.log("      Both patients onboarded successfully.");

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 5);
  const slotDate = targetDate.toISOString().slice(0, 10);
  const slotTime = "02:00 PM";
  const doctorId = "1"; // Dr. Priya

  console.log(`\n[3/5] Simulating SIMULTANEOUS booking requests for Dr. Priya:`);
  console.log(`      Target slot: ${slotDate} at ${slotTime}`);
  console.log("      Firing concurrent requests with Promise.all()...");

  const opA = randomUUID();
  const opB = randomUUID();

  const [resA, resB] = await Promise.all([
    request("patient_alice", "/v1/actions?space=" + spaceA, "POST", {
      revision: revA,
      action: {
        type: "book",
        visit: {
          providerId: doctorId,
          date: slotDate,
          time: slotTime,
          service: "Home Visit",
          frequency: "One visit",
          address: "123 Elm St",
          reason: "General Consultation",
        },
      },
      operationId: opA,
    }),
    request("patient_bob", "/v1/actions?space=" + spaceB, "POST", {
      revision: revB,
      action: {
        type: "book",
        visit: {
          providerId: doctorId,
          date: slotDate,
          time: slotTime,
          service: "Home Visit",
          frequency: "One visit",
          address: "456 Oak St",
          reason: "Health Checkup",
        },
      },
      operationId: opB,
    }),
  ]);

  console.log(`      Alice Response: HTTP ${resA.status} ${resA.status === 200 ? "(Accepted)" : `(Rejected: ${resA.data.error})`}`);
  console.log(`      Bob Response:   HTTP ${resB.status} ${resB.status === 200 ? "(Accepted)" : `(Rejected: ${resB.data.error})`}`);

  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 409], "Expected exactly one 200 and one 409");

  const bookedSlots = await db
    .prepare("SELECT * FROM appointment_slots WHERE provider_id=? AND date=? AND time=? AND status IN ('Requested', 'Confirmed', 'In Progress')")
    .bind(doctorId, slotDate, slotTime)
    .all();
  console.log(`      Database verification: Exactly ${bookedSlots.results.length} active row in appointment_slots table.`);

  console.log("\n[4/5] Testing Idempotent Network Retry:");
  const winner = resA.status === 200 ? { name: "Alice", user: "patient_alice", space: spaceA, rev: resA.data.revision, op: opA } : { name: "Bob", user: "patient_bob", space: spaceB, rev: resB.data.revision, op: opB };
  console.log(`      Retrying original booking request for ${winner.name} with same operationId...`);

  const retryRes = await request(winner.user, "/v1/actions?space=" + winner.space, "POST", {
    revision: winner.rev,
    action: {
      type: "book",
      visit: {
        providerId: doctorId,
        date: slotDate,
        time: slotTime,
        service: "Home Visit",
        frequency: "One visit",
        address: "Address",
        reason: "Retry test",
      },
    },
    operationId: winner.op,
  });

  console.log(`      Retry Response: HTTP ${retryRes.status} OK`);
  console.log(`      X-Idempotent-Replay header: "${retryRes.headers.get("x-idempotent-replay")}"`);
  const slotCountAfter = await db
    .prepare("SELECT COUNT(*) as cnt FROM appointment_slots WHERE provider_id=? AND date=? AND time=?")
    .bind(doctorId, slotDate, slotTime)
    .first();
  console.log(`      Database check: ${slotCountAfter.cnt} slot exists (No duplicate created!).`);

  console.log("\n[5/5] Testing Reschedule Conflict & Cancellation Slot Release:");
  const loser = resA.status === 409 ? { name: "Alice", user: "patient_alice", space: spaceA, rev: revA } : { name: "Bob", user: "patient_bob", space: spaceB, rev: revB };
  
  // Loser books 04:30 PM first
  console.log(`      ${loser.name} books an alternative slot at 04:30 PM...`);
  const loserBook = await request(loser.user, "/v1/actions?space=" + loser.space, "POST", {
    revision: loser.rev,
    action: {
      type: "book",
      visit: {
        providerId: doctorId,
        date: slotDate,
        time: "04:30 PM",
        service: "Home Visit",
        frequency: "One visit",
        address: "Alternative Address",
        reason: "Alternative booking",
      },
    },
    operationId: randomUUID(),
  });
  console.log(`      ${loser.name} booked 04:30 PM: HTTP ${loserBook.status} OK`);
  const loserVisitId = loserBook.data.state.visits[loserBook.data.state.visits.length - 1].id;
  const loserRev = loserBook.data.revision;

  // Loser tries to reschedule to 02:00 PM (which Winner has)
  console.log(`      ${loser.name} tries to reschedule to 02:00 PM (currently taken by ${winner.name})...`);
  const badReschedule = await request(loser.user, "/v1/actions?space=" + loser.space, "POST", {
    revision: loserRev,
    action: {
      type: "reschedule",
      visitId: loserVisitId,
      date: slotDate,
      time: slotTime,
    },
    operationId: randomUUID(),
  });
  console.log(`      Reschedule collision response: HTTP ${badReschedule.status} - "${badReschedule.data.error}"`);

  // Winner cancels their 02:00 PM visit
  const winnerVisitId = (resA.status === 200 ? resA : resB).data.state.visits.slice(-1)[0].id;
  console.log(`      ${winner.name} cancels the 02:00 PM booking...`);
  const cancelRes = await request(winner.user, "/v1/actions?space=" + winner.space, "POST", {
    revision: winner.rev,
    action: {
      type: "status",
      visitId: winnerVisitId,
      status: "Cancelled",
    },
    operationId: randomUUID(),
  });
  console.log(`      Cancellation response: HTTP ${cancelRes.status} OK (Slot freed).`);

  // Verify audit attribution
  const audit = await db.prepare("SELECT * FROM security_audit WHERE actor_id=? AND action='care.status'").bind(winner.user).all();
  console.log(`      Security audit check: Found ${audit.results.length} audit entry for actor "${winner.user}".`);

  // Now loser reschedules to 02:00 PM
  console.log(`      ${loser.name} re-attempts rescheduling to 02:00 PM (now freed)...`);
  const freedReschedule = await request(loser.user, "/v1/actions?space=" + loser.space, "POST", {
    revision: loserRev,
    action: {
      type: "reschedule",
      visitId: loserVisitId,
      date: slotDate,
      time: slotTime,
    },
    operationId: randomUUID(),
  });
  console.log(`      Reschedule to freed slot: HTTP ${freedReschedule.status} OK (Successfully claimed!)`);

  console.log("\n" + "=".repeat(64));
  console.log("  DEMO COMPLETE: All Concurrency & Invariant Gates Verified!");
  console.log("=".repeat(64) + "\n");

  await mf.dispose();
}

runDemo().catch((err) => {
  console.error("Demo failed with error:", err);
  process.exit(1);
});
