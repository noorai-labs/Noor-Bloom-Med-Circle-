import { verifyToken } from "@clerk/backend";
import {
  canRead,
  createState,
  type Action,
  type ClinicState,
  type Role,
} from "../src/clinic";
import { cloudTransition } from "../src/cloud-transition";
import { reminderStub, wakeReminders, type ReminderEnv } from "./reminders";
import {
  verificationRoute,
  VerificationError,
  cleanupVerificationEvidence,
} from "./verification";
import { verificationDay } from "../src/verification-types";
import {
  callRoute,
  CallError,
  closeCall,
  revokeCallSession,
  maintainCalls,
  type CallEnv,
} from "./calls";
export { MedicineReminderScheduler } from "./reminders";

type Env = ReminderEnv &
  CallEnv & {
    DB: D1Database;
    FILES: R2Bucket;
    CLERK_JWT_KEY: string;
    CLERK_ISSUER: string;
    ALLOWED_ORIGINS: string;
    AUTHORIZED_PARTIES: string;
    PATIENT_VERIFICATION_REQUIRED?: string;
  };
type Member = { role: Role; provider_id: string; records_access: number };
type Row = { state: string; revision: number };
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const actions = new Set([
  "profile",
  "book",
  "status",
  "reschedule",
  "check",
  "visitNote",
  "consult",
  "medicine",
  "dose",
  "archiveMedicine",
  "record",
  "deleteRecord",
  "read",
  "approve",
  "issue",
  "resolve",
  "sos",
]);
const allowedMime = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const split = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

