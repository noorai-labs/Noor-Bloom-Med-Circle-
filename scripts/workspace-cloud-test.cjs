const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

module.exports = async ({ db, request }) => {
  const futureDate = new Date(Date.now() + 365 * 86400000)
    .toISOString()
    .slice(0, 10);

  const bloomDoctor = "ws_doc_bloom_" + randomUUID().slice(0, 8);
  const pendingDoctor = "ws_doc_pending_" + randomUUID().slice(0, 8);
  const bloomAdmin = "ws_admin_bloom_" + randomUUID().slice(0, 8);
  const apolloAdmin = "ws_admin_apollo_" + randomUUID().slice(0, 8);
  const patientUser = "ws_patient_" + randomUUID().slice(0, 8);

  // Create patient care space with sensitive clinical data
  const patientSnapshot = (await request(patientUser, "/v1/state")).data;
  const bloomCardioSpace = "ws_cardio_" + randomUUID().slice(0, 8);
  const bloomPedsSpace = "ws_peds_" + randomUUID().slice(0, 8);
  const apolloHeartSpace = "ws_apollo_" + randomUUID().slice(0, 8);

  const privateCareState = JSON.stringify({
    ...patientSnapshot.state,
    profile: {
      ...patientSnapshot.state.profile,
      name: "Confidential Patient",
      conditions: "SECRET_DIAGNOSIS",
      consent: true,
    },
    records: [
      {
        id: "rec_secret_1",
        name: "Lab Report",
        category: "Lab",
        date: "2026-11-20",
        detail: "CONFIDENTIAL_LAB_RESULT",
      },
    ],
  });

  await db.batch([
    db
      .prepare("INSERT INTO care_spaces (id, state) VALUES (?, ?)")
      .bind(bloomCardioSpace, privateCareState),
    db
      .prepare(
        "INSERT INTO workspace_organizations (space_id, organization_id, name) VALUES (?, 'org_bloom', 'Cardiology Clinic')",
      )
      .bind(bloomCardioSpace),
    db
      .prepare("INSERT INTO care_spaces (id, state) VALUES (?, ?)")
      .bind(bloomPedsSpace, privateCareState),
    db
      .prepare(
        "INSERT INTO workspace_organizations (space_id, organization_id, name) VALUES (?, 'org_bloom', 'Pediatrics Ward')",
      )
      .bind(bloomPedsSpace),
    db
      .prepare("INSERT INTO care_spaces (id, state) VALUES (?, ?)")
      .bind(apolloHeartSpace, privateCareState),
    db
      .prepare(
        "INSERT INTO workspace_organizations (space_id, organization_id, name) VALUES (?, 'org_apollo', 'Apollo Heart Care')",
      )
      .bind(apolloHeartSpace),
  ]);

  // Set up approved Bloom Doctor, pending Doctor, and Org Admins
  await db.batch([
    db
      .prepare(
        "INSERT INTO verification_applications (id, user_id, kind, status, details, valid_until) VALUES (?, ?, 'Doctor', 'Approved', ?, ?)",
      )
      .bind(
        randomUUID(),
        bloomDoctor,
        JSON.stringify({
          fullName: "Dr. Bloom Clinician",
          organizationId: "org_bloom",
          organizationName: "MedBloom Health Network",
        }),
        futureDate,
      ),
    db
      .prepare(
        "INSERT INTO verification_applications (id, user_id, kind, status, details, valid_until) VALUES (?, ?, 'Doctor', 'Submitted', ?, '')",
      )
      .bind(
        randomUUID(),
        pendingDoctor,
        JSON.stringify({
          fullName: "Dr. Unapproved",
          organizationId: "org_bloom",
        }),
      ),
    db
      .prepare(
        "INSERT INTO organization_admins (user_id, organization_id, active) VALUES (?, 'org_bloom', 1)",
      )
      .bind(bloomAdmin),
    db
      .prepare(
        "INSERT INTO organization_admins (user_id, organization_id, active) VALUES (?, 'org_apollo', 1)",
      )
      .bind(apolloAdmin),
  ]);

  // 1. Unapproved doctor and patient cannot browse organization workspaces
  assert.equal((await request(pendingDoctor, "/v1/workspaces")).status, 403);
  assert.equal((await request(patientUser, "/v1/workspaces")).status, 403);

  // 2. Approved Bloom doctor browses workspaces -> sees ONLY org_bloom workspaces, never org_apollo
  const listRes = await request(bloomDoctor, "/v1/workspaces");
  assert.equal(listRes.status, 200);
  const spaceIds = listRes.data.workspaces.map((w) => w.spaceId);
  assert.ok(spaceIds.includes(bloomCardioSpace));
  assert.ok(spaceIds.includes(bloomPedsSpace));
  assert.ok(
    !spaceIds.includes(apolloHeartSpace),
    "Doctor must never see workspaces from another organization",
  );

  // Verify no clinical data leaks in workspace browse payload
  const serialized = JSON.stringify(listRes.data);
  assert.ok(!serialized.includes("SECRET_DIAGNOSIS"));
  assert.ok(!serialized.includes("CONFIDENTIAL_LAB_RESULT"));

  // Search by workspace name
  const searchRes = await request(bloomDoctor, "/v1/workspaces?search=cardio");
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.data.workspaces.length, 1);
  assert.equal(searchRes.data.workspaces[0].spaceId, bloomCardioSpace);
  assert.equal(searchRes.data.workspaces[0].name, "Cardiology Clinic");
  assert.equal(searchRes.data.workspaces[0].member, false);
  assert.equal(searchRes.data.workspaces[0].requestStatus, null);

  // 3. Doctor cannot request to join a workspace in another organization
  const crossOrgJoin = await request(bloomDoctor, "/v1/workspaces/join", "POST", {
    spaceId: apolloHeartSpace,
  });
  assert.equal(crossOrgJoin.status, 403);

  // 4. Doctor requests to join Cardiology Clinic in their own organization
  const joinRes = await request(bloomDoctor, "/v1/workspaces/join", "POST", {
    spaceId: bloomCardioSpace,
  });
  assert.equal(joinRes.status, 200);
  assert.equal(joinRes.data.request.status, "Pending");
  const requestId = joinRes.data.request.id;

  // Duplicate pending request is rejected
  const dupJoin = await request(bloomDoctor, "/v1/workspaces/join", "POST", {
    spaceId: bloomCardioSpace,
  });
  assert.equal(dupJoin.status, 409);

  // Doctor can view their own pending request
  const myRequests = await request(bloomDoctor, "/v1/workspaces/requests");
  assert.equal(myRequests.status, 200);
  assert.equal(myRequests.data.requests.length, 1);
  assert.equal(myRequests.data.requests[0].status, "Pending");

  // 5. CRITICAL: Pending join request grants ZERO access to care space or patient records
  assert.equal(
    (await request(bloomDoctor, "/v1/state?space=" + bloomCardioSpace)).status,
    403,
    "Pending join request must not grant care space access",
  );
  assert.equal(
    (
      await request(
        bloomDoctor,
        "/v1/records/rec_secret_1/history?space=" + bloomCardioSpace,
      )
    ).status,
    403,
    "Pending join request must not grant patient record access",
  );

  // 6. Admin authorization isolation
  assert.equal(
    (await request(bloomDoctor, "/v1/workspaces/admin/requests")).status,
    403,
  );
  assert.equal(
    (
      await request(
        apolloAdmin,
        "/v1/workspaces/admin/requests?organizationId=org_bloom",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(apolloAdmin, "/v1/workspaces/admin/review", "POST", {
        requestId,
        decision: "Approved",
      })
    ).status,
    403,
    "Admin from another organization must not review org_bloom requests",
  );

  // 7. Bloom admin lists pending requests and rejects first to test rejection + re-request
  const adminQueue = await request(
    bloomAdmin,
    "/v1/workspaces/admin/requests?status=Pending",
  );
  assert.equal(adminQueue.status, 200);
  assert.ok(adminQueue.data.requests.some((r) => r.id === requestId));

  const rejectRes = await request(
    bloomAdmin,
    "/v1/workspaces/admin/review",
    "POST",
    {
      requestId,
      decision: "Rejected",
      reason: "Awaiting shift confirmation",
    },
  );
  assert.equal(rejectRes.status, 200);
  assert.equal(
    (await request(bloomDoctor, "/v1/state?space=" + bloomCardioSpace)).status,
    403,
    "Rejected join request must grant no access",
  );

  // Doctor re-requests after rejection, then Bloom admin approves
  const rejoinRes = await request(bloomDoctor, "/v1/workspaces/join", "POST", {
    spaceId: bloomCardioSpace,
  });
  assert.equal(rejoinRes.status, 200);
  assert.equal(rejoinRes.data.request.status, "Pending");

  const approveRes = await request(
    bloomAdmin,
    "/v1/workspaces/admin/review",
    "POST",
    {
      requestId: rejoinRes.data.request.id,
      decision: "Approved",
      reason: "Verified clinic roster",
    },
  );
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.status, "Approved");

  // Verify membership was granted in memberships with records_access=0 and appears in /v1/spaces
  const membership = await db
    .prepare(
      "SELECT role, records_access FROM memberships WHERE user_id=? AND space_id=?",
    )
    .bind(bloomDoctor, bloomCardioSpace)
    .first();
  assert.equal(membership.role, "Doctor");
  assert.equal(membership.records_access, 0);

  const docSpaces = await request(bloomDoctor, "/v1/spaces");
  assert.equal(docSpaces.status, 200);
  assert.ok(
    docSpaces.data.some((s) => s.id === bloomCardioSpace && s.role === "Doctor"),
    "Approved workspace must appear in doctor's /v1/spaces",
  );

  console.log(
    "Passed: organization workspace browsing, org-scoped isolation, join requests, zero access while pending/rejected, and admin review approval.",
  );
};
