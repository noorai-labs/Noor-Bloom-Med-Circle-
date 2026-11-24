const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

module.exports = async ({ db, request, mf }) => {
  const patientUser = "provider_test_patient";
  const futureDate = new Date(Date.now() + 365 * 86400000)
    .toISOString()
    .slice(0, 10);
  const pastDate = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .slice(0, 10);

  // 1. Unauthenticated request must return 401
  const unauthed = await mf.dispatchFetch("http://test/v1/providers");
  assert.equal(
    unauthed.status,
    401,
    "Unauthenticated requests to /v1/providers must be rejected with 401",
  );

  // 2. Measure baseline state before adding new test providers
  const baseline = (await request(patientUser, "/v1/providers")).data;
  const baselineCount = baseline.providers.length;
  const baselineDocs = (
    await request(patientUser, "/v1/providers?kind=Doctor")
  ).data.providers.length;
  const baselineNurses = (
    await request(patientUser, "/v1/providers?kind=Nurse")
  ).data.providers.length;

  // Empty filter check: Non-matching search must return 0 results and never fake profiles
  const emptyFilter = await request(
    patientUser,
    "/v1/providers?specialty=NonExistentSpecialtyNeverFoundXYZ",
  );
  assert.equal(emptyFilter.status, 200);
  assert.equal(emptyFilter.data.providers.length, 0);
  assert.equal(emptyFilter.data.pagination.total, 0);
  assert.equal(emptyFilter.data.pagination.hasMore, false);

  // 3. Populate various provider applications to test approval & safety gates
  const docApprovedId = "doc_approved_" + randomUUID();
  const nurseApprovedId = "nurse_approved_" + randomUUID();
  const docSubmittedId = "doc_submitted_" + randomUUID();
  const docRejectedId = "doc_rejected_" + randomUUID();
  const docSuspendedId = "doc_suspended_" + randomUUID();
  const docExpiredId = "doc_expired_" + randomUUID();
  const patientApprovedId = "patient_approved_" + randomUUID();

  // Approved Doctor with distinct specialty, languages, and modes
  await db
    .prepare(
      "INSERT INTO verification_applications(id,user_id,kind,status,details,reason,valid_until) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      randomUUID(),
      docApprovedId,
      "Doctor",
      "Approved",
      JSON.stringify({
        fullName: "Dr. Aisha Khan",
        qualification: "MBBS, MD - General Medicine",
        specialty: "General Medicine",
        registrationNumber: "KMC-48291",
        authority: "Karnataka Medical Council",
        country: "India",
        consent: true,
        languages: ["English", "Hindi"],
        modes: ["video", "in-person"],
      }),
      "Approved by medical board reviewer",
      futureDate,
    )
    .run();

  // Approved Nurse with distinct specialty, languages, and modes
  await db
    .prepare(
      "INSERT INTO verification_applications(id,user_id,kind,status,details,reason,valid_until) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      randomUUID(),
      nurseApprovedId,
      "Nurse",
      "Approved",
      JSON.stringify({
        fullName: "Sarah Thomas",
        qualification: "B.Sc Nursing",
        specialty: "Critical Care Nursing",
        registrationNumber: "KNC-10293",
        authority: "Karnataka Nursing Council",
        country: "India",
        consent: true,
        languages: ["English", "Malayalam"],
        modes: ["in-person"],
      }),
      "Approved by board",
      futureDate,
    )
    .run();

  // Submitted Doctor (Not yet approved - must NOT appear)
  await db
    .prepare(
      "INSERT INTO verification_applications(id,user_id,kind,status,details,reason,valid_until) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      randomUUID(),
      docSubmittedId,
      "Doctor",
      "Submitted",
      JSON.stringify({
        fullName: "Dr. Pending Doctor",
        qualification: "MBBS",
        specialty: "Internal Medicine",
      }),
      "",
      "",
    )
    .run();

  // Rejected Doctor (Must NOT appear)
  await db
    .prepare(
      "INSERT INTO verification_applications(id,user_id,kind,status,details,reason,valid_until) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      randomUUID(),
      docRejectedId,
      "Doctor",
      "Rejected",
      JSON.stringify({
        fullName: "Dr. Rejected Doctor",
        qualification: "MBBS",
      }),
      "Invalid council credentials",
      "",
    )
    .run();

  // Suspended Doctor (Must NOT appear)
  await db
    .prepare(
      "INSERT INTO verification_applications(id,user_id,kind,status,details,reason,valid_until) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      randomUUID(),
      docSuspendedId,
      "Doctor",
      "Suspended",
      JSON.stringify({
        fullName: "Dr. Suspended Doctor",
        qualification: "MBBS",
      }),
      "License suspended",
      futureDate,
    )
    .run();

  // Expired Doctor (Must NOT appear)
  await db
    .prepare(
      "INSERT INTO verification_applications(id,user_id,kind,status,details,reason,valid_until) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      randomUUID(),
      docExpiredId,
      "Doctor",
      "Approved",
      JSON.stringify({
        fullName: "Dr. Expired Doctor",
        qualification: "MBBS",
      }),
      "Expired registration",
      pastDate,
    )
    .run();

  // Approved Patient (Kind is Patient, must NEVER appear in provider discovery)
  await db
    .prepare(
      "INSERT INTO verification_applications(id,user_id,kind,status,details,reason,valid_until) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      randomUUID(),
      patientApprovedId,
      "Patient",
      "Approved",
      JSON.stringify({
        fullName: "Approved Patient",
      }),
      "Patient identity verified",
      futureDate,
    )
    .run();

  // 4. Query all providers: exactly baselineCount + 2 approved providers appear
  const listAll = await request(patientUser, "/v1/providers");
  assert.equal(listAll.status, 200);
  assert.equal(
    listAll.data.providers.length,
    baselineCount + 2,
    "Only approved, unexpired Doctor and Nurse must appear in directory",
  );
  assert.equal(listAll.data.pagination.total, baselineCount + 2);

  const returnedIds = listAll.data.providers.map((p) => p.id);
  assert.ok(returnedIds.includes(docApprovedId));
  assert.ok(returnedIds.includes(nurseApprovedId));
  assert.ok(!returnedIds.includes(docSubmittedId), "Submitted doctor must not appear");
  assert.ok(!returnedIds.includes(docRejectedId), "Rejected doctor must not appear");
  assert.ok(!returnedIds.includes(docSuspendedId), "Suspended doctor must not appear");
  assert.ok(!returnedIds.includes(docExpiredId), "Expired doctor must not appear");
  assert.ok(!returnedIds.includes(patientApprovedId), "Patient must not appear in provider directory");

  // 5. Data privacy & field projection: Zero internal/sensitive data leakage
  const doctor = listAll.data.providers.find((p) => p.id === docApprovedId);
  assert.equal(doctor.name, "Dr. Aisha Khan");
  assert.equal(doctor.kind, "Doctor");
  assert.equal(doctor.qualification, "MBBS, MD - General Medicine");
  assert.equal(doctor.registrationNumber, "KMC-48291");
  assert.equal(doctor.authority, "Karnataka Medical Council");
  assert.equal(doctor.specialty, "General Medicine");
  assert.deepEqual(doctor.languages, ["English", "Hindi"]);
  assert.deepEqual(doctor.modes, ["video", "in-person"]);
  assert.equal(doctor.verified, true);

  // Ensure internal reviewer fields, document IDs, or reasons are never leaked
  assert.equal(doctor.reason, undefined);
  assert.equal(doctor.validUntil, undefined);
  assert.equal(doctor.valid_until, undefined);
  assert.equal(doctor.documents, undefined);
  assert.equal(doctor.consent, undefined);

  // 6. Filter by kind
  const docsOnly = await request(patientUser, "/v1/providers?kind=Doctor");
  assert.equal(docsOnly.status, 200);
  assert.equal(docsOnly.data.providers.length, baselineDocs + 1);
  assert.ok(docsOnly.data.providers.some((p) => p.id === docApprovedId));

  const nursesOnly = await request(patientUser, "/v1/providers?kind=Nurse");
  assert.equal(nursesOnly.status, 200);
  assert.equal(nursesOnly.data.providers.length, baselineNurses + 1);
  assert.ok(nursesOnly.data.providers.some((p) => p.id === nurseApprovedId));

  const invalidKind = await request(patientUser, "/v1/providers?kind=Patient");
  assert.equal(invalidKind.status, 400);
  assert.equal(
    invalidKind.data.error,
    "Choose a valid provider kind (Doctor or Nurse).",
  );

  // 7. Filter by specialty
  const medicineFilter = await request(
    patientUser,
    "/v1/providers?specialty=Medicine",
  );
  assert.equal(medicineFilter.status, 200);
  assert.ok(medicineFilter.data.providers.some((p) => p.id === docApprovedId));
  assert.ok(!medicineFilter.data.providers.some((p) => p.id === nurseApprovedId));

  const nursingFilter = await request(
    patientUser,
    "/v1/providers?specialty=critical",
  );
  assert.equal(nursingFilter.status, 200);
  assert.equal(nursingFilter.data.providers.length, 1);
  assert.equal(nursingFilter.data.providers[0].id, nurseApprovedId);

  const noMatchSpecialty = await request(
    patientUser,
    "/v1/providers?specialty=DermatologyNonExistent",
  );
  assert.equal(noMatchSpecialty.status, 200);
  assert.equal(noMatchSpecialty.data.providers.length, 0);

  // 8. Filter by language
  const hindiFilter = await request(patientUser, "/v1/providers?language=hindi");
  assert.equal(hindiFilter.status, 200);
  assert.ok(hindiFilter.data.providers.some((p) => p.id === docApprovedId));
  assert.ok(!hindiFilter.data.providers.some((p) => p.id === nurseApprovedId));

  const malayalamFilter = await request(
    patientUser,
    "/v1/providers?language=Malayalam",
  );
  assert.equal(malayalamFilter.status, 200);
  assert.equal(malayalamFilter.data.providers.length, 1);
  assert.equal(malayalamFilter.data.providers[0].id, nurseApprovedId);

  const noMatchLang = await request(
    patientUser,
    "/v1/providers?language=German",
  );
  assert.equal(noMatchLang.status, 200);
  assert.equal(noMatchLang.data.providers.length, 0);

  // 9. Filter by mode
  const videoFilter = await request(patientUser, "/v1/providers?mode=video");
  assert.equal(videoFilter.status, 200);
  assert.ok(videoFilter.data.providers.some((p) => p.id === docApprovedId));
  assert.ok(!videoFilter.data.providers.some((p) => p.id === nurseApprovedId));

  const inPersonFilter = await request(
    patientUser,
    "/v1/providers?mode=in-person",
  );
  assert.equal(inPersonFilter.status, 200);
  assert.ok(inPersonFilter.data.providers.some((p) => p.id === docApprovedId));
  assert.ok(inPersonFilter.data.providers.some((p) => p.id === nurseApprovedId));

  const invalidMode = await request(
    patientUser,
    "/v1/providers?mode=telepathy",
  );
  assert.equal(invalidMode.status, 400);
  assert.equal(
    invalidMode.data.error,
    "Choose a valid consultation mode (in-person, video, or all).",
  );

  // 10. Pagination checks (limits, offsets, bounds)
  const totalCount = baselineCount + 2;
  const page1 = await request(patientUser, "/v1/providers?limit=1&offset=0");
  assert.equal(page1.status, 200);
  assert.equal(page1.data.providers.length, 1);
  assert.equal(page1.data.pagination.total, totalCount);
  assert.equal(page1.data.pagination.hasMore, totalCount > 1);

  const page2 = await request(patientUser, "/v1/providers?limit=1&offset=1");
  assert.equal(page2.status, 200);
  assert.equal(page2.data.providers.length, 1);
  assert.notEqual(page1.data.providers[0].id, page2.data.providers[0].id);

  const invalidLimitNeg = await request(patientUser, "/v1/providers?limit=-5");
  assert.equal(invalidLimitNeg.status, 400);

  const invalidLimitExcess = await request(
    patientUser,
    "/v1/providers?limit=100",
  );
  assert.equal(invalidLimitExcess.status, 400);

  const invalidOffsetNeg = await request(patientUser, "/v1/providers?offset=-1");
  assert.equal(invalidOffsetNeg.status, 400);

  // 11. Method Not Allowed check
  const postDisallowed = await request(patientUser, "/v1/providers", "POST", {
    something: "invalid",
  });
  assert.equal(postDisallowed.status, 405);
  assert.equal(postDisallowed.data.error, "Method not allowed.");

  // 12. Full end-to-end path through real submission, approval, and discovery
  const e2eApplicant = "e2e_doctor_applicant_" + randomUUID().slice(0, 8);
  const pdfContent = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF";
  const uploadRes = await request(
    e2eApplicant,
    "/v1/verification/documents?consent=1&name=qualification.pdf",
    "POST",
    pdfContent,
    "application/pdf",
  );
  assert.equal(uploadRes.status, 200, JSON.stringify(uploadRes.data));
  const docEvidenceId = uploadRes.data.id;

  // Submit doctor verification with specialty, languages (including whitespace and empty items), and modes
  const submissionRes = await request(
    e2eApplicant,
    "/v1/verification/submit",
    "POST",
    {
      kind: "Doctor",
      revision: 0,
      details: {
        fullName: "Dr. FullPath Specialist",
        country: "India",
        authority: "Karnataka Medical Council",
        registrationNumber: "KMC-E2E-7788",
        qualification: "MBBS, DM - Cardiology",
        consent: true,
        specialty: "  Cardiology  ",
        languages: ["  Kannada  ", "English", "  ", ""],
        modes: ["video", "invalid_mode"],
      },
      documents: [docEvidenceId],
    },
  );
  assert.equal(submissionRes.status, 200, JSON.stringify(submissionRes.data));
  const submissionId = submissionRes.data.id;

  // Reviewer approves the application via the real review endpoint
  const reviewerUser = "provider_e2e_reviewer";
  await db
    .prepare(
      "INSERT OR REPLACE INTO verification_reviewers(user_id,active) VALUES (?,1)",
    )
    .bind(reviewerUser)
    .run();

  const reviewRes = await request(
    reviewerUser,
    "/v1/verification/review",
    "POST",
    {
      id: submissionId,
      revision: 1,
      status: "Approved",
      reason: "Verified credentials against national medical registry",
      identityReference: "AADHAAR-VERIFIED-E2E",
      registrationReference: "KMC-REG-CHECKED-OK",
      validUntil: futureDate,
    },
  );
  assert.equal(reviewRes.status, 200, JSON.stringify(reviewRes.data));

  // Now verify that the real submitted & approved clinician is discoverable via GET /v1/providers
  // Specialty filter
  const e2eSpecialty = await request(
    patientUser,
    "/v1/providers?specialty=cardiology",
  );
  assert.equal(e2eSpecialty.status, 200);
  const foundBySpecialty = e2eSpecialty.data.providers.find(
    (p) => p.id === e2eApplicant,
  );
  assert.ok(foundBySpecialty, "Provider submitted with specialty must be discoverable");
  assert.equal(foundBySpecialty.specialty, "Cardiology");
  assert.deepEqual(foundBySpecialty.languages, ["Kannada", "English"]);
  assert.deepEqual(foundBySpecialty.modes, ["video"]);

  // Language filter
  const e2eLanguage = await request(
    patientUser,
    "/v1/providers?language=kannada",
  );
  assert.equal(e2eLanguage.status, 200);
  assert.ok(
    e2eLanguage.data.providers.some((p) => p.id === e2eApplicant),
    "Provider submitted with Kannada language must be discoverable",
  );

  // Mode filter (video consultation mode)
  const e2eMode = await request(patientUser, "/v1/providers?mode=video");
  assert.equal(e2eMode.status, 200);
  assert.ok(
    e2eMode.data.providers.some((p) => p.id === e2eApplicant),
    "Provider submitted with video mode must be discoverable",
  );

  // Negative filter check: In-person filter should NOT match this video-only provider
  const e2eInPerson = await request(
    patientUser,
    "/v1/providers?mode=in-person",
  );
  assert.equal(e2eInPerson.status, 200);
  assert.ok(
    !e2eInPerson.data.providers.some((p) => p.id === e2eApplicant),
    "Provider offering only video mode must not appear in in-person filter",
  );

  // Negative filter check: Non-matching specialty
  const e2eNoMatch = await request(
    patientUser,
    "/v1/providers?specialty=Dermatology",
  );
  assert.equal(e2eNoMatch.status, 200);
  assert.ok(!e2eNoMatch.data.providers.some((p) => p.id === e2eApplicant));

  // 13. Day 2: Organization search, selection on submission, Needs info flow, and post-approval Doctor Home access
  // Organization search
  const orgsList = await request(patientUser, "/v1/organizations");
  assert.equal(orgsList.status, 200);
  assert.ok(orgsList.data.organizations.length >= 4);
  assert.ok(
    orgsList.data.organizations.some((o) => o.id === "org_bloom"),
    "Seeded organizations must be listed",
  );

  const searchBloom = await request(patientUser, "/v1/organizations?search=bloom");
  assert.equal(searchBloom.status, 200);
  assert.equal(searchBloom.data.organizations.length, 1);
  assert.equal(searchBloom.data.organizations[0].id, "org_bloom");

  // First-time doctor onboarding with organization selection
  const orgDoctor = "doc_onboarding_" + randomUUID().slice(0, 8);
  const orgDocEvidence = (
    await request(
      orgDoctor,
      "/v1/verification/documents?consent=1&name=doc.pdf",
      "POST",
      pdfContent,
      "application/pdf",
    )
  ).data.id;

  const orgDocSubmit = await request(orgDoctor, "/v1/verification/submit", "POST", {
    kind: "Doctor",
    revision: 0,
    details: {
      fullName: "Dr. Onboarding Clinician",
      country: "India",
      authority: "State Medical Council",
      registrationNumber: "SMC-DAY2-001",
      qualification: "MBBS",
      consent: true,
      organizationId: "org_bloom",
      organizationName: "MedBloom Health Network",
      specialty: "General Medicine",
      languages: ["English"],
      modes: ["in-person"],
    },
    documents: [orgDocEvidence],
  });
  assert.equal(orgDocSubmit.status, 200);
  const orgAppId = orgDocSubmit.data.id;

  // Verify review status tracking
  let docStatus = (await request(orgDoctor, "/v1/verification")).data;
  assert.equal(docStatus.applications[0].status, "Submitted");
  assert.equal(docStatus.applications[0].details.organizationId, "org_bloom");
  assert.equal(
    docStatus.applications[0].details.organizationName,
    "MedBloom Health Network",
  );

  // Reviewer requests more info
  await request(reviewerUser, "/v1/verification/review", "POST", {
    id: orgAppId,
    revision: 1,
    status: "Needs information",
    reason: "Please attach certified registration document",
  });

  docStatus = (await request(orgDoctor, "/v1/verification")).data;
  assert.equal(docStatus.applications[0].status, "Needs information");
  assert.equal(
    docStatus.applications[0].reason,
    "Please attach certified registration document",
  );

  // Doctor responds to Needs Information by re-submitting with new evidence
  const renewedDoc = (
    await request(
      orgDoctor,
      "/v1/verification/documents?consent=1&name=renewed.pdf",
      "POST",
      pdfContent,
      "application/pdf",
    )
  ).data.id;

  const resubmitted = await request(orgDoctor, "/v1/verification/submit", "POST", {
    kind: "Doctor",
    revision: docStatus.applications[0].revision,
    details: {
      ...docStatus.applications[0].details,
      qualification: "MBBS, MD",
    },
    documents: [renewedDoc],
  });
  assert.equal(resubmitted.status, 200);

  // Reviewer approves the application
  await request(reviewerUser, "/v1/verification/review", "POST", {
    id: orgAppId,
    revision: resubmitted.data.revision,
    status: "Approved",
    reason: "Valid registration confirmed",
    identityReference: "AADHAAR-OK",
    registrationReference: "REG-OK",
    validUntil: futureDate,
  });

  // Verify post-approval Doctor Home access without assigned visit or workspace
  const docSpaces = await request(orgDoctor, "/v1/spaces");
  assert.equal(docSpaces.status, 200);
  const docPersonalSpace = docSpaces.data.find((s) => s.role === "Doctor");
  assert.ok(
    docPersonalSpace,
    "Approved doctor must have an unlocked Doctor Dashboard workspace",
  );
  assert.equal(docPersonalSpace.name, "Doctor Dashboard");

  // Accessing Doctor Dashboard state succeeds without assigned visit requirement
  const docHomeState = await request(
    orgDoctor,
    "/v1/state?space=" + docPersonalSpace.id,
  );
  assert.equal(
    docHomeState.status,
    200,
    "Approved doctor must be able to open Doctor Home without an assigned visit",
  );
  assert.equal(docHomeState.data.state.session.role, "Doctor");
  assert.equal(docHomeState.data.state.session.providerId, orgDoctor);

  console.log(
    "Passed: provider directory discovery, approved/unapproved/expired gates, zero data leakage, filters, pagination and input validation.",
  );
};
