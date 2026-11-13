import { doctors, nurses, initialState, Profile, Role } from "./data";
export { doctors, nurses, brand } from "./data";
export type { Profile, Role, Provider } from "./data";
export const roles: Role[] = ["Patient", "Family", "Doctor", "Nurse", "Admin"];
export type VisitStatus =
  "Requested" | "Confirmed" | "In Progress" | "Completed" | "Cancelled";
export type Visit = {
  id: string;
  providerId: string;
  date: string;
  time: string;
  service: string;
  frequency: string;
  address: string;
  reason: string;
  status: VisitStatus;
  checklist: boolean[];
  notes: string;
};
export type Medicine = {
  id: string;
  name: string;
  dosage: string;
  time: string;
  frequency: string;
  duration: string;
  logs: Record<string, "Taken" | "Skipped">;
  active: boolean;
};
export type RecordItem = {
  id: string;
  name: string;
  category: string;
  date: string;
  detail: string;
  uri?: string;
  mime?: string;
  fileId?: string;
  provenance?: {
    source: string;
    authorId: string;
    createdAt: string;
    version: number;
    updatedAt?: string;
  };
};
export type Consultation = {
  id: string;
  visitId: string;
  providerId: string;
  text: string;
  prescription: string;
  followUp: string;
};
export type Activity = {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
  visitId?: string;
};
export type Session = { role: Role; providerId: string; identifier: string };
export type ClinicState = {
  version: 2;
  profile: Profile & { address: string };
  onboarded: boolean;
  session: Session | null;
  visits: Visit[];
  medicines: Medicine[];
  records: RecordItem[];
  consultations: Consultation[];
  activities: Activity[];
  approved: string[];
  issues: { id: string; subject: string; resolved: boolean }[];
  sos: boolean;
};
export const providers = [...doctors, ...nurses];
let sequence = 0;
export const id = (prefix: string) =>
  prefix + "-" + Date.now() + "-" + ++sequence;
export const dayKey = (date = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate())
  );
};
export const nextDays = (count = 14) =>
  Array.from({ length: count }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i + 1);
    return dayKey(date);
  });
export const formatDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const times = [
  "09:00 AM",
  "10:00 AM",
  "11:30 AM",
  "02:00 PM",
  "04:30 PM",
];
export const providerFor = (visit: Visit) =>
  providers.find((p) => p.id === visit.providerId)!;
export const nursing = (providerId: string) => providerId.startsWith("n");
export const terminal = (v: Visit) =>
  ["Completed", "Cancelled"].includes(v.status);
