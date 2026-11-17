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
    Set,
    Promise,
  });
  return result.exports;
}
const { postLoginRoute } = compile("src/login-routing.ts");
const patient = { role: "Patient", providerId: "", identifier: "user_patient" };
const doctor = { ...patient, role: "Doctor", providerId: "assigned-doctor" };
assert.equal(postLoginRoute(patient, true, "Doctor"), "/doctor-entry");
assert.equal(postLoginRoute(patient, false, "Doctor"), "/doctor-entry");
assert.equal(postLoginRoute(doctor, false, "Doctor"), "/(tabs)");
assert.equal(postLoginRoute(patient, false, "Patient"), "/onboarding");
assert.equal(postLoginRoute(patient, true, "Patient"), "/(tabs)");
assert.equal(postLoginRoute(null, true, "Doctor"), "/sign-in");
(async () => {
  let finishRead;
  const diskRead = new Promise((resolve) => {
    finishRead = resolve;
  });
  const writes = [];
  const audience = compile("src/login-audience.ts", {
    "@react-native-async-storage/async-storage": {
      __esModule: true,
      default: {
        getItem: () => diskRead,
        setItem: async (key, value) => {
          writes.push(value);
        },
      },
    },
    react: {},
  });
  const hydration = audience.getLoginAudience();
  await audience.setLoginAudience("Doctor");
  finishRead("Patient");
  assert.equal(
    await hydration,
    "Doctor",
    "late saved Patient preference cannot replace user's Doctor choice",
  );
  assert.equal(await audience.getLoginAudience(), "Doctor");
  await Promise.all([
    audience.setLoginAudience("Patient"),
    audience.setLoginAudience("Doctor"),
  ]);
  assert.equal(
    writes.join(","),
    "Doctor,Patient,Doctor",
    "writes preserve latest selection order",
  );
  assert.equal(await audience.getLoginAudience(), "Doctor");
  const restored = compile("src/login-audience.ts", {
    "@react-native-async-storage/async-storage": {
      __esModule: true,
      default: { getItem: async () => "Doctor" },
    },
    react: {},
  });
  assert.equal(
    await restored.getLoginAudience(),
    "Doctor",
    "Doctor selection survives cold-start/callback remount",
  );
  console.log(
    "Passed: Doctor entry guard, Patient onboarding, assigned Doctor routing, cold-start persistence and storage race protection.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
