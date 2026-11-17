const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require: (name) => imports[name], Error },
  );
  return exports;
}
const planner = load("src/reminder-plan.ts");
const { nextDaily } = load("backend/reminder-time.ts");
assert.equal(
  new Date(
    nextDaily(Date.parse("2026-10-25T00:00:00Z"), "08:00", "Asia/Kolkata"),
  ).toISOString(),
  "2026-10-25T02:30:00.000Z",
);
assert.equal(
  new Date(
    nextDaily(Date.parse("2026-03-08T06:00:00Z"), "02:30", "America/New_York"),
  ).toISOString(),
  "2026-03-09T06:30:00.000Z",
  "skip nonexistent spring DST time",
);
assert.equal(
  new Date(
    nextDaily(Date.parse("2026-11-01T05:45:00Z"), "01:30", "America/New_York"),
  ).toISOString(),
  "2026-11-01T06:30:00.000Z",
  "resolve second fall DST time; occurrence ledger deduplicates the local date",
);
const medicine = {
  id: "med1",
  name: "Private medicine",
  active: true,
  time: "08:00",
};
const prefs = { enabled: true, showNames: false, medicines: {} };
const plan = planner.buildReminderPlan("owner1", [medicine], prefs);
assert.equal(plan.length, 1);
assert.equal(plan[0].hour, 8);
assert.ok(!plan[0].body.includes(medicine.name));
assert.equal(
  planner.buildReminderPlan("owner1", [{ ...medicine, active: false }], prefs)
    .length,
  0,
);
assert.equal(
  planner.buildReminderPlan("owner1", [medicine], { ...prefs, enabled: false })
    .length,
  0,
);
assert.equal(
  planner.buildReminderPlan("owner1", [medicine], {
    ...prefs,
    medicines: { med1: { enabled: false, times: ["08:00"] } },
  }).length,
  0,
);
assert.notEqual(
  planner.buildReminderPlan("owner2", [medicine], prefs)[0].identifier,
  plan[0].identifier,
);
assert.equal(
  planner.parseReminderTimes("20:00, 08:00, 08:00").join(","),
  "08:00,20:00",
);
for (const value of ["", "24:00", "8:00", "08:60"])
  assert.throws(() => planner.parseReminderTimes(value));
assert.equal(planner.readReminderPreferences("{broken").enabled, false);
assert.equal(
  planner.buildReminderPlan("owner1", [{ ...medicine, time: "Morning" }], prefs)
    .length,
  0,
);
assert.throws(() =>
  planner.buildReminderPlan(
    "owner1",
    Array.from({ length: 49 }, (_, i) => ({ ...medicine, id: String(i) })),
    prefs,
  ),
);
(async () => {
  const scheduled = new Map([
    ["unrelated", { identifier: "unrelated", content: {} }],
  ]);
  let created = 0;
  const notifications = {
    setNotificationHandler: () => {},
    SchedulableTriggerInputTypes: { DAILY: "daily" },
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    getPresentedNotificationsAsync: async () => [],
    cancelScheduledNotificationAsync: async (id) => scheduled.delete(id),
    scheduleNotificationAsync: async (request) => {
      created++;
      scheduled.set(request.identifier, request);
    },
  };
  const service = load("src/reminder-service.ts", {
    "react-native": { Platform: { OS: "android" } },
    "expo-notifications": notifications,
  });
  await service.reconcileReminders(plan);
  await service.reconcileReminders(plan);
  assert.equal(created, 1, "sync must not duplicate unchanged alerts");
  assert.equal(scheduled.get(plan[0].identifier).trigger.type, "daily");
  await service.reconcileReminders([
    { ...plan[0], signature: "changed", body: "Changed" },
  ]);
  assert.equal(created, 2, "changed content must replace the alert");
  await service.clearMedicineReminders();
  assert.equal(
    scheduled.size,
    1,
    "sign-out/archive must cancel medicine alerts",
  );
  assert.ok(scheduled.has("unrelated"));
  await Promise.all([
    service.reconcileReminders(plan),
    service.clearMedicineReminders(),
  ]);
  assert.equal(
    scheduled.size,
    1,
    "newer cancellation must supersede queued scheduling",
  );
  console.log(
    "Medicine reminder tests passed: privacy, times, account isolation, idempotence and cancellation.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
