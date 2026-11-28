const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(__dirname, "..", "src", name + ".ts");
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: (file) => (file.startsWith("./") ? load(file.slice(2)) : require(file)),
      Date,
      JSON,
    },
    { filename: file },
  );
  cache.set(name, module.exports);
  return module.exports;
}
const { createState, transition, nextDays, visibleVisits, dayKey, migrate } =
  load("clinic");
const { initialState } = load("data");
const { cloudTransition } = load("cloud-transition");
let state = createState();
const session = (role, providerId = "") => {
  state = transition(state, {
    type: "session",
    session: { role, providerId, identifier: "demo@example.com" },
  });
};
const change = (action) => {
  state = transition(state, action);
};
session("Patient");
const before = state;
change({
  type: "book",
  visit: {
    providerId: "n1",
    date: nextDays()[0],
    time: "09:00 AM",
    service: "Home nursing",
    frequency: "2 hours",
    address: state.profile.address,
    reason: "Demo care support",
  },
});
const nurseVisit = state.visits.at(-1).id;
assert.equal(before.visits.length, 1, "State must remain immutable");
assert.equal(state.visits.at(-1).status, "Requested");
assert.throws(
  () => transition(state, { type: "book", visit: { ...state.visits.at(-1) } }),
  /already booked/,
);
assert.throws(
  () =>
    transition(state, {
      type: "book",
      visit: { ...state.visits.at(-1), date: "2020-01-01" },
    }),
  /future/,
);
session("Family");
assert.equal(
  visibleVisits(state).length,
  0,
  "Family must not see records before consent",
);
assert.throws(
  () => transition(state, { type: "dose", medicineId: "m1", status: "Taken" }),
  /current role/,
);
session("Patient");
change({ type: "profile", profile: { ...state.profile, consent: true } });
session("Family");
assert.equal(visibleVisits(state).length, 2);
session("Nurse", "n2");
assert.equal(
  visibleVisits(state).length,
  0,
  "Care queue is scoped to provider",
);
assert.throws(
  () =>
    transition(state, {
      type: "status",
      visitId: nurseVisit,
      status: "Confirmed",
    }),
  /another care professional/,
);
session("Nurse", "n1");
assert.equal(visibleVisits(state).length, 1);
change({ type: "status", visitId: nurseVisit, status: "Confirmed" });
change({ type: "status", visitId: nurseVisit, status: "In Progress" });
assert.throws(
  () =>
    transition(state, {
      type: "status",
      visitId: nurseVisit,
      status: "Completed",
    }),
  /checklist/,
);
for (let index = 0; index < 4; index++)
  change({ type: "check", visitId: nurseVisit, index });
change({
  type: "visitNote",
  visitId: nurseVisit,
  text: "Demo checklist completed",
});
change({ type: "status", visitId: nurseVisit, status: "Completed" });
assert.equal(state.visits.at(-1).status, "Completed");
assert.throws(
  () => transition(state, { type: "check", visitId: nurseVisit, index: 0 }),
  /Start the visit/,
);
session("Doctor", "1");
const doctorVisit = state.visits[0].id;
change({ type: "status", visitId: doctorVisit, status: "In Progress" });
assert.throws(
  () =>
    transition(state, {
      type: "status",
      visitId: doctorVisit,
      status: "Completed",
    }),
  /consultation notes/,
);
change({
  type: "consult",
  visitId: doctorVisit,
  text: "Demo follow-up discussed",
  prescription: "Demo instructions",
  followUp: nextDays()[6],
  medicine: {
    name: "Demo prescribed medicine",
    dosage: "As prescribed",
    time: "08:00",
    frequency: "Once daily",
    duration: "7 days",
  },
});
assert.equal(state.consultations.length, 1);
const restrictedSnapshot = {
  ...state,
  consultations: [],
  savedConsultationVisitIds: [doctorVisit],
};
const optimisticCompletion = cloudTransition(
  restrictedSnapshot,
  { type: "status", visitId: doctorVisit, status: "Completed" },
  "complete",
);
assert.equal(optimisticCompletion.visits[0].status, "Completed");
assert.equal(
  state.medicines.length,
  3,
  "Doctor plan must add a patient reminder",
);
assert.throws(
  () =>
    transition(state, {
      type: "consult",
      visitId: doctorVisit,
      text: "Duplicate",
      prescription: "",
      followUp: "",
    }),
  /already been saved/,
);
change({ type: "status", visitId: doctorVisit, status: "Completed" });
session("Patient");
change({ type: "dose", medicineId: state.medicines[0].id, status: "Taken" });
assert.equal(state.medicines[0].logs[dayKey()], "Taken");
change({ type: "dose", medicineId: state.medicines[0].id, status: "Pending" });
assert.equal(state.medicines[0].logs[dayKey()], undefined);
assert.throws(
  () =>
    transition(state, {
      type: "medicine",
      medicine: {
        name: "Test",
        dosage: "Test",
        time: "88:00",
        frequency: "",
        duration: "",
      },
    }),
  /valid 24-hour time/,
);
change({
  type: "book",
  visit: {
    providerId: "2",
    date: nextDays()[1],
    time: "02:00 PM",
    service: "Online Consultation",
    frequency: "One visit",
    address: "",
    reason: "Demo follow-up",
  },
});
const anotherVisit = state.visits.at(-1).id;
change({
  type: "reschedule",
  visitId: anotherVisit,
  date: nextDays()[2],
  time: "04:30 PM",
});
assert.equal(state.visits.at(-1).date, nextDays()[2]);
change({ type: "status", visitId: anotherVisit, status: "Cancelled" });
assert.throws(
  () =>
    transition(state, {
      type: "reschedule",
      visitId: anotherVisit,
      date: nextDays()[3],
      time: "09:00 AM",
    }),
  /upcoming/,
);
change({ type: "sos", active: true });
assert.equal(state.sos, true);
change({ type: "sos", active: false });
change({
  type: "record",
  record: {
    name: "Demo.pdf",
    category: "Lab report",
    date: dayKey(),
    detail: "Demo attachment",
  },
});
assert.equal(state.records[0].name, "Demo.pdf");
change({ type: "deleteRecord", recordId: state.records[0].id });
change({ type: "issue", subject: "Demo support request" });
session("Admin");
change({ type: "resolve", issueId: state.issues[0].id });
assert.equal(state.issues[0].resolved, true);
change({ type: "approve", providerId: "2" });
session("Patient");
assert.throws(
  () =>
    transition(state, {
      type: "book",
      visit: {
        providerId: "2",
        date: nextDays()[1],
        time: "09:00 AM",
        service: "Home Visit",
        frequency: "One visit",
        address: "Demo",
        reason: "Demo",
      },
    }),
  /not accepting/,
);
change({ type: "read" });
assert.ok(state.activities.every((n) => n.read));
assert.equal(
  migrate(JSON.parse(JSON.stringify(state))).visits.length,
  state.visits.length,
  "State must round-trip through JSON persistence",
);
assert.equal(
  migrate(initialState).visits.length,
  1,
  "Legacy prototype data must migrate",
);
assert.equal(migrate(initialState).records.length, 2);
assert.throws(() => migrate({ version: 2 }), /invalid/);
console.log(
  "Passed: complete nurse & doctor journeys, linked prescriptions, provider scope, family consent, booking conflicts, rescheduling, daily doses, records, support, SOS, approvals and persistence migration.",
);
