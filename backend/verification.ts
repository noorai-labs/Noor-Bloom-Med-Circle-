import type {
  VerificationApplication,
  VerificationDetails,
  VerificationKind,
} from "../src/verification-types";
import { verificationDay } from "../src/verification-types";
type Env = { DB: D1Database; FILES: R2Bucket };
type Row = {
  id: string;
  user_id: string;
  kind: VerificationKind;
  status: VerificationApplication["status"];
  revision: number;
  details: string;
  reason: string;
  valid_until: string;
  submitted_at: string;
  updated_at: string;
};
export class VerificationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new VerificationError(status, message);
};
const kinds = ["Patient", "Doctor", "Nurse"];
const clean = (value: unknown, max = 300) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
async function json(request: Request) {
  const raw = await request.text();
  if (raw.length > 20000) fail(413, "Request too large.");
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    return fail(400, "Invalid JSON.");
  }
}
async function reviewer(env: Env, user: string) {
  return !!(await env.DB.prepare(
    "SELECT 1 FROM verification_reviewers WHERE user_id=? AND active=1",
  )
    .bind(user)
    .first());
}
async function read(env: Env, row: Row): Promise<VerificationApplication> {
  const documents = (
    await env.DB.prepare(
      "SELECT DISTINCT d.id,d.name,d.mime FROM verification_documents d JOIN verification_submission_documents l ON l.document_id=d.id WHERE l.application_id=? AND d.ready=1 AND l.submission_revision=(SELECT MAX(submission_revision) FROM verification_submission_documents WHERE application_id=?)",
    )
      .bind(row.id, row.id)
      .all<{ id: string; name: string; mime: string }>()
  ).results;
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    status: row.status,
    revision: row.revision,
    details: JSON.parse(row.details),
    reason: row.reason,
    validUntil: row.valid_until,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    documents,
  };
}
export async function verificationRoute(
  request: Request,
  env: Env,
  user: string,
): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/v1/verification" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT * FROM verification_applications WHERE user_id=? ORDER BY kind",
    )
      .bind(user)
      .all<Row>();
    return Response.json({
      applications: await Promise.all(rows.results.map((r) => read(env, r))),
      reviewer: await reviewer(env, user),
    });
  }
  if (path === "/v1/verification/documents" && request.method === "POST") {
    if (url.searchParams.get("consent") !== "1")
      fail(400, "Consent is required before uploading verification evidence.");
    const mime = request.headers.get("Content-Type")?.split(";")[0] || "";
    if (!["application/pdf", "image/jpeg", "image/png"].includes(mime))
      fail(415, "Choose a PDF, JPEG or PNG.");
    if (Number(request.headers.get("Content-Length")) > 5 * 1024 * 1024)
      fail(413, "Maximum document size is 5 MB.");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM verification_documents WHERE user_id=? AND created_at>datetime('now','-1 day')",
    )
      .bind(user)
      .first<{ count: number }>();
    if ((count?.count || 0) >= 20)
      fail(429, "Daily document upload limit reached.");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > 5 * 1024 * 1024)
      fail(413, "Choose a document up to 5 MB.");
    const signature =
      mime === "application/pdf"
        ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
        : mime === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71;
    if (!signature)
      fail(415, "The document content does not match its file type.");
    const id = crypto.randomUUID(),
      name =
        clean(url.searchParams.get("name"), 160) || "Verification document";
    await env.DB.prepare(
      "INSERT INTO verification_documents(id,user_id,name,mime,size) VALUES (?,?,?,?,?)",
    )
      .bind(id, user, name, mime, bytes.length)
      .run();
    try {
      await env.FILES.put("verification/" + id, bytes, {
        httpMetadata: { contentType: mime },
      });
      await env.DB.prepare(
        "UPDATE verification_documents SET ready=1 WHERE id=?",
      )
        .bind(id)
        .run();
    } catch (e) {
      await env.FILES.delete("verification/" + id);
      await env.DB.prepare("DELETE FROM verification_documents WHERE id=?")
        .bind(id)
        .run();
      throw e;
    }
    return Response.json({ id, name, mime });
  }
  if (
    path === "/v1/verification/documents/remove" &&
    request.method === "POST"
  ) {
    const input = await json(request),
      id = clean(input.id);
    const removed = await env.DB.prepare(
      "UPDATE verification_documents SET ready=0 WHERE id=? AND user_id=? AND NOT EXISTS (SELECT 1 FROM verification_submission_documents WHERE document_id=verification_documents.id)",
    )
      .bind(id, user)
      .run();
    if (!removed.meta.changes)
      fail(
        403,
        "Only your unused evidence can be removed. Submitted evidence is retained for review history.",
      );
    await env.FILES.delete("verification/" + id);
    await env.DB.prepare(
      "DELETE FROM verification_documents WHERE id=? AND ready=0",
    )
      .bind(id)
      .run();
    return Response.json({ ok: true });
  }
  const docMatch = path.match(
    /^\/v1\/verification\/documents\/([a-f0-9-]{36})$/,
  );
  if (docMatch && request.method === "GET") {
    const doc = await env.DB.prepare(
      "SELECT * FROM verification_documents WHERE id=? AND ready=1",
    )
      .bind(docMatch[1])
      .first<{ id: string; user_id: string; mime: string }>();
    if (!doc) fail(404, "Document not found.");
    const linked = await env.DB.prepare(
      "SELECT 1 FROM verification_submission_documents WHERE document_id=?",
    )
      .bind(doc!.id)
      .first();
    if (doc!.user_id !== user && !(linked && (await reviewer(env, user))))
      fail(403, "Document access is restricted.");
    const object = await env.FILES.get("verification/" + doc!.id);
    if (!object) fail(404, "Document not found.");
    await env.DB.prepare(
      "INSERT INTO security_audit(actor_id,action,target_id) VALUES (?,'verification.document.read',?)",
    )
      .bind(user, doc!.id)
      .run();
    return new Response(object!.body, {
      headers: {
        "Content-Type": doc!.mime,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "attachment",
      },
    });
  }
  if (path === "/v1/verification/submit" && request.method === "POST") {
    const input = await json(request),
      kind = input.kind as VerificationKind;
    if (!kinds.includes(kind) || !Number.isInteger(input.revision))
      fail(400, "Choose a valid application type and revision.");
    const d = input.details as Partial<VerificationDetails> | undefined;
    const details: VerificationDetails = {
      fullName: clean(d?.fullName, 120),
      country: "India",
      authority: clean(d?.authority),
      registrationNumber: clean(d?.registrationNumber, 100),
      qualification: clean(d?.qualification),
      consent: d?.consent === true,
    };
    if (
      details.fullName.length < 2 ||
      d?.country !== "India" ||
      !details.consent
    )
      fail(400, "Enter your full name and consent to manual verification.");
    if (
      kind !== "Patient" &&
      (!details.authority ||
        !details.registrationNumber ||
        !details.qualification)
    )
      fail(400, "Add your council, registration number and qualification.");
    const ids = input.documents;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 4 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== "string")
    )
      fail(400, "Attach 1 to 4 evidence documents.");
    for (const id of ids as string[]) {
      const own = await env.DB.prepare(
        "SELECT 1 FROM verification_documents WHERE id=? AND user_id=? AND ready=1 AND created_at>datetime('now','-7 days')",
      )
        .bind(id, user)
        .first();
      if (!own) fail(403, "Choose your own uploaded documents.");
    }
    const old = await env.DB.prepare(
      "SELECT * FROM verification_applications WHERE user_id=? AND kind=?",
    )
      .bind(user, kind)
      .first<Row>();
    if (old && !["Needs information", "Rejected"].includes(old.status))
      fail(409, "This application cannot be edited in its current state.");
    if (Number(input.revision) !== (old?.revision || 0))
      fail(409, "Application changed. Refresh and try again.");
    const id = old?.id || crypto.randomUUID(),
      revision = Number(input.revision) + 1,
      payload = JSON.stringify(details);
    const first = old
      ? env.DB.prepare(
          "UPDATE verification_applications SET status='Submitted',revision=revision+1,details=?,reason='',valid_until='',submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status IN ('Needs information','Rejected')",
        ).bind(payload, id, input.revision)
      : env.DB.prepare(
          "INSERT OR IGNORE INTO verification_applications(id,user_id,kind,status,details) VALUES (?,?,?,'Submitted',?)",
        ).bind(id, user, kind, payload);
    // The unique audit revision aborts competing submissions before evidence can be attached.
    const statements = [
      first,
      env.DB.prepare(
        "INSERT INTO verification_events(application_id,revision,actor_id,action,reason,details) VALUES (?,?,?,'Submitted','Application submitted',?)",
      ).bind(id, revision, user, payload),
    ];
    for (const docId of ids as string[])
      statements.push(
        env.DB.prepare(
          "INSERT INTO verification_submission_documents(application_id,submission_revision,document_id) SELECT ?,?,CASE WHEN EXISTS (SELECT 1 FROM verification_documents WHERE id=? AND user_id=? AND ready=1 AND created_at>datetime('now','-7 days')) THEN ? ELSE NULL END",
        ).bind(id, revision, docId, user, docId),
      );
    const saved = await env.DB.batch(statements).catch((error) => {
      if (/constraint failed/i.test(String(error)))
        fail(409, "Application changed. Refresh and try again.");
      throw error;
    });
    if (!saved[0].meta.changes)
      fail(409, "Application changed. Refresh and try again.");
    return Response.json({ ok: true, id, revision });
  }
  if (path === "/v1/verification/review" && request.method === "GET") {
    if (!(await reviewer(env, user))) fail(403, "Reviewer access is required.");
    const status = url.searchParams.get("status") || "Submitted";
    if (
      ![
        "Submitted",
        "Needs information",
        "Approved",
        "Rejected",
        "Suspended",
      ].includes(status)
    )
      fail(400, "Invalid review filter.");
    const rows = await env.DB.prepare(
      "SELECT * FROM verification_applications WHERE status=? ORDER BY updated_at,id LIMIT 50",
    )
      .bind(status)
      .all<Row>();
    return Response.json({
      applications: await Promise.all(rows.results.map((r) => read(env, r))),
    });
  }
  const historyMatch = path.match(/^\/v1\/verification\/([^/]+)\/history$/);
  if (historyMatch && request.method === "GET") {
    const app = await env.DB.prepare(
      "SELECT * FROM verification_applications WHERE id=?",
    )
      .bind(historyMatch[1])
      .first<Row>();
    if (!app) fail(404, "Application not found.");
    if (app!.user_id !== user && !(await reviewer(env, user)))
      fail(403, "Application access is restricted.");
    const rows = await env.DB.prepare(
      "SELECT revision,action,reason,created_at FROM verification_events WHERE application_id=? ORDER BY revision DESC",
    )
      .bind(app!.id)
      .all();
    return Response.json(rows.results);
  }
  if (path === "/v1/verification/review" && request.method === "POST") {
    if (!(await reviewer(env, user))) fail(403, "Reviewer access is required.");
    const input = await json(request),
      id = clean(input.id),
      status = clean(input.status),
      reason = clean(input.reason, 1500),
      identity = clean(input.identityReference, 500),
      registration = clean(input.registrationReference, 500),
      validUntil = clean(input.validUntil, 10);
    const app = await env.DB.prepare(
      "SELECT * FROM verification_applications WHERE id=?",
    )
      .bind(id)
      .first<Row>();
    if (!app) fail(404, "Application not found.");
    if (app!.user_id === user)
      fail(403, "You cannot review your own application.");
    if (!Number.isInteger(input.revision) || input.revision !== app!.revision)
      fail(409, "Application changed. Refresh before reviewing.");
    const allowed =
      app!.status === "Submitted"
        ? ["Approved", "Rejected", "Needs information"]
        : app!.status === "Approved"
          ? ["Suspended", "Needs information"]
          : app!.status === "Suspended"
            ? ["Needs information"]
            : [];
    if (!allowed.includes(status) || reason.length < 10)
      fail(
        400,
        "Choose a valid decision and provide a review reason of at least 10 characters.",
      );
    if (status === "Approved") {
      if (
        identity.length < 5 ||
        (app!.kind !== "Patient" && registration.length < 5)
      )
        fail(
          400,
          "Record completed identity and professional register checks before approval.",
        );
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(validUntil) ||
        !Number.isFinite(Date.parse(validUntil)) ||
        new Date(validUntil).toISOString().slice(0, 10) !== validUntil ||
        validUntil <= verificationDay()
      )
        fail(400, "Set a future review expiry date.");
    }
    const saved = await env.DB.batch([
      env.DB.prepare(
        "UPDATE verification_applications SET status=?,reason=?,valid_until=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND EXISTS (SELECT 1 FROM verification_reviewers WHERE user_id=? AND active=1)",
      ).bind(
        status,
        reason,
        status === "Approved" ? validUntil : app!.valid_until,
        id,
        input.revision,
        user,
      ),
      env.DB.prepare(
        "INSERT INTO verification_events(application_id,revision,actor_id,action,reason,identity_reference,registration_reference,details) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0",
      ).bind(
        id,
        app!.revision + 1,
        user,
        status,
        reason,
        identity,
        registration,
        app!.details,
      ),
    ]);
    if (!saved[0].meta.changes)
      fail(
        409,
        "Review changed or reviewer access was revoked. Refresh and try again.",
      );
    return Response.json({ ok: true });
  }
  return fail(404, "Verification endpoint not found.");
}
export async function cleanupVerificationEvidence(env: Env) {
  const rows = (
    await env.DB.prepare(
      "SELECT id FROM verification_documents WHERE created_at<=datetime('now','-7 days') AND NOT EXISTS (SELECT 1 FROM verification_submission_documents WHERE document_id=verification_documents.id) LIMIT 100",
    ).all<{ id: string }>()
  ).results;
  for (const row of rows) {
    const lock = await env.DB.prepare(
      "UPDATE verification_documents SET ready=0 WHERE id=? AND created_at<=datetime('now','-7 days') AND NOT EXISTS (SELECT 1 FROM verification_submission_documents WHERE document_id=verification_documents.id)",
    )
      .bind(row.id)
      .run();
    if (!lock.meta.changes) continue;
    await env.FILES.delete("verification/" + row.id);
    await env.DB.prepare(
      "DELETE FROM verification_documents WHERE id=? AND ready=0",
    )
      .bind(row.id)
      .run();
  }
}
