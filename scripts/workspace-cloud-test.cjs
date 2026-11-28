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

  // Identical names spanning two pages must use space ID as a tiebreaker.
  await db.batch([
    db
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 53)
      INSERT INTO care_spaces(id,state) SELECT printf('ws_page_%02d',i), ? FROM n`,
      )
      .bind(privateCareState),
    db.prepare(`INSERT INTO workspace_organizations(space_id,organization_id,name)
      SELECT id, CASE WHEN id='ws_page_53' THEN 'org_apollo' ELSE 'org_bloom' END,
        CASE WHEN id='ws_page_52' THEN 'Z Other Clinic' ELSE 'Z Cardiology Clinic' END
      FROM care_spaces WHERE id GLOB 'ws_page_*'`),
  ]);
  const firstPage = await request(bloomDoctor, "/v1/workspaces?search=cardio");
  assert.equal(firstPage.status, 200);
  assert.deepEqual(
    firstPage.data.workspaces.map((w) => w.spaceId),
    [
      bloomCardioSpace,
      ...Array.from(
        { length: 49 },
        (_, i) => "ws_page_" + String(i + 1).padStart(2, "0"),
      ),
    ],
  );
  const secondPage = await request(
    bloomDoctor,
    "/v1/workspaces?search=cardio&cursor=" +
      encodeURIComponent(firstPage.data.nextCursor),
  );
  assert.equal(secondPage.status, 200);
  assert.deepEqual(
    secondPage.data.workspaces.map((w) => w.spaceId),
    ["ws_page_50", "ws_page_51"],
  );
  assert.equal(secondPage.data.nextCursor, null);
  assert.equal(
    (await request(bloomDoctor, "/v1/workspaces?cursor=invalid")).status,
    400,
  );

  const joinPath = "/v1/workspaces/join";
  const baseSize = JSON.stringify({
    spaceId: bloomCardioSpace,
    padding: "",
  }).length;
  const oversized = await request(bloomDoctor, joinPath, "POST", {
    spaceId: bloomCardioSpace,
    padding: "é".repeat(20001 - baseSize),
  });
  assert.equal(oversized.status, 413);
  // 3. Doctor cannot request to join a workspace in another organization
  const crossOrgJoin = await request(
    bloomDoctor,
    "/v1/workspaces/join",
    "POST",
    {
      spaceId: apolloHeartSpace,
    },
  );
  assert.equal(crossOrgJoin.status, 403);

  // 4. Doctor requests to join Cardiology Clinic in their own organization
  const firstJoins = await Promise.all(
    Array.from({ length: 2 }, () =>
      request(bloomDoctor, joinPath, "POST", {
        spaceId: bloomCardioSpace,
        padding: "é".repeat(20000 - baseSize),
      }),
    ),
  );
  assert.deepEqual(firstJoins.map((res) => res.status).sort(), [200, 409]);
  const joinRes = firstJoins.find((res) => res.status === 200);
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
  const firstAttempt = adminQueue.data.requests.find(
    (r) => r.id === requestId,
  ).attempt;

  const rejectRes = await request(
    bloomAdmin,
    "/v1/workspaces/admin/review",
    "POST",
    {
      requestId,
      attempt: firstAttempt,
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

  // A rejected request can still reference the workspace's former organization.
  await db
    .prepare(
      "UPDATE workspace_join_requests SET organization_id='org_apollo' WHERE id=?",
    )
    .bind(requestId)
    .run();
  // Doctor re-requests after rejection, then Bloom admin approves
  const retries = await Promise.all(
    Array.from({ length: 2 }, () =>
      request(bloomDoctor, joinPath, "POST", { spaceId: bloomCardioSpace }),
    ),
  );
  assert.deepEqual(retries.map((res) => res.status).sort(), [200, 409]);
  assert.equal(
    retries.find((res) => res.status === 200).data.request.status,
    "Pending",
  );

  const reviewPath = "/v1/workspaces/admin/review";
  const stale = await request(bloomAdmin, reviewPath, "POST", {
    requestId,
    attempt: firstAttempt,
    decision: "Approved",
  });
  assert.equal(stale.status, 409);
  assert.equal(
    await db
      .prepare("SELECT 1 FROM memberships WHERE space_id=? AND user_id=?")
      .bind(bloomCardioSpace, bloomDoctor)
      .first(),
    null,
  );

  const currentQueue = await request(
    bloomAdmin,
    "/v1/workspaces/admin/requests",
  );
  const reopened = currentQueue.data.requests.find((r) => r.id === requestId);
  assert.equal(reopened.organizationId, "org_bloom");
  const { attempt } = reopened;
  assert.notEqual(attempt, firstAttempt);
  const reviews = await Promise.all(
    Array.from({ length: 2 }, () =>
      request(bloomAdmin, reviewPath, "POST", {
        requestId,
        attempt,
        decision: "Approved",
        reason: "Verified clinic roster",
      }),
    ),
  );
  assert.deepEqual(reviews.map((res) => res.status).sort(), [200, 409]);
  const approveRes = reviews.find((res) => res.status === 200);
  const audit = await db
    .prepare(
      "SELECT action FROM security_audit WHERE actor_id=? AND space_id=? AND target_id=? ORDER BY id",
    )
    .bind(bloomAdmin, bloomCardioSpace, bloomDoctor)
    .all();
  assert.deepEqual(
    audit.results.map((row) => row.action),
    ["workspace.join.reject", "workspace.join.approve"],
  );
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.status, "Approved");

  // Verify membership was granted in memberships with records_access=0, without access until assignment
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
  assert.ok(!docSpaces.data.some((s) => s.id === bloomCardioSpace));
  assert.equal(
    (await request(bloomDoctor, "/v1/state?space=" + bloomCardioSpace)).status,
    403,
  );

  // A membership added after the join request must not be replaced or have its grant reset.
  const pedsJoin = await request(bloomDoctor, joinPath, "POST", {
    spaceId: bloomPedsSpace,
  });
  assert.equal(pedsJoin.status, 200);
  const pedsRequestId = pedsJoin.data.request.id;
  const decidePeds = () =>
    request(bloomAdmin, reviewPath, "POST", {
      requestId: pedsRequestId,
      attempt: 1,
      decision: "Approved",
    });
  await db
    .prepare(
      "INSERT INTO memberships(user_id,space_id,role,provider_id,records_access) VALUES (?,?,'Doctor','different_provider',1)",
    )
    .bind(bloomDoctor, bloomPedsSpace)
    .run();
  const readPedsMembership = () =>
    db
      .prepare(
        "SELECT role,provider_id,records_access FROM memberships WHERE user_id=? AND space_id=?",
      )
      .bind(bloomDoctor, bloomPedsSpace)
      .first();
  assert.equal((await decidePeds()).status, 409);
  assert.deepEqual(await readPedsMembership(), {
    role: "Doctor",
    provider_id: "different_provider",
    records_access: 1,
  });
  assert.equal(
    await db
      .prepare("SELECT status FROM workspace_join_requests WHERE id=?")
      .bind(pedsRequestId)
      .first("status"),
    "Pending",
  );
  const readPedsAuditCount = () =>
    db
      .prepare(
        "SELECT count(*) AS count FROM security_audit WHERE action='workspace.join.approve' AND space_id=?",
      )
      .bind(bloomPedsSpace)
      .first("count");
  assert.equal(await readPedsAuditCount(), 0);

  await db
    .prepare(
      "UPDATE memberships SET provider_id=? WHERE user_id=? AND space_id=?",
    )
    .bind(bloomDoctor, bloomDoctor, bloomPedsSpace)
    .run();
  assert.equal((await decidePeds()).status, 200);
  assert.deepEqual(await readPedsMembership(), {
    role: "Doctor",
    provider_id: bloomDoctor,
    records_access: 1,
  });
  assert.equal(await readPedsAuditCount(), 1);

  // 8. Day 4 End-to-End: First-time doctor onboarding -> approval -> Doctor Home -> patient search -> consultation request
  const fullFlowDoc = "n_e2e_full_doc_" + randomUUID().slice(0, 8);
  const fullFlowPatient = "e2e_full_pat_" + randomUUID().slice(0, 8);
  const fullFlowReviewer = "e2e_full_rev_" + randomUUID().slice(0, 8);

  // First-time doctor searches organization
  const orgRes = await request(fullFlowDoc, "/v1/organizations?search=fortis");
  assert.equal(orgRes.status, 200);
  assert.equal(orgRes.data.organizations[0].id, "org_fortis");

  // Upload & submit verification documents
  const pdfBody = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF";
  const docUpload = await request(
    fullFlowDoc,
    "/v1/verification/documents?consent=1&name=license.pdf",
    "POST",
    pdfBody,
    "application/pdf",
  );
  assert.equal(docUpload.status, 200);

  const docSubmit = await request(
    fullFlowDoc,
    "/v1/verification/submit",
    "POST",
    {
      kind: "Doctor",
      revision: 0,
      details: {
        fullName: "Dr. FullFlow Physician",
        country: "India",
        authority: "National Medical Commission",
        registrationNumber: "NMC-FULL-2026",
        qualification: "MBBS, MD - Pediatrics",
        consent: true,
        organizationId: "org_fortis",
        organizationName: "Fortis Care Center",
        specialty: "Pediatrics",
        languages: ["English", "Telugu"],
        modes: ["video", "in-person"],
      },
      documents: [docUpload.data.id],
    },
  );
  assert.equal(docSubmit.status, 200);

  // While pending review: excluded from provider discovery and blocked from workspace browsing
  const beforeApprovalList = await request(
    fullFlowPatient,
    "/v1/providers?specialty=Pediatrics",
  );
  assert.ok(
    !beforeApprovalList.data.providers.some((p) => p.id === fullFlowDoc),
    "Pending doctor must not appear in patient search",
  );
  assert.equal((await request(fullFlowDoc, "/v1/workspaces")).status, 403);

  // Negative booking test: Patient cannot book an unapproved doctor
  const patInit = (await request(fullFlowPatient, "/v1/state")).data;
  const futureVisitDate = new Date(Date.now() + 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  const unapprovedBook = await request(
    fullFlowPatient,
    "/v1/actions?space=" + patInit.spaceId,
    "POST",
    {
      revision: patInit.revision,
      operationId: randomUUID(),
      action: {
        type: "book",
        visit: {
          providerId: fullFlowDoc,
          date: futureVisitDate,
          time: "10:00 AM",
          service: "Online Consultation",
          frequency: "One visit",
          address: "",
          reason: "Pediatric checkup",
        },
      },
    },
  );
  assert.equal(unapprovedBook.status, 400);
  assert.equal(
    unapprovedBook.data.error,
    "This professional is not accepting new bookings.",
  );

  // Reviewer approves the doctor
  await db
    .prepare(
      "INSERT OR REPLACE INTO verification_reviewers(user_id,active) VALUES (?,1)",
    )
    .bind(fullFlowReviewer)
    .run();
  const approveDoc = await request(
    fullFlowReviewer,
    "/v1/verification/review",
    "POST",
    {
      id: docSubmit.data.id,
      revision: 1,
      status: "Approved",
      reason: "Medical council registration verified",
      identityReference: "ID-FULL-OK",
      registrationReference: "NMC-FULL-OK",
      validUntil: futureDate,
    },
  );
  assert.equal(approveDoc.status, 200);

  // Doctor opens Doctor Home without any assigned visit or workspace
  const fullDocSpaces = await request(fullFlowDoc, "/v1/spaces");
  assert.equal(fullDocSpaces.status, 200);
  const fullDocHomeSpace = fullDocSpaces.data.find((s) => s.role === "Doctor");
  assert.equal(fullDocHomeSpace.id, "doctor_dashboard_" + fullFlowDoc);
  const personalDoctorState = await request(fullFlowDoc, "/v1/state");
  assert.equal(personalDoctorState.data.spaceId, "personal_" + fullFlowDoc);
  assert.equal(personalDoctorState.data.state.session.role, "Patient");
  const selfBooking = await request(fullFlowDoc, "/v1/actions", "POST", {
    revision: personalDoctorState.data.revision,
    operationId: randomUUID(),
    action: {
      type: "book",
      visit: { providerId: fullFlowDoc, date: futureVisitDate, time: "10:00 AM" },
    },
  });
  assert.equal(selfBooking.status, 409);
  assert.equal(
    (await request(fullFlowDoc, "/v1/state")).data.state.session.role,
    "Patient",
  );
  const fullDocHomeState = await request(
    fullFlowDoc,
    "/v1/state?space=" + fullDocHomeSpace.id,
  );
  assert.equal(fullDocHomeState.status, 200);
  assert.equal(fullDocHomeState.data.state.session.role, "Doctor");

  // Patient searches for the verified doctor profile using filters
  const patSearch = await request(
    fullFlowPatient,
    "/v1/providers?specialty=Pediatrics&language=Telugu&mode=video",
  );
  assert.equal(patSearch.status, 200);
  const discoveredDoc = patSearch.data.providers.find(
    (p) => p.id === fullFlowDoc,
  );
  assert.ok(
    discoveredDoc,
    "Patient search must find the newly verified doctor profile",
  );

  const schedule = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
    (day) => ({ day, enabled: true, startTime: "00:00", endTime: "23:59" }),
  );
  assert.equal(
    (await request(fullFlowDoc, "/v1/availability", "POST", { schedule })).status,
    200,
    "Verified doctor publishes availability before accepting bookings",
  );

  // Patient sends a consultation request to the discovered verified doctor
  const bookRes = await request(
    fullFlowPatient,
    "/v1/actions?space=" + patInit.spaceId,
    "POST",
    {
      revision: patInit.revision,
      operationId: randomUUID(),
      action: {
        type: "book",
        visit: {
          providerId: discoveredDoc.id,
          date: futureVisitDate,
          time: "10:00 AM",
          service: "Online Consultation",
          frequency: "One visit",
          address: "",
          reason: "Child fever consultation",
        },
      },
    },
  );
  assert.equal(bookRes.status, 200, JSON.stringify(bookRes.data));
  assert.equal(bookRes.data.state.visits.length, 1);
  assert.equal(bookRes.data.state.visits[0].providerId, fullFlowDoc);
  assert.equal(bookRes.data.state.visits[0].status, "Requested");

  const requested = bookRes.data.state.visits[0];
  assert.equal(requested.providerKind, "Doctor");
  const assignedSpaces = await request(fullFlowDoc, "/v1/spaces");
  assert.ok(
    assignedSpaces.data.some(
      (s) => s.id === patInit.spaceId && s.role === "Doctor",
    ),
  );
  const doctorVisitPath = "/v1/state?space=" + patInit.spaceId;
  const doctorVisit = await request(fullFlowDoc, doctorVisitPath);
  assert.equal(doctorVisit.status, 200);
  assert.equal(doctorVisit.data.recordsAccess, false);
  assert.equal(doctorVisit.data.state.visits[0].id, requested.id);
  const bookPath = "/v1/actions?space=" + patInit.spaceId;
  const accepted = await request(fullFlowDoc, bookPath, "POST", {
    revision: doctorVisit.data.revision,
    operationId: randomUUID(),
    action: { type: "status", visitId: requested.id, status: "Confirmed" },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.state.visits[0].status, "Confirmed");

  const doctorAction = (revision, action) =>
    request(fullFlowDoc, bookPath, "POST", {
      revision,
      operationId: randomUUID(),
      action: { visitId: requested.id, ...action },
    });
  const started = await doctorAction(accepted.data.revision, {
    type: "status",
    status: "In Progress",
  });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  assert.deepEqual(started.data.state.savedConsultationVisitIds, []);
  const complete = { type: "status", status: "Completed" };
  const premature = await doctorAction(started.data.revision, complete);
  assert.equal(premature.status, 400);
  assert.match(premature.data.error, /Save consultation notes/);
  const consulted = await doctorAction(started.data.revision, {
    type: "consult",
    text: "Private consultation notes",
    prescription: "Private care plan",
    followUp: "",
  });
  assert.equal(consulted.status, 200, JSON.stringify(consulted.data));
  assert.deepEqual(consulted.data.state.consultations, []);
  assert.deepEqual(consulted.data.state.savedConsultationVisitIds, [
    requested.id,
  ]);
  const refreshed = await request(fullFlowDoc, doctorVisitPath);
  assert.deepEqual(refreshed.data.state.consultations, []);
  assert.deepEqual(refreshed.data.state.savedConsultationVisitIds, [
    requested.id,
  ]);
  const completed = await doctorAction(refreshed.data.revision, complete);
  assert.equal(completed.status, 200, JSON.stringify(completed.data));
  assert.equal(completed.data.state.visits[0].status, "Completed");

  await db
    .prepare(
      "UPDATE verification_applications SET valid_until='2000-01-01' WHERE id=?",
    )
    .bind(docSubmit.data.id)
    .run();
  assert.equal(
    (await request(fullFlowDoc, "/v1/state")).data.state.session.role,
    "Patient",
  );
  assert.equal(
    (await request(fullFlowDoc, "/v1/state?space=" + fullDocHomeSpace.id))
      .status,
    403,
  );
  assert.equal((await request(fullFlowDoc, doctorVisitPath)).status, 403);
  const expiredBook = await request(fullFlowPatient, bookPath, "POST", {
    revision: completed.data.revision,
    operationId: randomUUID(),
    action: { type: "book", visit: { ...requested, time: "11:30 AM" } },
  });
  assert.equal(expiredBook.status, 400);
  assert.equal(expiredBook.data.error, unapprovedBook.data.error);

  // Ownership change after join request must prevent approval by old org admin
  const bloomTransferSpace = "ws_transfer_" + randomUUID().slice(0, 8);
  await db.batch([
    db
      .prepare("INSERT INTO care_spaces (id, state) VALUES (?, ?)")
      .bind(bloomTransferSpace, privateCareState),
    db
      .prepare(
        "INSERT INTO workspace_organizations (space_id, organization_id, name) VALUES (?, 'org_bloom', 'Transfer Clinic')",
      )
      .bind(bloomTransferSpace),
  ]);
  const transferredReq = await request(
    bloomDoctor,
    "/v1/workspaces/join",
    "POST",
    { spaceId: bloomTransferSpace },
  );
  assert.equal(transferredReq.status, 200);
  await db
    .prepare(
      "UPDATE workspace_organizations SET organization_id='org_apollo' WHERE space_id=?",
    )
    .bind(bloomTransferSpace)
    .run();
  const staleOwnerReview = await request(
    bloomAdmin,
    "/v1/workspaces/admin/review",
    "POST",
    {
      requestId: transferredReq.data.request.id,
      decision: "Approved",
      attempt: 1,
    },
  );
  assert.equal(staleOwnerReview.status, 409);
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM workspace_join_requests WHERE id=?")
        .bind(transferredReq.data.request.id)
        .first()
    ).status,
    "Pending",
  );
  assert.equal(
    await db
      .prepare("SELECT 1 FROM memberships WHERE user_id=? AND space_id=?")
      .bind(bloomDoctor, bloomTransferSpace)
      .first(),
    null,
  );

  console.log(
    "Passed: organization workspace browsing, org-scoped isolation, join requests, zero access while pending/rejected, and admin review approval.",
  );
};
