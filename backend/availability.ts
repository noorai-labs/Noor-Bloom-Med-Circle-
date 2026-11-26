import { verificationDay } from "../src/verification-types";

export class AvailabilityError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type AvailabilityDay = {
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  label: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

const VALID_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function isVerifiedOrAssignedDoctor(
  env: { DB: D1Database },
  userId: string,
): Promise<boolean> {
  const verified = await env.DB.prepare(
    "SELECT 1 FROM verification_applications WHERE user_id=? AND status='Approved' AND valid_until > ? AND kind IN ('Doctor','Nurse')",
  )
    .bind(userId, verificationDay())
    .first();
  if (verified) return true;
  const member = await env.DB.prepare(
    "SELECT 1 FROM memberships WHERE user_id=? AND role IN ('Doctor','Nurse')",
  )
    .bind(userId)
    .first();
  return !!member;
}

const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function parseSlotTo24Hour(timeStr: string): string | null {
  const trimmed = timeStr.trim();
  if (TIME_RE.test(trimmed)) return trimmed;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3].toUpperCase();
  if (hours < 1 || hours > 12) return null;
  if (meridiem === "AM") {
    if (hours === 12) hours = 0;
  } else if (hours !== 12) {
    hours += 12;
  }
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

export async function checkDoctorAvailabilityForSlot(
  env: { DB: D1Database },
  providerId: string,
  date: string,
  time: string,
): Promise<void> {
  const parsedDate = new Date(date + "T12:00:00Z");
  if (Number.isNaN(parsedDate.getTime())) {
    throw new AvailabilityError(400, "Choose a valid appointment date.");
  }
  const hhmm = parseSlotTo24Hour(time);
  if (!hhmm) {
    throw new AvailabilityError(400, "Choose a valid appointment time.");
  }
  let row: { schedule?: string } | null;
  try {
    row = await env.DB.prepare(
      "SELECT schedule FROM doctor_availability WHERE user_id=?",
    )
      .bind(providerId)
      .first<{ schedule?: string }>();
  } catch {
    throw new AvailabilityError(
      503,
      "Could not verify doctor availability. Please try again.",
    );
  }
  if (!row || typeof row.schedule !== "string") {
    throw new AvailabilityError(
      400,
      "This doctor has not published available hours yet.",
    );
  }
  let schedule: AvailabilityDay[];
  try {
    const parsed = JSON.parse(row.schedule);
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid schedule");
    }
    schedule = parsed as AvailabilityDay[];
  } catch {
    throw new AvailabilityError(
      503,
      "Could not verify doctor availability. Please try again.",
    );
  }
  if (schedule.length === 0) {
    throw new AvailabilityError(
      400,
      "This doctor has not published available hours yet.",
    );
  }
  const weekdayKey = WEEKDAY_KEYS[parsedDate.getUTCDay()];
  const dayRule = schedule.find((d) => d.day === weekdayKey);
  if (
    !dayRule ||
    !dayRule.enabled ||
    hhmm < dayRule.startTime ||
    hhmm >= dayRule.endTime
  ) {
    throw new AvailabilityError(
      400,
      "Selected time is outside the doctor's available hours.",
    );
  }
}

export function validateSchedule(input: unknown): AvailabilityDay[] {
  if (!Array.isArray(input) || input.length > 7) {
    throw new AvailabilityError(400, "Provide up to 7 weekly schedule days.");
  }
  const seen = new Set<string>();
  const cleaned: AvailabilityDay[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      throw new AvailabilityError(400, "Invalid schedule entry.");
    }
    const row = item as Partial<AvailabilityDay>;
    if (
      typeof row.day !== "string" ||
      !VALID_DAYS.has(row.day) ||
      seen.has(row.day)
    ) {
      throw new AvailabilityError(400, "Choose valid unique weekdays.");
    }
    seen.add(row.day);
    const startTime = typeof row.startTime === "string" ? row.startTime.trim() : "";
    const endTime = typeof row.endTime === "string" ? row.endTime.trim() : "";
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      throw new AvailabilityError(400, "Use 24-hour HH:MM time format.");
    }
    if (row.enabled && startTime >= endTime) {
      throw new AvailabilityError(
        400,
        "End time must be after start time for enabled days.",
      );
    }
    cleaned.push({
      day: row.day as AvailabilityDay["day"],
      label: typeof row.label === "string" ? row.label.trim().slice(0, 20) : row.day,
      enabled: row.enabled === true,
      startTime,
      endTime,
    });
  }
  return cleaned;
}

export async function availabilityRoute(
  request: Request,
  env: { DB: D1Database },
  user: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/availability") {
    throw new AvailabilityError(404, "Endpoint not found.");
  }

  if (request.method === "GET") {
    const requestedProvider = url.searchParams.get("providerId")?.trim();
    const targetUser = requestedProvider || user;
    if (!requestedProvider) {
      const allowed = await isVerifiedOrAssignedDoctor(env, user);
      if (!allowed) {
        throw new AvailabilityError(
          403,
          "Doctor verification is required to manage availability.",
        );
      }
    }
    const row = await env.DB.prepare(
      "SELECT schedule, updated_at FROM doctor_availability WHERE user_id=?",
    )
      .bind(targetUser)
      .first<{ schedule: string; updated_at: string }>();
    if (!row) {
      return Response.json({
        providerId: targetUser,
        schedule: [],
        updatedAt: "",
      });
    }
    let schedule: AvailabilityDay[] = [];
    try {
      schedule = JSON.parse(row.schedule) as AvailabilityDay[];
    } catch {
      schedule = [];
    }
    return Response.json({
      providerId: targetUser,
      schedule,
      updatedAt: row.updated_at,
    });
  }

  if (request.method === "POST") {
    const allowed = await isVerifiedOrAssignedDoctor(env, user);
    if (!allowed) {
      throw new AvailabilityError(
        403,
        "Doctor verification is required to save availability.",
      );
    }
    let body: { schedule?: unknown };
    try {
      body = (await request.json()) as { schedule?: unknown };
    } catch {
      throw new AvailabilityError(400, "Invalid JSON request body.");
    }
    const schedule = validateSchedule(body.schedule);
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO doctor_availability (user_id, schedule, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET schedule=excluded.schedule, updated_at=excluded.updated_at",
    )
      .bind(user, JSON.stringify(schedule), now)
      .run();
    return Response.json({
      providerId: user,
      schedule,
      updatedAt: now,
    });
  }

  throw new AvailabilityError(405, "Method not allowed.");
}
