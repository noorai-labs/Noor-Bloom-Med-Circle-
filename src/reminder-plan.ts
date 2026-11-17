import type { Medicine } from "./clinic";
export type ReminderPreferences = {
  enabled: boolean;
  showNames: boolean;
  medicines: Record<string, { enabled: boolean; times: string[] }>;
};
export const defaultReminderPreferences: ReminderPreferences = {
  enabled: false,
  showNames: false,
  medicines: {},
};
export type ReminderPlan = {
  identifier: string;
  hour: number;
  minute: number;
  title: string;
  body: string;
  medicineId: string;
  owner: string;
  signature: string;
};
export function parseReminderTimes(value: string): string[] {
  const values = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    !values.length ||
    values.length > 6 ||
    values.some((v) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
  )
    throw new Error(
      "Enter 1 to 6 times in 24-hour format, for example 08:00, 20:00.",
    );
  return [...new Set(values)].sort();
}
export function reminderTimes(
  medicine: Medicine,
  prefs: ReminderPreferences,
): string[] {
  const configured = prefs.medicines[medicine.id];
  if (configured) return configured.times;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(medicine.time) ? [medicine.time] : [];
}
export function buildReminderPlan(
  owner: string,
  medicines: Medicine[],
  prefs: ReminderPreferences,
): ReminderPlan[] {
  if (!owner || !prefs.enabled) return [];
  const plan: ReminderPlan[] = [];
  for (const medicine of medicines) {
    if (!medicine.active || prefs.medicines[medicine.id]?.enabled === false)
      continue;
    for (const time of [...new Set(reminderTimes(medicine, prefs))]) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        throw new Error(
          "A medicine has an invalid reminder time. Edit its alert times.",
        );
      const [hour, minute] = time.split(":").map(Number);
      const title = "BLOOM MED medicine reminder";
      const body = prefs.showNames
        ? "Time for " + medicine.name + ". Follow your prescribed instructions."
        : "It is time for your scheduled medicine. Open BLOOM MED to view your routine.";
      plan.push({
        identifier:
          "bloom-med:" +
          owner +
          ":" +
          encodeURIComponent(medicine.id) +
          ":" +
          time,
        hour,
        minute,
        title,
        body,
        medicineId: medicine.id,
        owner,
        signature: JSON.stringify([hour, minute, title, body]),
      });
    }
  }
  if (plan.length > 48)
    throw new Error(
      "This phone supports up to 48 BLOOM MED daily alerts. Reduce the number of alert times.",
    );
  return plan;
}
export function readReminderPreferences(
  raw: string | null,
): ReminderPreferences {
  if (!raw) return { ...defaultReminderPreferences, medicines: {} };
  try {
    const input = JSON.parse(raw);
    const medicines: ReminderPreferences["medicines"] = {};
    for (const [id, value] of Object.entries(input.medicines || {})) {
      const v = value as { enabled?: boolean; times?: unknown };
      if (Array.isArray(v.times) && v.times.every((t) => typeof t === "string"))
        medicines[id] = {
          enabled: v.enabled !== false,
          times: parseReminderTimes(v.times.join(",")),
        };
    }
    return {
      enabled: input.enabled === true,
      showNames: input.showNames === true,
      medicines,
    };
  } catch {
    return { ...defaultReminderPreferences, medicines: {} };
  }
}
