const assert = require("node:assert/strict");
module.exports = async ({ db, request, raw, space }) => {
  const root = "/v1/verification";
  const pdf = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF";
  const upload = async (user) => {
    const result = await request(
      user,
      root + "/documents?consent=1&name=evidence.pdf",
      "POST",
      pdf,
      "application/pdf",
    );
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data.id;
  };
  assert.equal((await request("verify_patient", root + "/review")).status, 403);
  assert.equal(
    (
      await request(
        "verify_patient",
        root + "/documents",
        "POST",
        pdf,
        "application/pdf",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "verify_patient",
        root + "/documents?consent=1",
        "POST",
        "not a pdf",
        "application/pdf",
      )
    ).status,
    415,
  );
  const document = await upload("verify_patient"),
    otherDocument = await upload("verify_other");
  assert.equal(
    (await raw("verify_patient", root + "/documents/" + document)).status,
    200,
  );
  assert.equal(
    (await raw("verify_other", root + "/documents/" + document)).status,
    403,
  );
  const disposable = await upload("verify_patient");
  assert.equal(
    (
      await request("verify_other", root + "/documents/remove", "POST", {
        id: disposable,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("verify_patient", root + "/documents/remove", "POST", {
        id: disposable,
      })
    ).status,
    200,
  );
  assert.equal(
    (await raw("verify_patient", root + "/documents/" + disposable)).status,
    404,
  );
  const details = {
    fullName: "Manual Review Patient",
    country: "India",
    authority: "",
    registrationNumber: "",
    qualification: "",
    consent: true,
  };
  const submission = {
    kind: "Patient",
    revision: 0,
    details,
    documents: [document],
  };
  assert.equal(
    (
      await request("verify_patient", root + "/submit", "POST", {
        ...submission,
        documents: [otherDocument],
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("verify_patient", root + "/submit", "POST", {
        ...submission,
        details: { ...details, consent: false },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("verify_patient", root + "/submit", "POST", submission))
      .status,
    200,
  );
  let app = (await request("verify_patient", root)).data.applications[0];
  assert.equal(app.status, "Submitted");
  assert.equal(app.documents.length, 1);
  assert.equal(
    (await request("verify_other", root + "/" + app.id + "/history")).status,
    403,
  );
  assert.equal(
    (await request("verify_other", root)).data.applications.length,
    0,
  );
  await db
    .prepare("INSERT INTO verification_reviewers(user_id) VALUES (?)")
    .bind("verify_patient")
    .run();
  const decision = {
    id: app.id,
    revision: 1,
    status: "Approved",
    reason: "Identity evidence checked in person",
    identityReference: "review-session-001",
    registrationReference: "",
    validUntil: new Date(Date.now() + 365 * 86400000)
      .toISOString()
      .slice(0, 10),
  };
  assert.equal(
    (await request("verify_patient", root + "/review", "POST", decision))
      .status,
    403,
    "reviewers cannot approve themselves",
  );
  await db
    .prepare("INSERT INTO verification_reviewers(user_id) VALUES (?)")
    .bind("verify_staff")
    .run();
  assert.equal(
    (await raw("verify_staff", root + "/documents/" + document)).status,
    200,
  );
  assert.equal(
    (
      await request("verify_patient", root + "/documents/remove", "POST", {
        id: document,
      })
    ).status,
    403,
    "submitted documents are preserved for audit",
  );
  assert.equal(
    (await request("verify_staff", root + "/review")).data.applications.length,
    1,
  );
  assert.equal(
    (
      await request("verify_staff", root + "/review", "POST", {
        ...decision,
        identityReference: "",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("verify_staff", root + "/review", "POST", {
        ...decision,
        status: "Needs information",
        reason: "Please provide legible identity evidence",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("verify_patient", root + "/submit", "POST", submission))
      .status,
    409,
  );
  const corrected = await upload("verify_patient");
  const concurrent = await Promise.all(
    [document, corrected].map((id) =>
      request("verify_patient", root + "/submit", "POST", {
        ...submission,
        revision: 2,
        documents: [id],
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  const links = await db
    .prepare(
      "SELECT * FROM verification_submission_documents WHERE application_id=? AND submission_revision=3",
    )
    .bind(app.id)
    .all();
  assert.equal(
    links.results.length,
    1,
    "losing CAS must not attach documents to the winning submission",
  );
  assert.equal(
    (
      await request("verify_staff", root + "/review", "POST", {
        ...decision,
        revision: 3,
      })
    ).status,
    200,
  );
  app = (await request("verify_patient", root)).data.applications[0];
  assert.equal(app.status, "Approved");
  assert.equal(app.revision, 4);
  assert.equal(
    (await request("verify_patient", root + "/" + app.id + "/history")).data
      .length,
    4,
  );
  assert.equal(
    (
      await request("verify_staff", root + "/review", "POST", {
        ...decision,
        revision: 3,
        status: "Suspended",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("verify_staff", root + "/review", "POST", {
        ...decision,
        revision: 4,
        status: "Suspended",
        reason: "Identity needs further investigation",
      })
    ).status,
    200,
  );
  const professionalDoc = await upload("verify_professional");
  const professional = {
    kind: "Doctor",
    revision: 0,
    details: {
      ...details,
      fullName: "Professional Applicant",
      authority: "State Medical Council",
      registrationNumber: "TEST-ONLY-123",
      qualification: "MBBS",
    },
    documents: [professionalDoc],
  };
  assert.equal(
    (
      await request(
        "verify_professional",
        root + "/submit",
        "POST",
        professional,
      )
    ).status,
    200,
  );
  const doctor = (await request("verify_professional", root)).data
    .applications[0];
  await db
    .prepare(
      "INSERT INTO memberships(user_id,space_id,role,provider_id) VALUES (?,?,'Doctor','1')",
    )
    .bind("verify_professional", space)
    .run();
  assert.equal(
    (await request("verify_professional", "/v1/state?space=" + space)).status,
    403,
    "pending professionals cannot use an assigned clinical role",
  );
  await db
    .prepare("DELETE FROM memberships WHERE user_id=? AND space_id=?")
    .bind("verify_professional", space)
    .run();
  assert.equal(
    (
      await request("verify_staff", root + "/review", "POST", {
        ...decision,
        id: doctor.id,
        revision: 1,
        registrationReference: "",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("verify_staff", root + "/review", "POST", {
        ...decision,
        id: doctor.id,
        revision: 1,
        registrationReference: "council-manual-check-001",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM memberships WHERE user_id=? AND role IN ('Doctor','Nurse')",
        )
        .bind("verify_professional")
        .first()
    ).count,
    0,
    "approval alone must not grant patient access",
  );
  await db
    .prepare(
      "INSERT INTO memberships(user_id,space_id,role,provider_id) VALUES (?,?,'Doctor','1')",
    )
    .bind("verify_professional", space)
    .run();
  await db
    .prepare(
      "UPDATE verification_applications SET valid_until='2000-01-01' WHERE id=?",
    )
    .bind(doctor.id)
    .run();
  const expired = await request(
    "verify_professional",
    "/v1/state?space=" + space,
  );
  assert.equal(expired.status, 403);
  assert.match(expired.data.error, /verification/);
  await db
    .prepare("UPDATE verification_reviewers SET active=0 WHERE user_id=?")
    .bind("verify_staff")
    .run();
  assert.equal((await request("verify_staff", root + "/review")).status, 403);
  assert.equal(
    (await raw("verify_staff", root + "/documents/" + document)).status,
    403,
  );
  console.log(
    "Passed: manual verification evidence validation, ownership, reviewer isolation, no self-approval, correction/resubmission, atomic competing submissions, approval evidence, expiry validation, suspension and no automatic clinical role grants.",
  );
};