export function createState(): ClinicState {
  return {
    version: 2,
    profile: { ...initialState.profile, address: "24, Green Park, Bengaluru" },
    onboarded: false,
    session: null,
    visits: [
      {
        id: "visit-welcome",
        providerId: "1",
        date: nextDays()[0],
        time: "10:00 AM",
        service: "Home Visit",
        frequency: "One visit",
        address: "24, Green Park, Bengaluru",
        reason: "Routine follow-up",
        status: "Confirmed",
        checklist: [false, false, false, false],
        notes: "",
      },
    ],
    medicines: initialState.medications.map((m) => ({
      ...m,
      logs: {},
      active: true,
    })),
    records: initialState.reports,
    consultations: [],
    activities: [
      {
        id: "welcome",
        title: "Welcome to your care space",
        body: "Your local demo is ready. Explore booking, visits and care updates.",
        date: new Date().toISOString(),
        read: false,
      },
    ],
    approved: providers.map((p) => p.id),
    issues: [],
    sos: false,
  };
}
export function migrate(raw: unknown): ClinicState {
  const base = createState();
  if (!raw || typeof raw !== "object") return base;
  const old = raw as Record<string, unknown>;
  if (old.version === 2) {
    if (
      !Array.isArray(old.visits) ||
      !Array.isArray(old.medicines) ||
      !Array.isArray(old.records)
    )
      throw new Error("Saved demo data is invalid.");
    return {
      ...base,
      ...old,
      profile: { ...base.profile, ...(old.profile as Profile) },
    } as ClinicState;
  }
  const previous = raw as typeof initialState;
  return {
    ...base,
    profile: { ...base.profile, ...previous.profile },
    records: previous.reports || base.records,
    visits: (previous.appointments || []).map((v) => ({
      id: v.id,
      providerId: providers.find((p) => p.name === v.provider)?.id || "1",
      date: v.date,
      time: v.time,
      service: v.type,
      frequency: "One visit",
      address: base.profile.address,
      reason: "Imported demo appointment",
      status: v.status,
      checklist: [false, false, false, false],
      notes: "",
    })),
    medicines: (previous.medications || initialState.medications).map((m) => ({
      ...m,
      logs:
        m.status === "Taken" || m.status === "Skipped"
          ? { [dayKey()]: m.status }
          : {},
      active: true,
    })),
    consultations: (previous.notes || []).map((n) => ({
      ...n,
      providerId: "1",
      visitId: "",
    })),
    sos: previous.sos || false,
  };
}
export type Action =
  | { type: "session"; session: Session | null }
  | { type: "profile"; profile: ClinicState["profile"]; onboarding?: boolean }
  | {
      type: "book";
      visit: Omit<Visit, "id" | "status" | "checklist" | "notes">;
    }
  | { type: "status"; visitId: string; status: VisitStatus }
  | { type: "reschedule"; visitId: string; date: string; time: string }
  | { type: "check"; visitId: string; index: number }
  | { type: "visitNote"; visitId: string; text: string }
  | {
      type: "consult";
      visitId: string;
      text: string;
      prescription: string;
      followUp: string;
      medicine?: Omit<Medicine, "id" | "logs" | "active">;
    }
  | { type: "medicine"; medicine: Omit<Medicine, "id" | "logs" | "active"> }
  | {
      type: "dose";
      medicineId: string;
      status: "Taken" | "Skipped" | "Pending";
    }
  | { type: "archiveMedicine"; medicineId: string }
  | { type: "record"; record: Omit<RecordItem, "id"> }
  | { type: "deleteRecord"; recordId: string }
  | { type: "read"; activityId?: string }
  | { type: "approve"; providerId: string }
  | { type: "issue"; subject: string }
  | { type: "resolve"; issueId: string }
  | { type: "sos"; active: boolean };
const createActivity = (
  s: ClinicState,
  title: string,
  body: string,
  visitId?: string,
  makeId: (prefix: string) => string = id,
) => ({
  ...s,
  activities: [
    {
      id: makeId("event"),
      title,
      body,
      visitId,
      date: new Date().toISOString(),
      read: false,
    },
    ...s.activities,
  ],
});
export const canRead = (s: ClinicState) =>
  !!s.session && (s.session.role !== "Family" || s.profile.consent);
