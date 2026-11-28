const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function compile(file, modules = {}) {
  const result = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports: result.exports,
    require: (name) => {
      if (!(name in modules)) throw new Error("Unexpected import " + name);
      return modules[name];
    },
    URL,
    Response,
    Request,
    Set,
    Promise,
    Date,
    Number,
    JSON,
  });
  return result.exports;
}

const verificationTypes = compile("src/verification-types.ts");
const availabilityMod = compile("backend/availability.ts", {
  "../src/verification-types": verificationTypes,
});

// 1. Schedule validation
assert.throws(
  () =>
    availabilityMod.validateSchedule([
      {
        day: "Mon",
        label: "Monday",
        enabled: true,
        startTime: "14:00",
        endTime: "10:00",
      },
    ]),
  /End time must be after start time/,
);

assert.throws(
  () =>
    availabilityMod.validateSchedule([
      {
        day: "Funday",
        label: "Funday",
        enabled: true,
        startTime: "09:00",
        endTime: "12:00",
      },
    ]),
  /valid unique weekdays/,
);

// 2. Mock D1 database
const rows = new Map();
const verifiedUsers = new Set(["doc_approved"]);
function makeDb() {
  return {
    prepare(sql) {
      let args = [];
      return {
        bind(...params) {
          args = params;
          return this;
        },
        async first() {
          if (sql.includes("verification_applications")) {
            return verifiedUsers.has(args[0]) ? { 1: 1 } : null;
          }
          if (sql.includes("memberships")) {
            return null;
          }
          if (sql.includes("FROM doctor_availability")) {
            return rows.get(args[0]) || null;
          }
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO doctor_availability")) {
            rows.set(args[0], { schedule: args[1], updated_at: args[2] });
          }
          return { success: true };
        },
      };
    },
  };
}

(async () => {
  const env = { DB: makeDb() };

  // Unverified user managing own availability gets 403
  await assert.rejects(
    availabilityMod.availabilityRoute(
      new Request("https://test/v1/availability"),
      env,
      "unverified_user",
    ),
    (err) => err.status === 403,
  );

  // Approved doctor with no saved schedule gets honest empty array []
  const emptyRes = await availabilityMod.availabilityRoute(
    new Request("https://test/v1/availability"),
    env,
    "doc_approved",
  );
  assert.equal(emptyRes.status, 200);
  const emptyJson = await emptyRes.json();
  assert.deepEqual(emptyJson.schedule, []);

  // Approved doctor saves weekly schedule
  const validWeek = [
    {
      day: "Mon",
      label: "Monday",
      enabled: true,
      startTime: "09:00",
      endTime: "12:00",
    },
    {
      day: "Sat",
      label: "Saturday",
      enabled: false,
      startTime: "09:00",
      endTime: "12:00",
    },
  ];
  const saveRes = await availabilityMod.availabilityRoute(
    new Request("https://test/v1/availability", {
      method: "POST",
      body: JSON.stringify({ schedule: validWeek }),
      headers: { "Content-Type": "application/json" },
    }),
    env,
    "doc_approved",
  );
  assert.equal(saveRes.status, 200);

  // Patient reads doctor's saved availability via ?providerId=doc_approved
  const readRes = await availabilityMod.availabilityRoute(
    new Request("https://test/v1/availability?providerId=doc_approved"),
    env,
    "patient_user",
  );
  assert.equal(readRes.status, 200);
  const readJson = await readRes.json();
  assert.equal(readJson.schedule.length, 2);
  assert.equal(readJson.schedule[0].day, "Mon");
  assert.equal(readJson.schedule[0].enabled, true);

  console.log(
    "Passed: availability validation, 403 unverified guard, honest empty state, and save/read round-trip.",
  );
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