function emptyState() {
  const state = createState();
  state.profile = {
    name: "",
    age: "",
    gender: "Prefer not to say",
    contact: "",
    language: "English",
    conditions: "",
    allergies: "",
    medicines: "",
    notes: "",
    consent: false,
    address: "",
  };
  state.visits = [];
  state.medicines = [];
  state.records = [];
  state.activities = [];
  return state;
}
async function userId(request: Request, env: Env) {
  if (!env.CLERK_JWT_KEY || !env.CLERK_ISSUER)
    throw new HttpError(503, "Authentication is not configured on the server.");
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, "Sign in to continue.");
  try {
    const claims = await verifyToken(token, {
      jwtKey: env.CLERK_JWT_KEY,
      ...(split(env.AUTHORIZED_PARTIES).length
        ? { authorizedParties: split(env.AUTHORIZED_PARTIES) }
        : {}),
    });
    if (claims.iss !== env.CLERK_ISSUER || !claims.sub || !claims.sid)
      throw new Error("Invalid session");
    return { user: claims.sub, session: claims.sid };
  } catch {
    throw new HttpError(401, "Session expired. Sign in again.");
  }
}
async function ensureAccount(env: Env, user: string) {
  const space = "personal_" + user;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO care_spaces (id,state) VALUES (?,?)",
    ).bind(space, JSON.stringify(emptyState())),
    env.DB.prepare(
      "INSERT OR IGNORE INTO memberships (user_id,space_id,role) VALUES (?,?,'Patient')",
    ).bind(user, space),
  ]);
  return space;
}
async function access(env: Env, user: string, space: string) {
  const member = await env.DB.prepare(
    "SELECT role,provider_id,records_access FROM memberships WHERE user_id=? AND space_id=?",
  )
    .bind(user, space)
    .first<Member>();
  if (!member)
    throw new HttpError(403, "You do not have access to this care space.");
  if (member.role === "Doctor" || member.role === "Nurse") {
    const application = await env.DB.prepare(
      "SELECT status,valid_until FROM verification_applications WHERE user_id=? AND kind=?",
    )
      .bind(user, member.role)
      .first<{ status: string; valid_until: string }>();
    if (
      application &&
      (application.status !== "Approved" ||
        application.valid_until <= verificationDay())
    )
      throw new HttpError(
        403,
        "Professional verification is pending, suspended or expired. Open your personal care space to review your application.",
      );
  }
  if (member.role === "Admin")
    throw new HttpError(
      403,
      "Operations access does not include clinical care spaces.",
    );
  const row = await env.DB.prepare(
    "SELECT state,revision FROM care_spaces WHERE id=?",
  )
    .bind(space)
    .first<Row>();
  if (!row) throw new HttpError(404, "Care space not found.");
  const state: ClinicState = JSON.parse(row.state);
  state.session = {
    role: member.role,
    providerId: member.provider_id,
    identifier: user,
  };
  if (!canRead(state))
    throw new HttpError(
      403,
      "Family consent is not enabled for this care space.",
    );
  if (
    ["Doctor", "Nurse"].includes(member.role) &&
    !state.visits.some(
      (v) => v.providerId === member.provider_id && v.status !== "Cancelled",
    )
  )
    throw new HttpError(403, "An active assigned visit is required.");
  return {
    state,
    revision: row.revision,
    spaceId: space,
    recordsAccess: member.role === "Patient" || !!member.records_access,
  };
}
function visibleSnapshot(snapshot: Awaited<ReturnType<typeof access>>) {
  const { recordsAccess, ...result } = snapshot;
  if (recordsAccess) return { ...result, recordsAccess: true };
  return {
    ...result,
    recordsAccess: false,
    state: {
      ...result.state,
      records: [],
      consultations: [],
      medicines: [],
      activities: [],
      visits: result.state.visits.map((v) => ({ ...v, notes: "", reason: "" })),
      profile: {
        ...result.state.profile,
        conditions: "",
        allergies: "",
        medicines: "",
        notes: "",
      },
    },
  };
}
async function audit(
  env: Env,
  actor: string,
  space: string,
  action: string,
  target = "",
) {
  await env.DB.prepare(
    "INSERT INTO security_audit(actor_id,space_id,action,target_id) VALUES (?,?,?,?)",
  )
    .bind(actor, space, action, target)
    .run();
}
async function boundedJson(request: Request) {
  const text = await request.text();
  if (text.length > 128000) throw new HttpError(413, "Request is too large.");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Object required");
    return value;
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET")
    return Response.json({ ok: true });
  const { user, session } = await userId(request, env);
  if (url.pathname.startsWith("/v1/calls/"))
    return callRoute(request, env, user, session);
  if (url.pathname.startsWith("/v1/verification")) {
    const response = await verificationRoute(request, env, user);
    if (
      url.pathname === "/v1/verification/review" &&
      request.method === "POST" &&
      response.ok
    ) {
      // Review mutations may revoke ongoing call access; the minute maintenance job retries failures.
      ctx.waitUntil(maintainCalls(env));
    }
    return response;
  }
  if (
    url.pathname === "/v1/reminders/revoke-session" &&
    request.method === "POST"
  ) {
    const spaces = await env.DB.prepare(
      "SELECT DISTINCT space_id FROM reminder_devices WHERE user_id=? AND session_id=?",
    )
      .bind(user, session)
      .all<{ space_id: string }>();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO reminder_revoked_sessions(user_id,session_id) VALUES (?,?)",
      ).bind(user, session),
      env.DB.prepare(
        "DELETE FROM reminder_devices WHERE user_id=? AND session_id=?",
      ).bind(user, session),
      env.DB.prepare(
        "UPDATE consultation_calls SET state='closing' WHERE room_id IN (SELECT room_id FROM consultation_call_participants WHERE user_id=? AND session_id=?) AND state<>'closed'",
      ).bind(user, session),
    ]);
    ctx.waitUntil(
      revokeCallSession(env, user, session).catch(() => {
        console.error("Call sign-out cleanup will retry");
      }),
    );
    ctx.waitUntil(
      Promise.all(
        spaces.results.map((row) => wakeReminders(env, user, row.space_id)),
      ),
    );
    return Response.json({ ok: true });
  }
  const personal = await ensureAccount(env, user);
  if (url.pathname === "/v1/spaces" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT c.id,c.state,m.role,m.provider_id FROM memberships m JOIN care_spaces c ON c.id=m.space_id WHERE m.user_id=?",
    )
      .bind(user)
      .all<{ id: string; state: string; role: Role; provider_id: string }>();
    return Response.json(
      rows.results.map((r) => ({
        id: r.id,
        name:
          r.role === "Family" && !JSON.parse(r.state).profile.consent
            ? "Consent required"
            : JSON.parse(r.state).profile.name || "My care space",
        role: r.role,
        providerId: r.provider_id,
      })),
    );
  }
  const space = url.searchParams.get("space") || personal;
  const snapshot = await access(env, user, space);
  if (url.pathname.startsWith("/v1/reminders")) {
    if (snapshot.state.session?.role !== "Patient")
      throw new HttpError(403, "Only patients can manage medicine reminders.");
    const operation =
      url.pathname === "/v1/reminders" && request.method === "GET"
        ? "read"
        : request.method === "POST"
          ? (
              {
                "/v1/reminders": "save",
                "/v1/reminders/device": "device",
                "/v1/reminders/test": "test",
              } as Record<string, string>
            )[url.pathname]
          : undefined;
    if (!operation) throw new HttpError(404, "Reminder endpoint not found.");
    const data = request.method === "POST" ? await boundedJson(request) : {};
    return reminderStub(env, user, space).fetch("https://reminders/internal", {
      method: "POST",
      body: JSON.stringify({ user, session, space, operation, data }),
    });
  }
  if (url.pathname === "/v1/state" && request.method === "GET") {
    await audit(env, user, space, "care_space.read");
    return Response.json(visibleSnapshot(snapshot));
  }
  if (url.pathname === "/v1/records/access" && request.method === "GET") {
    if (snapshot.state.session?.role !== "Patient")
      throw new HttpError(403, "Only the patient manages record sharing.");
    const rows = await env.DB.prepare(
      "SELECT user_id AS userId,role,records_access AS granted FROM memberships WHERE space_id=? AND user_id<>? AND role<>'Admin'",
    )
      .bind(space, user)
      .all();
    return Response.json(rows.results);
  }
  if (url.pathname === "/v1/records/access" && request.method === "POST") {
    if (snapshot.state.session?.role !== "Patient")
      throw new HttpError(403, "Only the patient manages record sharing.");
    const input = await boundedJson(request);
    if (
      typeof input.userId !== "string" ||
      typeof input.granted !== "boolean" ||
      input.userId === user
    )
      throw new HttpError(400, "Select an existing care team member.");
    const member = await env.DB.prepare(
      "SELECT role FROM memberships WHERE space_id=? AND user_id=?",
    )
      .bind(space, input.userId)
      .first<{ role: string }>();
    if (!member || member.role === "Admin" || member.role === "Patient")
      throw new HttpError(
        403,
        "Record sharing is unavailable for this member.",
      );
    if (
      member.role === "Family" &&
      input.granted &&
      !snapshot.state.profile.consent
    )
      throw new HttpError(
        400,
        "Enable family consent in your profile before sharing documents.",
      );
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE memberships SET records_access=? WHERE space_id=? AND user_id=?",
      ).bind(input.granted ? 1 : 0, space, input.userId),
      env.DB.prepare(
        "INSERT INTO security_audit(actor_id,space_id,action,target_id) VALUES (?,?,?,?)",
      ).bind(
        user,
        space,
        input.granted ? "record.access.grant" : "record.access.revoke",
        input.userId,
      ),
    ]);
    return Response.json({ ok: true });
  }
  const historyMatch = url.pathname.match(/^\/v1\/records\/([^/]+)\/history$/);
  if (historyMatch && request.method === "GET") {
    if (!snapshot.recordsAccess)
      throw new HttpError(403, "Record access is not granted.");
    const recordId = decodeURIComponent(historyMatch[1]);
    if (!snapshot.state.records.some((r) => r.id === recordId))
      throw new HttpError(404, "Record not found.");
    const history = await env.DB.prepare(
      "SELECT version,metadata,actor_id AS actorId,reason,created_at AS createdAt FROM record_versions WHERE space_id=? AND record_id=? ORDER BY version DESC",
    )
      .bind(space, recordId)
      .all();
    await audit(env, user, space, "record.history.read", recordId);
    return Response.json(history.results);
  }
  const amendMatch = url.pathname.match(/^\/v1\/records\/([^/]+)\/amend$/);
  if (amendMatch && request.method === "POST") {
    if (snapshot.state.session?.role !== "Patient")
      throw new HttpError(
        403,
        "Only the patient can amend their uploaded records.",
      );
    const recordId = decodeURIComponent(amendMatch[1]);
    const record = snapshot.state.records.find((r) => r.id === recordId);
    if (!record) throw new HttpError(404, "Record not found.");
    if (record.provenance && record.provenance.authorId !== user)
      throw new HttpError(
        403,
        "This record must be corrected by its original author.",
      );
    const input = await boundedJson(request);
    if (input.revision !== snapshot.revision)
      throw new HttpError(409, "Care data changed. Refresh and retry.");
    if (
      typeof input.reason !== "string" ||
      !input.reason.trim() ||
      input.reason.length > 500 ||
      typeof input.detail !== "string" ||
      input.detail.length > 4000
    )
      throw new HttpError(
        400,
        "Enter a correction and a reason (up to 500 characters).",
      );
    const previousVersion = record.provenance?.version || 1;
    const now = new Date().toISOString();
    const amendmentId = crypto.randomUUID();
    const revised = {
      ...record,
      detail: input.detail.trim(),
      provenance: {
        source:
          record.provenance?.source ||
          "Legacy upload - original source unverified",
        authorId: record.provenance?.authorId || "unknown",
        createdAt: record.provenance?.createdAt || "unknown",
        version: previousVersion + 1,
        updatedAt: now,
        amendmentId,
      },
    };
    const next = {
      ...snapshot.state,
      records: snapshot.state.records.map((r) =>
        r.id === recordId ? revised : r,
      ),
    };
    const result = await env.DB.batch([
      env.DB.prepare(
        "UPDATE care_spaces SET state=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?",
      ).bind(JSON.stringify({ ...next, session: null }), space, input.revision),
      env.DB.prepare(
        "INSERT OR IGNORE INTO record_versions(space_id,record_id,version,metadata,actor_id,reason) SELECT ?,?,?,?,?,? WHERE changes()>0",
      ).bind(
        space,
        recordId,
        previousVersion,
        JSON.stringify(record),
        user,
        "Before amendment",
      ),
      env.DB.prepare(
        "INSERT INTO record_versions(space_id,record_id,version,metadata,actor_id,reason) SELECT ?,?,?,?,?,? WHERE json_extract((SELECT state FROM care_spaces WHERE id=?),?)=? AND NOT EXISTS(SELECT 1 FROM record_versions WHERE space_id=? AND record_id=? AND version=?)",
      ).bind(
        space,
        recordId,
        previousVersion + 1,
        JSON.stringify(revised),
        user,
        input.reason.trim(),
        space,
        "$.records[" +
          snapshot.state.records.findIndex((r) => r.id === recordId) +
          "].provenance.amendmentId",
        amendmentId,
        space,
        recordId,
        previousVersion + 1,
      ),
      env.DB.prepare(
        "INSERT INTO security_audit(actor_id,space_id,action,target_id) SELECT ?,?,?,? WHERE json_extract((SELECT state FROM care_spaces WHERE id=?),?)=?",
      ).bind(
        user,
        space,
        "record.amend",
        recordId,
        space,
        "$.records[" +
          snapshot.state.records.findIndex((r) => r.id === recordId) +
          "].provenance.amendmentId",
        amendmentId,
      ),
    ]);
    if (!result[0].meta.changes)
      throw new HttpError(409, "Care data changed. Refresh and retry.");
    return Response.json({ ok: true });
  }
  if (url.pathname === "/v1/actions" && request.method === "POST") {
    const { revision, action, operationId } = (await boundedJson(request)) as {
      revision: number;
      action: Action;
      operationId: string;
    };
    if (!/^[a-f0-9-]{36}$/.test(operationId || ""))
      throw new HttpError(400, "Invalid operation ID.");
    if (!action || !actions.has(action.type))
      throw new HttpError(
        400,
        "Unsupported action. Roles are assigned by the server.",
      );
    if (
      action.type === "book" &&
      env.PATIENT_VERIFICATION_REQUIRED === "true"
    ) {
      const patient = await env.DB.prepare(
        "SELECT v.id FROM verification_applications v JOIN memberships m ON m.user_id=v.user_id WHERE m.space_id=? AND m.role='Patient' AND v.kind='Patient' AND v.status='Approved' AND v.valid_until>?",
      )
        .bind(space, verificationDay())
        .first();
      if (!patient)
        throw new HttpError(
          403,
          "The patient needs an active manual identity review before booking.",
        );
    }
    if (revision !== snapshot.revision)
      throw new HttpError(
        409,
        "Care data changed on another device. Refresh and try again.",
      );
    if (JSON.stringify(snapshot.state).includes(operationId))
      throw new HttpError(
        409,
        "This update has already been applied. Refresh your care data.",
      );
    if (
      ["record", "deleteRecord"].includes(action.type) &&
      snapshot.state.session?.role !== "Patient"
    )
      throw new HttpError(403, "Only the patient manages uploaded documents.");
    if (action.type === "record") {
      if (action.record.uri)
        throw new HttpError(
          400,
          "Device file paths cannot be saved to cloud records.",
        );
      if (!action.record.fileId)
        throw new HttpError(400, "Upload the attachment first.");
      const attachment = await env.DB.prepare(
        "SELECT id,name,mime FROM attachments WHERE id=? AND space_id=?",
      )
        .bind(action.record.fileId, space)
        .first<{ id: string; name: string; mime: string }>();
      if (!attachment)
        throw new HttpError(
          403,
          "Attachment is not available in this care space.",
        );
      action.record = {
        ...action.record,
        name: attachment.name,
        mime: attachment.mime,
        provenance: {
          source: "Patient upload - not clinically verified",
          authorId: user,
          createdAt: new Date().toISOString(),
          version: 1,
        },
      };
    }
    let next: ClinicState;
    try {
      next = cloudTransition(snapshot.state, action, operationId);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Invalid care update.",
      );
    }
    const payload = JSON.stringify({ ...next, session: null });
    if (payload.length > 750000)
      throw new HttpError(413, "Care space storage limit reached.");
    const statements = [
      env.DB.prepare(
        "UPDATE care_spaces SET state=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?",
      ).bind(payload, space, revision),
      env.DB.prepare(
        "INSERT INTO security_audit(actor_id,space_id,action,target_id) SELECT ?,?,?,? WHERE changes()>0",
      ).bind(
        user,
        space,
        "care." + action.type,
        action.type === "deleteRecord" ? action.recordId : operationId,
      ),
    ];
    if (action.type === "record") {
      const record = next.records[0];
      statements.push(
        env.DB.prepare(
          "INSERT INTO record_versions(space_id,record_id,version,metadata,actor_id,reason) SELECT ?,?,1,?,?,? WHERE EXISTS (SELECT 1 FROM care_spaces,json_each(care_spaces.state,'$.records') WHERE care_spaces.id=? AND json_extract(json_each.value,'$.id')=?)",
        ).bind(
          space,
          record.id,
          JSON.stringify(record),
          user,
          "Original upload",
          space,
          record.id,
        ),
      );
    }
    const saved = await env.DB.batch(statements);
    if (!saved[0].meta.changes)
      throw new HttpError(409, "Care data changed. Refresh and try again.");
    if (
      action.type === "reschedule" ||
      (action.type === "status" &&
        ["Cancelled", "Completed"].includes(action.status))
    ) {
      ctx.waitUntil(closeCall(env, space, action.visitId));
    }
    ctx.waitUntil(
      (async () => {
        const patients = await env.DB.prepare(
          "SELECT user_id FROM memberships WHERE space_id=? AND role='Patient'",
        )
          .bind(space)
          .all<{ user_id: string }>();
        for (const patient of patients.results) {
          const response = await wakeReminders(env, patient.user_id, space);
          if (!response.ok)
            throw new Error("Could not refresh reminder scheduler");
        }
      })(),
    );
    if (action.type === "deleteRecord") {
      const fileId = snapshot.state.records.find(
        (r) => r.id === action.recordId,
      )?.fileId;
      if (fileId && !next.records.some((r) => r.fileId === fileId))
        ctx.waitUntil(
          (async () => {
            await env.FILES.delete(space + "/" + fileId);
            await env.DB.prepare(
              "DELETE FROM attachments WHERE id=? AND space_id=?",
            )
              .bind(fileId, space)
              .run();
          })(),
        );
    }
    return Response.json(
      visibleSnapshot({ ...snapshot, state: next, revision: revision + 1 }),
    );
  }
  if (url.pathname === "/v1/files" && request.method === "POST") {
    if (snapshot.state.session!.role !== "Patient")
      throw new HttpError(403, "Only the patient can upload records.");
    const mime = request.headers.get("Content-Type")?.split(";")[0] || "";
    if (!allowedMime.has(mime))
      throw new HttpError(415, "Choose a PDF, JPEG, PNG or WebP file.");
    const advertisedSize = Number(request.headers.get("Content-Length"));
    if (advertisedSize > 15 * 1024 * 1024)
      throw new HttpError(413, "File exceeds 15 MB.");
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024)
      throw new HttpError(413, "Choose a file between 1 byte and 15 MB.");
    const fileId = crypto.randomUUID();
    const name = (url.searchParams.get("name") || "attachment")
      .replace(/[\r\n]/g, "")
      .slice(0, 200);
    await env.FILES.put(space + "/" + fileId, bytes, {
      httpMetadata: { contentType: mime },
    });
    try {
      await env.DB.prepare(
        "INSERT INTO attachments (id,space_id,name,mime,size) VALUES (?,?,?,?,?)",
      )
        .bind(fileId, space, name, mime, bytes.byteLength)
        .run();
    } catch (e) {
      await env.FILES.delete(space + "/" + fileId);
      throw e;
    }
    return Response.json({ fileId, name, mime });
  }
  const fileMatch = url.pathname.match(/^\/v1\/files\/([a-f0-9-]{36})$/);
  if (fileMatch && request.method === "GET") {
    if (!snapshot.recordsAccess)
      throw new HttpError(403, "Record access is not granted.");
    const fileId = fileMatch[1];
    const attached = snapshot.state.records.some((r) => r.fileId === fileId);
    if (!attached) throw new HttpError(404, "Attachment not found.");
    const object = await env.FILES.get(space + "/" + fileId);
    if (!object) throw new HttpError(404, "Attachment not found.");
    await audit(env, user, space, "record.file.read", fileId);
    return new Response(object.body, {
      headers: {
        "Content-Type":
          object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  throw new HttpError(404, "Endpoint not found.");
}
export default {
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(maintainCalls(env));
    if (event.cron === "0 3 * * *")
      ctx.waitUntil(cleanupVerificationEvidence(env));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const origin = request.headers.get("Origin");
    const allowed = split(env.ALLOWED_ORIGINS);
    if (origin && !allowed.includes(origin))
      return Response.json(
        { error: "Origin is not allowed." },
        { status: 403 },
      );
    const headers = new Headers({
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    let response: Response;
    try {
      response = await route(request, env, ctx);
    } catch (e) {
      if (
        !(e instanceof HttpError) &&
        !(e instanceof VerificationError) &&
        !(e instanceof CallError)
      )
        console.error("Unexpected Worker operation failure");
      response = Response.json(
        {
          error:
            e instanceof HttpError ||
            e instanceof VerificationError ||
            e instanceof CallError
              ? e.message
              : "Unable to complete the cloud request.",
        },
        {
          status:
            e instanceof HttpError ||
            e instanceof VerificationError ||
            e instanceof CallError
              ? e.status
              : 500,
        },
      );
    }
    const merged = new Headers(response.headers);
    headers.forEach((v, k) => merged.set(k, v));
    return new Response(response.body, {
      status: response.status,
      headers: merged,
    });
  },
};