export function visibleVisits(s: ClinicState) {
  if (!canRead(s)) return [];
  return [...s.visits]
    .filter(
      (v) =>
        !["Doctor", "Nurse"].includes(s.session!.role) ||
        v.providerId === s.session!.providerId,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        slotMinutes(a.time) - slotMinutes(b.time),
    );
}
function slotMinutes(time: string) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time);
  if (!match) return 0;
  return ((+match[1] % 12) + (match[3] === "PM" ? 12 : 0)) * 60 + +match[2];
}
function requireAccess(s: ClinicState, allowed: Role[]) {
  if (!s.session || !allowed.includes(s.session.role) || !canRead(s))
    throw new Error("This action is not available for your current role.");
}
function ownVisit(s: ClinicState, visitId: string) {
  const visit = s.visits.find((v) => v.id === visitId);
  if (!visit) throw new Error("Visit not found.");
  if (
    ["Doctor", "Nurse"].includes(s.session?.role || "") &&
    visit.providerId !== s.session?.providerId
  )
    throw new Error("This visit belongs to another care professional.");
  return visit;
}
export function transition(
  s: ClinicState,
  a: Action,
  makeId: (prefix: string) => string = id,
): ClinicState {
  const activity = (
    state: ClinicState,
    title: string,
    body: string,
    visitId?: string,
  ) => createActivity(state, title, body, visitId, makeId);
  if (a.type === "session") return { ...s, session: a.session };
  if (a.type === "profile") {
    requireAccess(s, ["Patient"]);
    if (
      !a.profile.name.trim() ||
      !/^\d+$/.test(a.profile.age) ||
      +a.profile.age < 1 ||
      +a.profile.age > 120
    )
      throw new Error("Enter a name and an age from 1 to 120.");
    return activity(
      { ...s, profile: a.profile, onboarded: a.onboarding || s.onboarded },
      "Profile updated",
      a.profile.consent
        ? "Family access is enabled."
        : "Family access is disabled.",
    );
  }
  if (a.type === "read")
    return {
      ...s,
      activities: s.activities.map((n) =>
        !a.activityId || n.id === a.activityId ? { ...n, read: true } : n,
      ),
    };
  if (a.type === "issue") {
    if (!a.subject.trim()) throw new Error("Describe the issue first.");
    return activity(
      {
        ...s,
        issues: [
          { id: makeId("issue"), subject: a.subject, resolved: false },
          ...s.issues,
        ],
      },
      "Support request created",
      a.subject,
    );
  }
  if (a.type === "approve" || a.type === "resolve") {
    requireAccess(s, ["Admin"]);
    return a.type === "approve"
      ? {
          ...s,
          approved: s.approved.includes(a.providerId)
            ? s.approved.filter((p) => p !== a.providerId)
            : [...s.approved, a.providerId],
        }
      : {
          ...s,
          issues: s.issues.map((i) =>
            i.id === a.issueId ? { ...i, resolved: true } : i,
          ),
        };
  }
  if (a.type === "book") {
    requireAccess(s, ["Patient", "Family"]);
    if (!s.approved.includes(a.visit.providerId))
      throw new Error("This professional is not accepting new bookings.");
    if (!nextDays(30).includes(a.visit.date) || !times.includes(a.visit.time))
      throw new Error("Select an available future date and time.");
    if (!a.visit.reason.trim())
      throw new Error("Tell your care team the reason for this visit.");
    if (a.visit.service !== "Online Consultation" && !a.visit.address.trim())
      throw new Error("Add your home visit address.");
    if (
      s.visits.some(
        (v) =>
          v.providerId === a.visit.providerId &&
          v.date === a.visit.date &&
          v.time === a.visit.time &&
          !terminal(v),
      )
    )
      throw new Error("This time is already booked. Please choose another.");
    const visit: Visit = {
      ...a.visit,
      id: makeId("visit"),
      status: nursing(a.visit.providerId) ? "Requested" : "Confirmed",
      checklist: [false, false, false, false],
      notes: "",
    };
    return activity(
      { ...s, visits: [...s.visits, visit] },
      visit.status === "Requested"
        ? "Care request sent"
        : "Appointment confirmed",
      providerFor(visit).name +
        " · " +
        formatDate(visit.date) +
        " · " +
        visit.time,
      visit.id,
    );
  }
  if (
    ["status", "reschedule", "check", "visitNote", "consult"].includes(a.type)
  ) {
    const action = a as Extract<Action, { visitId: string }>;
    const v = ownVisit(s, action.visitId);
    if (a.type === "status") {
      requireAccess(
        s,
        a.status === "Cancelled"
          ? ["Patient", "Family", "Admin"]
          : ["Doctor", "Nurse", "Admin"],
      );
      const allowed: Record<VisitStatus, VisitStatus[]> = {
        Requested: ["Confirmed", "Cancelled"],
        Confirmed: ["In Progress", "Cancelled"],
        "In Progress": ["Completed"],
        Completed: [],
        Cancelled: [],
      };
      if (!allowed[v.status].includes(a.status))
        throw new Error("This visit cannot move to that status.");
      if (
        a.status === "Completed" &&
        nursing(v.providerId) &&
        (!v.checklist.every(Boolean) || !v.notes.trim())
      )
        throw new Error("Complete the care checklist and visit notes first.");
      if (
        a.status === "Completed" &&
        !nursing(v.providerId) &&
        !s.consultations.some((n) => n.visitId === v.id)
      )
        throw new Error("Save consultation notes before completing the visit.");
      return activity(
        {
          ...s,
          visits: s.visits.map((item) =>
            item.id === v.id ? { ...item, status: a.status } : item,
          ),
        },
        "Visit " + a.status.toLowerCase(),
        providerFor(v).name + " · " + formatDate(v.date),
        v.id,
      );
    }
    if (a.type === "reschedule") {
      requireAccess(s, ["Patient", "Family", "Admin"]);
      if (!["Requested", "Confirmed"].includes(v.status))
        throw new Error("Only upcoming visits can be rescheduled.");
      if (!nextDays(30).includes(a.date) || !times.includes(a.time))
        throw new Error("Choose an available future date and time.");
      if (
        s.visits.some(
          (item) =>
            item.id !== v.id &&
            item.providerId === v.providerId &&
            item.date === a.date &&
            item.time === a.time &&
            !terminal(item),
        )
      )
        throw new Error("That slot is already booked.");
      return activity(
        {
          ...s,
          visits: s.visits.map((item) =>
            item.id === v.id ? { ...item, date: a.date, time: a.time } : item,
          ),
        },
        "Appointment rescheduled",
        formatDate(a.date) + " · " + a.time,
        v.id,
      );
    }
    if (a.type === "check" || a.type === "visitNote") {
      requireAccess(s, ["Nurse"]);
      if (v.status !== "In Progress")
        throw new Error("Start the visit before updating care tasks.");
      if (a.type === "check" && (a.index < 0 || a.index > 3))
        throw new Error("Invalid care task.");
      return {
        ...s,
        visits: s.visits.map((item) =>
          item.id !== v.id
            ? item
            : a.type === "visitNote"
              ? { ...item, notes: a.text }
              : {
                  ...item,
                  checklist: item.checklist.map((value, i) =>
                    i === a.index ? !value : value,
                  ),
                },
        ),
      };
    }
    if (a.type === "consult") {
      requireAccess(s, ["Doctor"]);
      if (v.status !== "In Progress" || !a.text.trim())
        throw new Error("Start this visit and add consultation notes.");
      if (s.consultations.some((n) => n.visitId === v.id))
        throw new Error(
          "Consultation notes have already been saved for this visit.",
        );
      if (a.followUp && !nextDays(30).includes(a.followUp))
        throw new Error("Choose a follow-up date within the next 30 days.");
      let next = {
        ...s,
        consultations: [
          {
            id: makeId("note"),
            visitId: v.id,
            providerId: v.providerId,
            text: a.text,
            prescription: a.prescription,
            followUp: a.followUp,
          },
          ...s.consultations,
        ],
      };
      if (a.medicine) {
        validateMedicine(a.medicine);
        next = {
          ...next,
          medicines: [
            { ...a.medicine, id: makeId("med"), logs: {}, active: true },
            ...next.medicines,
          ],
        };
      }
      return activity(
        next,
        "Your care plan is ready",
        "Consultation notes" +
          (a.medicine ? ", a medicine reminder" : "") +
          (a.followUp ? " and a follow-up recommendation" : "") +
          " added by " +
          providerFor(v).name +
          ".",
        v.id,
      );
    }
  }
  if (
    a.type === "medicine" ||
    a.type === "dose" ||
    a.type === "archiveMedicine"
  ) {
    requireAccess(s, ["Patient", "Family"]);
    if (a.type === "medicine") {
      validateMedicine(a.medicine);
      return activity(
        {
          ...s,
          medicines: [
            { ...a.medicine, id: makeId("med"), logs: {}, active: true },
            ...s.medicines,
          ],
        },
        "Medicine reminder added",
        a.medicine.name + " · " + a.medicine.time,
      );
    }
    if (a.type === "archiveMedicine")
      return {
        ...s,
        medicines: s.medicines.map((m) =>
          m.id === a.medicineId ? { ...m, active: false } : m,
        ),
      };
    return {
      ...s,
      medicines: s.medicines.map((m) => {
        if (m.id !== a.medicineId) return m;
        const logs = { ...m.logs };
        if (a.status === "Pending") delete logs[dayKey()];
        else logs[dayKey()] = a.status;
        return { ...m, logs };
      }),
    };
  }
  if (a.type === "record" || a.type === "deleteRecord") {
    requireAccess(s, ["Patient", "Admin"]);
    return a.type === "record"
      ? activity(
          {
            ...s,
            records: [{ ...a.record, id: makeId("record") }, ...s.records],
          },
          "Document added",
          a.record.name,
        )
      : { ...s, records: s.records.filter((r) => r.id !== a.recordId) };
  }
  if (a.type === "sos") {
    requireAccess(s, ["Patient", "Family"]);
    return activity(
      { ...s, sos: a.active },
      a.active ? "Demo SOS activated" : "Demo SOS ended",
      "Simulation only. No external contact or service was triggered.",
    );
  }
  return s;
}
function validateMedicine(m: Omit<Medicine, "id" | "logs" | "active">) {
  if (
    !m.name.trim() ||
    !m.dosage.trim() ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)
  )
    throw new Error(
      "Enter the prescribed medicine, dosage and a valid 24-hour time (HH:MM).",
    );
}
