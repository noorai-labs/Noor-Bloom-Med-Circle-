const assert = require("node:assert/strict");
const { randomUUID, createHmac } = require("node:crypto");
module.exports = async ({ db, request, mediaRooms }) => {
  const doctor = "call_doctor",
    date = new Date(Date.now() + 330 * 60000),
    hour = date.getUTCHours();
  const day = date.toISOString().slice(0, 10),
    time = `${String(hour % 12 || 12).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  const expiry = new Date(Date.now() + 365 * 86400000)
    .toISOString()
    .slice(0, 10);
  async function approve(user, kind) {
    await db
      .prepare(
        "INSERT INTO verification_applications(id,user_id,kind,status,details,valid_until) VALUES (?,?,?,'Approved','{}',?)",
      )
      .bind(randomUUID(), user, kind, expiry)
      .run();
  }
  await approve(doctor, "Doctor");
  const fixtures = [];
  for (let i = 0; i < 4; i++) {
    const user = "call_patient_" + i,
      snapshot = (await request(user, "/v1/state")).data,
      visit = {
        id: randomUUID(),
        providerId: "1",
        date: day,
        time,
        service: "Online Consultation",
        frequency: "Once",
        address: "",
        reason: "PRIVATE REASON",
        status: "Confirmed",
        checklist: [],
        notes: "",
      };
    snapshot.state.visits = [visit];
    await db
      .prepare("UPDATE care_spaces SET state=? WHERE id=?")
      .bind(JSON.stringify(snapshot.state), snapshot.spaceId)
      .run();
    await db
      .prepare(
        "INSERT INTO memberships(user_id,space_id,role,provider_id) VALUES (?,?,'Doctor','1')",
      )
      .bind(doctor, snapshot.spaceId)
      .run();
    await approve(user, "Patient");
    fixtures.push({
      user,
      space: snapshot.spaceId,
      visit,
      state: snapshot.state,
      path: "/v1/calls/" + visit.id,
    });
  }
  const [first] = fixtures,
    path = first.path + "/join?space=" + first.space;
  assert.equal((await request("call_intruder", path, "POST", {})).status, 403);
  await db
    .prepare(
      "INSERT INTO memberships(user_id,space_id,role) VALUES (?,?,'Family')",
    )
    .bind("call_family", first.space)
    .run();
  assert.equal((await request("call_family", path, "POST", {})).status, 403);
  await db
    .prepare(
      "UPDATE verification_applications SET status='Submitted' WHERE user_id=?",
    )
    .bind(first.user)
    .run();
  assert.equal((await request(first.user, path, "POST", {})).status, 403);
  await db
    .prepare(
      "UPDATE verification_applications SET status='Approved' WHERE user_id=?",
    )
    .bind(first.user)
    .run();
  const joins = await Promise.all(
    fixtures.map((f) =>
      request(f.user, f.path + "/join?space=" + f.space, "POST", {}),
    ),
  );
  assert.deepEqual(
    joins.map((r) => r.status).sort(),
    [200, 200, 200, 503],
    "exactly three consultation rooms may reserve capacity",
  );
  assert.equal(mediaRooms.size, 3);
  const index = joins.findIndex((r) => r.status === 200),
    fixture = fixtures[index],
    credentials = joins[index].data;
  assert.equal(credentials.encryption, "required");
  assert.equal(credentials.role, "Patient");
  assert.ok(credentials.sharedKey.length >= 32);
  assert.ok(!JSON.stringify(credentials).includes("PRIVATE REASON"));
  const [header, payload, signature] = credentials.token.split("."),
    claims = JSON.parse(Buffer.from(payload, "base64url"));
  assert.equal(
    createHmac("sha256", "a".repeat(64))
      .update(header + "." + payload)
      .digest("base64url"),
    signature,
  );
  assert.equal(claims.video.room, credentials.roomId);
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.canPublishData, false);
  assert.ok(!claims.video.roomAdmin);
  assert.ok(!claims.video.roomCreate);
  assert.ok(claims.exp - claims.nbf <= 95);
  const joinedDoctor = await request(
    doctor,
    fixture.path + "/join?space=" + fixture.space,
    "POST",
    {},
  );
  assert.equal(joinedDoctor.status, 200, JSON.stringify(joinedDoctor.data));
  assert.equal(joinedDoctor.data.sharedKey, credentials.sharedKey);
  assert.equal(joinedDoctor.data.roomId, credentials.roomId);
  assert.equal(
    mediaRooms.size,
    3,
    "a second participant must share its existing slot",
  );
  assert.equal(
    (
      await request(
        fixture.user,
        fixture.path + "/status?space=" + fixture.space,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        fixture.user,
        fixture.path + "/join?space=" + fixture.space,
        "POST",
        {},
      )
    ).status,
    429,
  );
  const busy = fixtures[joins.findIndex((r) => r.status === 503)];
  await request(
    fixture.user,
    fixture.path + "/leave?space=" + fixture.space,
    "POST",
    {},
  );
  assert.equal(
    (
      await request(
        fixture.user,
        fixture.path + "/status?space=" + fixture.space,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        doctor,
        fixture.path + "/leave?space=" + fixture.space,
        "POST",
        {},
      )
    ).status,
    200,
  );
  assert.equal(mediaRooms.size, 2);
  assert.equal(
    (
      await request(
        busy.user,
        busy.path + "/join?space=" + busy.space,
        "POST",
        {},
      )
    ).status,
    200,
    "released slots must be reusable",
  );
  await db
    .prepare(
      "UPDATE verification_applications SET status='Suspended' WHERE user_id=?",
    )
    .bind(doctor)
    .run();
  assert.equal(
    (await request(busy.user, busy.path + "/status?space=" + busy.space))
      .status,
    403,
  );
  await db
    .prepare(
      "UPDATE verification_applications SET status='Approved' WHERE user_id=?",
    )
    .bind(doctor)
    .run();
  const cancelled = fixtures.find((f) => f !== fixture && f !== busy);
  const cancelledRoom = (
    await db
      .prepare("SELECT room_id FROM consultation_calls WHERE space_id=?")
      .bind(cancelled.space)
      .first()
  ).room_id;
  const cancellation = await request(
    cancelled.user,
    "/v1/actions?space=" + cancelled.space,
    "POST",
    {
      revision: 0,
      operationId: randomUUID(),
      action: {
        type: "status",
        visitId: cancelled.visit.id,
        status: "Cancelled",
      },
    },
  );
  assert.equal(cancellation.status, 200, JSON.stringify(cancellation.data));
  for (let i = 0; i < 30 && mediaRooms.has(cancelledRoom); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(
    !mediaRooms.has(cancelledRoom),
    "cancelling the appointment must delete the media room",
  );
  assert.equal(
    (
      await request(
        cancelled.user,
        cancelled.path + "/join?space=" + cancelled.space,
        "POST",
        {},
      )
    ).status,
    409,
  );
  for (const f of fixtures)
    await request(f.user, "/v1/reminders/revoke-session", "POST", {});
  for (let i = 0; i < 30 && mediaRooms.size; i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(mediaRooms.size, 0);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS count FROM consultation_call_slots")
        .first()
    ).count,
    0,
  );
  assert.equal(
    (
      await request(
        busy.user,
        busy.path + "/join?space=" + busy.space,
        "POST",
        {},
      )
    ).status,
    401,
  );
  console.log(
    "Passed: appointment call authorization, verification and suspension gates, three-room concurrency limit, room-specific short-lived tokens, shared E2EE key, leave/reuse, cancellation and logout cleanup.",
  );
};
