import type { ClinicState } from "../src/clinic";
import {
  buildReminderPlan,
  readReminderPreferences,
  type ReminderPlan,
} from "../src/reminder-plan";
import { localParts, nextDaily } from "./reminder-time";
export type ReminderEnv = {
  DB: D1Database;
  REMINDERS: DurableObjectNamespace;
  EXPO_ACCESS_TOKEN?: string;
};
type Device = {
  id: string;
  user_id: string;
  session_id: string;
  space_id: string;
  owner_tag: string;
  token: string | null;
  mode: string;
  timezone: string;
  active_since: number;
};
type Delivery = {
  id: string;
  device_id: string;
  medicine_id: string;
  due_at: number;
  attempts: number;
  status: string;
  ticket: string | null;
  next_attempt: number;
};
const json = (data: unknown, status = 200) => Response.json(data, { status });
class PushRateLimitError extends Error {}
export function reminderStub(env: ReminderEnv, user: string, space: string) {
  return env.REMINDERS.get(
    env.REMINDERS.idFromName(JSON.stringify([user, space])),
  );
}
export function wakeReminders(env: ReminderEnv, user: string, space: string) {
  return reminderStub(env, user, space).fetch("https://reminders/internal", {
    method: "POST",
    body: JSON.stringify({ user, space, operation: "wake" }),
  });
}
// One object per patient/care space serializes settings, device changes and alarm work.
export class MedicineReminderScheduler {
  private work: Promise<unknown> = Promise.resolve();
  constructor(
    private ctx: DurableObjectState,
    private env: ReminderEnv,
  ) {}
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.work.catch(() => {}).then(fn);
    this.work = result;
    return result;
  }
  fetch(request: Request) {
    return this.exclusive(async () => {
      const input = (await request.json()) as {
        user: string;
        space: string;
        session: string;
        operation: string;
        data?: Record<string, unknown>;
      };
      await this.ctx.storage.put("identity", {
        user: input.user,
        space: input.space,
      });
      const { user, space, session, operation } = input;
      const data = input.data || {};
      if (operation === "read") {
        const row = await this.env.DB.prepare(
          "SELECT preferences,revision FROM reminder_settings WHERE user_id=? AND space_id=?",
        )
          .bind(user, space)
          .first<{ preferences: string; revision: number }>();
        return json({
          preferences: row ? readReminderPreferences(row.preferences) : null,
          revision: row?.revision || 0,
        });
      }
      if (operation === "save") {
        const raw = JSON.stringify(data.preferences);
        if (!raw || raw.length > 16000 || typeof data.revision !== "number")
          return json({ error: "Invalid reminder settings." }, 400);
        const parsed = readReminderPreferences(raw);
        if (JSON.stringify(parsed) !== raw)
          return json({ error: "Invalid reminder settings or times." }, 400);
        const state = await this.state(space);
        buildReminderPlan("validate", state?.medicines || [], parsed);
        const saved =
          data.revision === 0
            ? await this.env.DB.prepare(
                "INSERT OR IGNORE INTO reminder_settings(user_id,space_id,preferences) VALUES (?,?,?)",
              )
                .bind(user, space, raw)
                .run()
            : await this.env.DB.prepare(
                "UPDATE reminder_settings SET preferences=?,revision=revision+1 WHERE user_id=? AND space_id=? AND revision=?",
              )
                .bind(raw, user, space, data.revision)
                .run();
        if (!saved.meta.changes)
          return json(
            {
              error:
                "Reminder settings changed on another device. Refresh and try again.",
            },
            409,
          );
      }
      if (operation === "device") {
        const { id, mode, timezone, ownerTag, token } = data;
        if (
          typeof id !== "string" ||
          !/^[a-f0-9-]{36}$/.test(id) ||
          !["local", "server", "off"].includes(String(mode)) ||
          typeof timezone !== "string" ||
          typeof ownerTag !== "string" ||
          !/^[a-f0-9]{24}$/.test(ownerTag)
        )
          return json({ error: "Invalid device settings." }, 400);
        try {
          localParts(Date.now(), timezone);
        } catch {
          return json({ error: "Choose a valid timezone." }, 400);
        }
        if (
          mode === "server" &&
          (typeof token !== "string" ||
            !/^(Expo(nent)?PushToken)\[[A-Za-z0-9_-]+\]$/.test(token))
        )
          return json({ error: "A valid Expo push token is required." }, 400);
        const owner = await this.env.DB.prepare(
          "SELECT user_id FROM reminder_devices WHERE id=?",
        )
          .bind(id)
          .first<{ user_id: string }>();
        if (owner && owner.user_id !== user)
          return json(
            { error: "This device registration belongs to another account." },
            403,
          );
        const count = await this.env.DB.prepare(
          "SELECT COUNT(*) AS count FROM reminder_devices WHERE user_id=? AND id<>?",
        )
          .bind(user, id)
          .first<{ count: number }>();
        if ((count?.count || 0) >= 10)
          return json(
            { error: "Remove an older device before registering another." },
            400,
          );
        const registered = await this.env.DB.prepare(
          "INSERT INTO reminder_devices(id,user_id,session_id,space_id,owner_tag,token,mode,timezone,updated_at,active_since) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM reminder_revoked_sessions WHERE user_id=? AND session_id=?) ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,space_id=excluded.space_id,owner_tag=excluded.owner_tag,token=excluded.token,mode=excluded.mode,timezone=excluded.timezone,updated_at=excluded.updated_at,active_since=CASE WHEN reminder_devices.mode<>excluded.mode OR reminder_devices.timezone<>excluded.timezone OR reminder_devices.space_id<>excluded.space_id THEN excluded.active_since ELSE reminder_devices.active_since END",
        )
          .bind(
            id,
            user,
            session,
            space,
            ownerTag,
            mode === "server" ? token : null,
            mode,
            timezone,
            Date.now(),
            Date.now(),
            user,
            session,
          )
          .run();
        if (!registered.meta.changes)
          return json(
            {
              error:
                "This reminder session was signed out. Sign in again to enable cloud notifications.",
            },
            403,
          );
      }
      if (operation === "test") {
        const device = await this.env.DB.prepare(
          "SELECT * FROM reminder_devices WHERE id=? AND user_id=? AND session_id=? AND space_id=? AND mode='server'",
        )
          .bind(String(data.id), user, session, space)
          .first<Device>();
        if (!device)
          return json(
            { error: "Enable server notifications on this phone first." },
            400,
          );
        const recent = await this.env.DB.prepare(
          "SELECT 1 AS found FROM reminder_deliveries WHERE device_id=? AND medicine_id='test' AND created_at>?",
        )
          .bind(device.id, Date.now() - 60000)
          .first();
        if (recent)
          return json(
            { error: "Wait a minute before sending another test." },
            429,
          );
        await this.enqueue(
          device,
          "test",
          Date.now(),
          "test:" + crypto.randomUUID(),
        );
      }
      // Push work runs in an alarm, never on the mobile request's critical path.
      await this.ctx.storage.setAlarm(Date.now() + 1000);
      return json({
        ok: true,
        revision: operation === "save" ? Number(data.revision) + 1 : undefined,
      });
    });
  }
  alarm() {
    return this.exclusive(async () => {
      const identity = await this.ctx.storage.get<{
        user: string;
        space: string;
      }>("identity");
      if (!identity) return;
      // Keep a recovery alarm even if a database/provider operation fails.
      await this.ctx.storage.setAlarm(Date.now() + 60000);
      await this.tick(identity.user, identity.space);
    });
  }
  private async state(space: string) {
    const row = await this.env.DB.prepare(
      "SELECT state FROM care_spaces WHERE id=?",
    )
      .bind(space)
      .first<{ state: string }>();
    return row ? (JSON.parse(row.state) as ClinicState) : null;
  }
  private async enqueue(
    device: Device,
    medicine: string,
    due: number,
    occurrence: string,
  ) {
    await this.env.DB.prepare(
      "INSERT OR IGNORE INTO reminder_deliveries(id,device_id,user_id,space_id,medicine_id,due_at,status,next_attempt,created_at) VALUES (?,?,?,?,?,?,'pending',?,?)",
    )
      .bind(
        device.id + ":" + medicine + ":" + occurrence,
        device.id,
        device.user_id,
        device.space_id,
        medicine,
        due,
        Date.now(),
        Date.now(),
      )
      .run();
  }
  private async api(path: string, payload: unknown) {
    const response = await fetch("https://exp.host/--/api/v2/push/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.env.EXPO_ACCESS_TOKEN
          ? { Authorization: "Bearer " + this.env.EXPO_ACCESS_TOKEN }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 429)
      throw new PushRateLimitError("Push rate limit");
    if (!response.ok) throw new Error("Push provider unavailable");
    return (await response.json()) as { data?: unknown; errors?: unknown };
  }
  private async tick(user: string, space: string) {
    const now = Date.now();
    await this.ctx.storage.setAlarm(now + 60000);
    const prefsRow = await this.env.DB.prepare(
      "SELECT preferences FROM reminder_settings WHERE user_id=? AND space_id=?",
    )
      .bind(user, space)
      .first<{ preferences: string }>();
    const prefs = readReminderPreferences(prefsRow?.preferences || null);
    const state = await this.state(space);
    // Re-check membership on every execution; clients never provide medicine content.
    const member = await this.env.DB.prepare(
      "SELECT 1 FROM memberships WHERE user_id=? AND space_id=? AND role='Patient'",
    )
      .bind(user, space)
      .first();
    const devices = member
      ? (
          await this.env.DB.prepare(
            "SELECT * FROM reminder_devices WHERE user_id=? AND space_id=? AND mode='server' AND token IS NOT NULL",
          )
            .bind(user, space)
            .all<Device>()
        ).results
      : [];
    const plans = buildReminderPlan("server", state?.medicines || [], prefs);
    let next = Infinity;
    for (const device of devices) {
      for (const plan of plans) {
        const time = `${String(plan.hour).padStart(2, "0")}:${String(plan.minute).padStart(2, "0")}`;
        // Catch up briefly after a delayed alarm, never send hours-old doses.
        const due = nextDaily(now - 15 * 60000, time, device.timezone);
        if (due <= now && due >= device.active_since)
          await this.enqueue(
            device,
            plan.medicineId,
            due,
            localParts(due, device.timezone).date + ":" + time,
          );
        next = Math.min(next, nextDaily(now, time, device.timezone));
      }
    }
    const pending = (
      await this.env.DB.prepare(
        "SELECT * FROM reminder_deliveries WHERE user_id=? AND space_id=? AND status IN ('pending','sending') ORDER BY due_at LIMIT 100",
      )
        .bind(user, space)
        .all<Delivery>()
    ).results;
    const batch: { delivery: Delivery; device: Device; plan?: ReminderPlan }[] =
      [];
    for (const delivery of pending) {
      const device = devices.find((d) => d.id === delivery.device_id);
      const dueTime = device
        ? localParts(delivery.due_at, device.timezone).time
        : "";
      const plan = plans.find(
        (p) =>
          p.medicineId === delivery.medicine_id &&
          `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` ===
            dueTime,
      );
      if (
        !device ||
        (delivery.medicine_id !== "test" && !plan) ||
        now - delivery.due_at > 15 * 60000
      ) {
        await this.finish(delivery.id, "cancelled", null);
        continue;
      }
      if (delivery.next_attempt > now) {
        next = Math.min(next, delivery.next_attempt);
        continue;
      }
      // Persist before the network call. A crash here is uncertain, so do not blindly resend.
      if (delivery.status === "sending") {
        await this.finish(
          delivery.id,
          "uncertain",
          "Provider result was not recorded",
        );
        continue;
      }
      if (delivery.attempts >= 4) {
        await this.finish(delivery.id, "failed", "Retry limit reached");
        continue;
      }
      batch.push({ delivery, device, plan });
    }
    if (batch.length) {
      await this.env.DB.batch(
        batch.map(({ delivery }) =>
          this.env.DB.prepare(
            "UPDATE reminder_deliveries SET status='sending',attempts=attempts+1 WHERE id=?",
          ).bind(delivery.id),
        ),
      );
      try {
        const result = await this.api(
          "send",
          batch.map(({ delivery, device, plan }) => ({
            to: device.token,
            title: plan?.title || "BLOOM MED reminders are ready",
            body:
              plan?.body || "Your phone can receive BLOOM MED notifications.",
            sound: "default",
            channelId: "bloom-medicine",
            ttl: Math.max(1, 900 - Math.floor((now - delivery.due_at) / 1000)),
            data: {
              kind: "bloom-medicine",
              owner: device.owner_tag,
              medicineId: delivery.medicine_id,
              occurrenceId: delivery.id,
            },
          })),
        );
        const tickets = result.data as
          | { status: string; id?: string; details?: { error?: string } }[]
          | undefined;
        for (const [index, { delivery, device }] of batch.entries()) {
          const ticket = tickets?.[index];
          if (ticket?.status === "ok" && ticket.id) {
            await this.env.DB.prepare(
              "UPDATE reminder_deliveries SET status='accepted',ticket=?,receipt_at=? WHERE id=?",
            )
              .bind(ticket.id, now + 15 * 60000, delivery.id)
              .run();
            next = Math.min(next, now + 15 * 60000);
          } else if (ticket?.details?.error === "MessageRateExceeded") {
            const retry = now + 60000 * Math.pow(2, delivery.attempts);
            await this.env.DB.prepare(
              "UPDATE reminder_deliveries SET status='pending',next_attempt=?,error='MessageRateExceeded' WHERE id=?",
            )
              .bind(retry, delivery.id)
              .run();
            next = Math.min(next, retry);
          } else {
            const error = ticket?.details?.error || "Invalid push ticket";
            await this.finish(delivery.id, "failed", error);
            if (error === "DeviceNotRegistered") await this.disable(device.id);
          }
        }
      } catch (error) {
        // A timeout can occur after acceptance. Retrying could duplicate the medicine alert.
        for (const { delivery } of batch) {
          if (error instanceof PushRateLimitError) {
            const retry = now + 60000 * Math.pow(2, delivery.attempts);
            await this.env.DB.prepare(
              "UPDATE reminder_deliveries SET status='pending',next_attempt=?,error='ProviderRateLimit' WHERE id=?",
            )
              .bind(retry, delivery.id)
              .run();
            next = Math.min(next, retry);
          } else
            await this.finish(
              delivery.id,
              "uncertain",
              "Push request outcome unknown",
            );
        }
      }
    }
    const receipts = (
      await this.env.DB.prepare(
        "SELECT * FROM reminder_deliveries WHERE user_id=? AND space_id=? AND status='accepted' AND receipt_at<=? LIMIT 100",
      )
        .bind(user, space, now)
        .all<Delivery>()
    ).results;
    if (receipts.length) {
      try {
        const result = await this.api("getReceipts", {
          ids: receipts.map((r) => r.ticket),
        });
        const data = result.data as
          | Record<string, { status: string; details?: { error?: string } }>
          | undefined;
        for (const row of receipts) {
          const receipt = data?.[row.ticket!];
          if (receipt) {
            await this.finish(
              row.id,
              receipt.status === "ok" ? "provider_received" : "failed",
              receipt.details?.error || null,
            );
            if (receipt.details?.error === "DeviceNotRegistered")
              await this.disable(row.device_id);
          } else if (now - row.due_at > 23 * 3600000)
            await this.finish(row.id, "receipt_missing", "No provider receipt");
          else
            await this.env.DB.prepare(
              "UPDATE reminder_deliveries SET receipt_at=? WHERE id=?",
            )
              .bind(now + 15 * 60000, row.id)
              .run();
        }
      } catch {
        await this.env.DB.batch(
          receipts.map((row) =>
            this.env.DB.prepare(
              "UPDATE reminder_deliveries SET receipt_at=? WHERE id=?",
            ).bind(now + 60000, row.id),
          ),
        );
        next = Math.min(next, now + 60000);
      }
    }
    const outstanding = await this.env.DB.prepare(
      "SELECT MIN(CASE WHEN status='accepted' THEN receipt_at ELSE next_attempt END) AS wake FROM reminder_deliveries WHERE user_id=? AND space_id=? AND status IN ('pending','sending','accepted')",
    )
      .bind(user, space)
      .first<{ wake: number | null }>();
    if (outstanding?.wake) next = Math.min(next, outstanding.wake);
    await this.env.DB.prepare(
      "DELETE FROM reminder_deliveries WHERE user_id=? AND space_id=? AND created_at<?",
    )
      .bind(user, space, now - 30 * 86400000)
      .run();
    const retention = await this.env.DB.prepare(
      "SELECT MIN(created_at) AS oldest FROM reminder_deliveries WHERE user_id=? AND space_id=?",
    )
      .bind(user, space)
      .first<{ oldest: number | null }>();
    if (retention?.oldest)
      next = Math.min(next, retention.oldest + 30 * 86400000 + 1);
    if (Number.isFinite(next))
      await this.ctx.storage.setAlarm(Math.max(now + 1000, next));
    else await this.ctx.storage.deleteAlarm();
  }
  private finish(id: string, status: string, error: string | null) {
    return this.env.DB.prepare(
      "UPDATE reminder_deliveries SET status=?,error=? WHERE id=?",
    )
      .bind(status, error, id)
      .run();
  }
  private disable(id: string) {
    return this.env.DB.prepare(
      "UPDATE reminder_devices SET mode='off',token=NULL WHERE id=?",
    )
      .bind(id)
      .run();
  }
}
