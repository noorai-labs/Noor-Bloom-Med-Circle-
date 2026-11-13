import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import type { ClinicState, Visit } from "../src/clinic";
import { verificationDay } from "../src/verification-types";
export type CallEnv = {
  DB: D1Database;
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  LIVEKIT_E2EE_SECRET?: string;
};
type CallRow = {
  space_id: string;
  visit_id: string;
  room_id: string;
  schedule_key: string;
  state: string;
  ends_at: number;
};
export class CallError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new CallError(status, message);
};
function config(env: CallEnv) {
  if (
    !env.LIVEKIT_URL ||
    !env.LIVEKIT_API_KEY ||
    !env.LIVEKIT_API_SECRET ||
    !env.LIVEKIT_E2EE_SECRET ||
    env.LIVEKIT_E2EE_SECRET.length < 32
  )
    fail(
      503,
      "Online consultations are not configured yet. Please contact your care team.",
    );
  const url = new URL(env.LIVEKIT_URL!);
  if (
    url.protocol !== "wss:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    fail(503, "The consultation server configuration is invalid.");
  return {
    url: env.LIVEKIT_URL!,
    client: new RoomServiceClient(
      "https://" + url.host,
      env.LIVEKIT_API_KEY!,
      env.LIVEKIT_API_SECRET!,
      { requestTimeout: 8 },
    ),
  };
}
export function callWindow(visit: Pick<Visit, "date" | "time">) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(visit.time);
  if (
    !match ||
    +match[1] < 1 ||
    +match[1] > 12 ||
    +match[2] > 59 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(visit.date)
  )
    fail(400, "The appointment time is invalid.");
  const hour = (+match![1] % 12) + (match![3] === "PM" ? 12 : 0);
  const at = Date.parse(
    `${visit.date}T${String(hour).padStart(2, "0")}:${match![2]}:00+05:30`,
  );
  if (!Number.isFinite(at)) fail(400, "The appointment date is invalid.");
  return { starts: at - 10 * 60000, ends: at + 60 * 60000 };
}
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
async function approved(env: CallEnv, user: string, kind: string) {
  return !!(await env.DB.prepare(
    "SELECT 1 FROM verification_applications WHERE user_id=? AND kind=? AND status='Approved' AND valid_until>?",
  )
    .bind(user, kind, verificationDay())
    .first());
}
async function authorise(
  env: CallEnv,
  user: string,
  space: string,
  visitId: string,
) {
  const member = await env.DB.prepare(
    "SELECT role,provider_id FROM memberships WHERE user_id=? AND space_id=?",
  )
    .bind(user, space)
    .first<{ role: string; provider_id: string }>();
  if (!member || !["Patient", "Doctor"].includes(member.role))
    fail(403, "Only this appointment's patient and assigned doctor can join.");
  const row = await env.DB.prepare("SELECT state FROM care_spaces WHERE id=?")
    .bind(space)
    .first<{ state: string }>();
  const state: ClinicState | null = row ? JSON.parse(row.state) : null;
  const visit = state?.visits.find((v) => v.id === visitId);
  if (!visit) fail(404, "Appointment not found.");
  if (
    visit!.service !== "Online Consultation" ||
    !["Confirmed", "In Progress"].includes(visit!.status)
  )
    fail(409, "A confirmed, active online consultation is required.");
  if (member!.role === "Doctor" && member!.provider_id !== visit!.providerId)
    fail(403, "This consultation is assigned to another doctor.");
  const patients = (
    await env.DB.prepare(
      "SELECT user_id FROM memberships WHERE space_id=? AND role='Patient'",
    )
      .bind(space)
      .all<{ user_id: string }>()
  ).results;
  const doctors = (
    await env.DB.prepare(
      "SELECT user_id FROM memberships WHERE space_id=? AND role='Doctor' AND provider_id=?",
    )
      .bind(space, visit!.providerId)
      .all<{ user_id: string }>()
  ).results;
  if (patients.length !== 1 || doctors.length !== 1)
    fail(
      409,
      "The care team must assign exactly one patient and one doctor before this call.",
    );
  if (
    !(await approved(env, patients[0].user_id, "Patient")) ||
    !(await approved(env, doctors[0].user_id, "Doctor"))
  )
    fail(
      403,
      "The patient and doctor need active verification approval before joining.",
    );
  const window = callWindow(visit!);
  if (Date.now() < window.starts || Date.now() >= window.ends)
    fail(
      403,
      "Join from 10 minutes before your appointment until 60 minutes after its scheduled start.",
    );
  return {
    visit: visit!,
    role: member!.role as "Patient" | "Doctor",
    ...window,
  };
}
async function audit(
  env: CallEnv,
  user: string,
  space: string,
  action: string,
  target: string,
) {
  await env.DB.prepare(
    "INSERT INTO security_audit(actor_id,space_id,action,target_id) VALUES (?,?,?,?)",
  )
    .bind(user, space, action, target)
    .run();
}
export async function closeCall(env: CallEnv, space: string, visitId: string) {
  const row = await env.DB.prepare(
    "SELECT * FROM consultation_calls WHERE space_id=? AND visit_id=? AND state<>'closed'",
  )
    .bind(space, visitId)
    .first<CallRow>();
  if (!row) return;
  await env.DB.prepare(
    "UPDATE consultation_calls SET state='closing' WHERE room_id=?",
  )
    .bind(row.room_id)
    .run();
  try {
    await config(env).client.deleteRoom(row.room_id);
  } catch (error) {
    if ((error as { code?: string }).code !== "not_found") throw error;
  }
  await env.DB.prepare(
    "UPDATE consultation_calls SET state='closed' WHERE room_id=?",
  )
    .bind(row.room_id)
    .run();
  await env.DB.prepare(
    "DELETE FROM consultation_call_participants WHERE room_id=?",
  )
    .bind(row.room_id)
    .run();
  await env.DB.prepare("DELETE FROM consultation_call_slots WHERE room_id=?")
    .bind(row.room_id)
    .run();
}
export async function revokeCallSession(
  env: CallEnv,
  user: string,
  session: string,
) {
  const rows = (
    await env.DB.prepare(
      "SELECT DISTINCT c.* FROM consultation_calls c JOIN consultation_call_participants p ON p.room_id=c.room_id WHERE p.user_id=? AND p.session_id=? AND c.state<>'closed'",
    )
      .bind(user, session)
      .all<CallRow>()
  ).results;
  for (const row of rows) await closeCall(env, row.space_id, row.visit_id);
}
export async function closeUserCalls(env: CallEnv, user: string) {
  const rows = (
    await env.DB.prepare(
      "SELECT DISTINCT c.* FROM consultation_calls c JOIN memberships m ON m.space_id=c.space_id WHERE m.user_id=? AND m.role IN ('Patient','Doctor') AND c.state<>'closed'",
    )
      .bind(user)
      .all<CallRow>()
  ).results;
  for (const row of rows) await closeCall(env, row.space_id, row.visit_id);
}
export async function maintainCalls(env: CallEnv) {
  const slots = (
    await env.DB.prepare(
      "SELECT room_id,reserved_at FROM consultation_call_slots WHERE reserved_at<?",
    )
      .bind(Date.now() - 30000)
      .all<{ room_id: string; reserved_at: number }>()
  ).results;
  if (slots.length) {
    try {
      const live = await config(env).client.listRooms(
        slots.map((s) => s.room_id),
      );
      for (const slot of slots)
        if (!live.some((r) => r.name === slot.room_id))
          await env.DB.prepare(
            "DELETE FROM consultation_call_slots WHERE room_id=? AND reserved_at=?",
          )
            .bind(slot.room_id, slot.reserved_at)
            .run();
    } catch {
      console.error("Consultation capacity check will retry");
    }
  }
  const rows = (
    await env.DB.prepare(
      "SELECT * FROM consultation_calls WHERE state<>'closed' ORDER BY last_checked LIMIT 50",
    ).all<CallRow>()
  ).results;
  for (const row of rows) {
    await env.DB.prepare(
      "UPDATE consultation_calls SET last_checked=? WHERE room_id=?",
    )
      .bind(Date.now(), row.room_id)
      .run();
    let close = row.state === "closing" || row.ends_at <= Date.now();
    if (!close) {
      const patient = await env.DB.prepare(
        "SELECT user_id FROM memberships WHERE space_id=? AND role='Patient' LIMIT 1",
      )
        .bind(row.space_id)
        .first<{ user_id: string }>();
      try {
        if (!patient) throw new Error();
        const access = await authorise(
          env,
          patient.user_id,
          row.space_id,
          row.visit_id,
        );
        if (access.visit.date + " " + access.visit.time !== row.schedule_key)
          throw new Error();
      } catch {
        close = true;
      }
    }
    if (close)
      try {
        await closeCall(env, row.space_id, row.visit_id);
      } catch {
        console.error("Consultation room cleanup will retry");
      }
  }
}
export async function callRoute(
  request: Request,
  env: CallEnv,
  user: string,
  session: string,
) {
  const url = new URL(request.url),
    match = url.pathname.match(/^\/v1\/calls\/([^/]+)\/(join|status|leave)$/);
  if (!match) fail(404, "Call endpoint not found.");
  const [visitId, operation] = [decodeURIComponent(match![1]), match![2]],
    space = url.searchParams.get("space") || "";
  if (!space || space.length > 200 || visitId.length > 200)
    fail(400, "Choose an appointment and care space.");
  if (operation === "leave" && request.method === "POST") {
    const call = await env.DB.prepare(
      "SELECT * FROM consultation_calls WHERE space_id=? AND visit_id=?",
    )
      .bind(space, visitId)
      .first<CallRow>();
    if (call) {
      const participant = await env.DB.prepare(
        "SELECT identity FROM consultation_call_participants WHERE room_id=? AND user_id=? AND session_id=?",
      )
        .bind(call.room_id, user, session)
        .first<{ identity: string }>();
      if (participant) {
        try {
          await config(env).client.removeParticipant(
            call.room_id,
            participant.identity,
          );
        } catch (error) {
          if ((error as { code?: string }).code !== "not_found") throw error;
        }
        await env.DB.prepare(
          "DELETE FROM consultation_call_participants WHERE room_id=? AND user_id=? AND session_id=?",
        )
          .bind(call.room_id, user, session)
          .run();
        await audit(env, user, space, "call.leave", visitId);
        const waiting = await env.DB.prepare(
          "SELECT 1 FROM consultation_call_participants WHERE room_id=? LIMIT 1",
        )
          .bind(call.room_id)
          .first();
        if (!waiting) {
          const remaining = await config(env)
            .client.listParticipants(call.room_id)
            .catch((error) => {
              if ((error as { code?: string }).code === "not_found") return [];
              throw error;
            });
          if (!remaining.length) await closeCall(env, space, visitId);
        }
      }
    }
    return Response.json({ ok: true });
  }
  const access = await authorise(env, user, space, visitId),
    settings = config(env);
  const schedule = access.visit.date + " " + access.visit.time;
  if (operation === "status" && request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT * FROM consultation_calls WHERE space_id=? AND visit_id=? AND state='open' AND schedule_key=?",
    )
      .bind(space, visitId, schedule)
      .first<CallRow>();
    if (!row) fail(403, "This call has ended.");
    const member = await env.DB.prepare(
      "SELECT 1 FROM consultation_call_participants WHERE room_id=? AND user_id=? AND session_id=?",
    )
      .bind(row!.room_id, user, session)
      .first();
    if (!member) fail(403, "Your call session has ended.");
    return Response.json({ allowed: true, endsAt: access.ends });
  }
  if (operation !== "join" || request.method !== "POST")
    fail(405, "Unsupported call request.");
  if (
    await env.DB.prepare(
      "SELECT 1 FROM reminder_revoked_sessions WHERE user_id=? AND session_id=?",
    )
      .bind(user, session)
      .first()
  )
    fail(401, "Sign in again before joining a call.");
  let row = await env.DB.prepare(
    "SELECT * FROM consultation_calls WHERE space_id=? AND visit_id=?",
  )
    .bind(space, visitId)
    .first<CallRow>();
  if (row && row.schedule_key !== schedule) {
    await closeCall(env, space, visitId);
    await env.DB.prepare(
      "DELETE FROM consultation_calls WHERE space_id=? AND visit_id=? AND state='closed'",
    )
      .bind(space, visitId)
      .run();
    row = null;
  }
  if (row?.state === "closed") {
    await env.DB.prepare(
      "DELETE FROM consultation_calls WHERE space_id=? AND visit_id=? AND state='closed'",
    )
      .bind(space, visitId)
      .run();
    row = null;
  }
  if (row && row.state !== "open")
    fail(409, "This consultation room has ended.");
  if (!row) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO consultation_calls(space_id,visit_id,room_id,schedule_key,ends_at,created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(
        space,
        visitId,
        "bloom-" + crypto.randomUUID(),
        schedule,
        access.ends,
        Date.now(),
      )
      .run();
    row = await env.DB.prepare(
      "SELECT * FROM consultation_calls WHERE space_id=? AND visit_id=?",
    )
      .bind(space, visitId)
      .first<CallRow>();
  }
  if (!row || row.state !== "open" || row.schedule_key !== schedule)
    fail(409, "Appointment changed. Refresh before joining.");
  const issued = await env.DB.prepare(
    "SELECT last_issued FROM consultation_call_participants WHERE room_id=? AND user_id=?",
  )
    .bind(row!.room_id, user)
    .first<{ last_issued: number }>();
  if (issued && Date.now() - issued.last_issued < 10000)
    fail(429, "Wait a few seconds before rejoining.");
  const identity =
    "member-" +
    (
      await hmac(env.LIVEKIT_E2EE_SECRET!, row!.room_id + ":identity:" + user)
    ).slice(0, 24);
  // D1 serializes this claim; only three distinct rooms can reserve a slot globally.
  await env.DB.prepare(
    "INSERT OR IGNORE INTO consultation_call_slots(slot,room_id,reserved_at) SELECT candidate,?,? FROM (SELECT 1 AS candidate UNION ALL SELECT 2 UNION ALL SELECT 3) WHERE NOT EXISTS (SELECT 1 FROM consultation_call_slots WHERE room_id=?) AND NOT EXISTS (SELECT 1 FROM consultation_call_slots WHERE slot=candidate) ORDER BY candidate LIMIT 1",
  )
    .bind(row!.room_id, Date.now(), row!.room_id)
    .run();
  const slot = await env.DB.prepare(
    "SELECT slot FROM consultation_call_slots WHERE room_id=?",
  )
    .bind(row!.room_id)
    .first();
  if (!slot)
    fail(
      503,
      "All three consultation slots are busy. Please try again after a call ends.",
    );
  await env.DB.prepare(
    "UPDATE consultation_call_slots SET reserved_at=? WHERE room_id=?",
  )
    .bind(Date.now(), row!.room_id)
    .run();
  // These do not include diagnoses, names, appointment reasons or health-record content.
  try {
    await settings.client.createRoom({
      name: row!.room_id,
      emptyTimeout: 120,
      departureTimeout: 20,
      maxParticipants: 2,
    });
    // Recheck immediately before releasing credentials; cancellation and revocation close the room separately.
    await authorise(env, user, space, visitId);
  } catch (error) {
    await env.DB.prepare(
      "UPDATE consultation_calls SET state='closing' WHERE room_id=?",
    )
      .bind(row!.room_id)
      .run();
    try {
      await closeCall(env, space, visitId);
    } catch {
      console.error("Failed call provisioning cleanup will retry");
    }
    throw error;
  }
  const registered = await env.DB.prepare(
    "INSERT INTO consultation_call_participants(room_id,user_id,session_id,identity,last_issued) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM consultation_calls WHERE room_id=? AND state='open' AND schedule_key=?) AND NOT EXISTS (SELECT 1 FROM reminder_revoked_sessions WHERE user_id=? AND session_id=?) ON CONFLICT(room_id,user_id) DO UPDATE SET session_id=excluded.session_id,identity=excluded.identity,last_issued=excluded.last_issued",
  )
    .bind(
      row!.room_id,
      user,
      session,
      identity,
      Date.now(),
      row!.room_id,
      schedule,
      user,
      session,
    )
    .run();
  if (!registered.meta.changes)
    fail(409, "Your call access changed. Sign in or refresh before retrying.");
  const token = new AccessToken(env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!, {
    identity,
    name: access.role,
    ttl: 90,
  });
  token.addGrant({
    room: row!.room_id,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA],
    canUpdateOwnMetadata: false,
  });
  await audit(env, user, space, "call.join", visitId);
  return Response.json({
    serverUrl: settings.url,
    token: await token.toJwt(),
    roomId: row!.room_id,
    sharedKey: await hmac(env.LIVEKIT_E2EE_SECRET!, row!.room_id + ":media"),
    endsAt: access.ends,
    role: access.role,
    encryption: "required",
  });
}
