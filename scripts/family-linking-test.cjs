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
    Date,
    Number,
    Math,
    process,
  });
  return result.exports;
}

const policy = compile("src/family/policy.ts");
const routing = compile("src/login-routing.ts");

assert.equal(policy.FAMILY_REVOKE_POLICY, "patient_can_revoke");
assert.equal(policy.FAMILY_LINK_SCOPE, "all_records");
assert.equal(policy.FAMILY_PENDING_EXPIRY_DAYS, 7);

// 1. Link state machine: pending -> active / declined / expired, active -> revoked
const now = Date.parse("2026-11-25T12:00:00Z");
const futureExpiry = "2026-12-02T12:00:00Z";
const pastExpiry = "2026-11-24T12:00:00Z";

assert.equal(
  policy.resolveLinkStatus({ status: "pending", expiresAt: futureExpiry }, now),
  "pending",
);
assert.equal(
  policy.resolveLinkStatus({ status: "pending", expiresAt: pastExpiry }, now),
  "expired",
);
assert.equal(
  policy.resolveLinkStatus({ status: "active", expiresAt: pastExpiry }, now),
  "active",
);
assert.equal(
  policy.resolveLinkStatus({ status: "declined", expiresAt: futureExpiry }, now),
  "declined",
);
assert.equal(
  policy.resolveLinkStatus({ status: "revoked", expiresAt: futureExpiry }, now),
  "revoked",
);

// 2. No access while pending, declined, revoked, or expired
for (const status of ["pending", "declined", "revoked", "expired"]) {
  assert.equal(
    policy.canFamilyAccessLink({ status, expiresAt: futureExpiry }, true, now),
    false,
    `Family must have NO access while status=${status}`,
  );
}

// 3. Switch OFF pauses access; ON restores only Active links
assert.equal(
  policy.canFamilyAccessLink({ status: "active", expiresAt: futureExpiry }, false, now),
  false,
  "Switch OFF must pause active family access",
);
assert.equal(
  policy.canFamilyAccessLink({ status: "active", expiresAt: futureExpiry }, true, now),
  true,
  "Switch ON must restore active family links",
);
assert.equal(
  policy.canFamilyAccessLink({ status: "revoked", expiresAt: futureExpiry }, true, now),
  false,
  "Switch ON must NOT restore revoked links",
);

// 4. Family role routing: fresh sign-in, restart, sign-out
const familySession = {
  role: "Family",
  providerId: "",
  identifier: "family@medbloom.in",
};
assert.equal(routing.postLoginRoute(familySession, false, "Family"), "/(tabs)");
assert.equal(routing.postLoginRoute(familySession, true, "Family"), "/(tabs)");
assert.equal(routing.postLoginRoute(null, true, "Family"), "/sign-in");

// 5. Family can manage care only when active + consent ON, cannot edit clinical records or reach doctor/admin routes
assert.equal(
  policy.canFamilyManageCare({ status: "active", expiresAt: futureExpiry }, true, now),
  true,
);
assert.equal(
  policy.canFamilyManageCare({ status: "active", expiresAt: futureExpiry }, false, now),
  false,
);
assert.equal(
  policy.canFamilyManageCare({ status: "pending", expiresAt: futureExpiry }, true, now),
  false,
);
assert.equal(policy.canFamilyEditRecords("Family"), false);
assert.equal(policy.canFamilyEditRecords("Patient"), true);
assert.equal(policy.canFamilyRoleWrite("Family"), false);
assert.equal(policy.canFamilyRoleWrite("Patient"), true);
for (const blocked of [
  "/doctor-entry",
  "/doctor-availability",
  "/verification-review",
  "/admin",
]) {
  assert.equal(policy.canFamilyRoleReachRoute("Family", blocked), false);
  assert.equal(routing.canAccessRoute("Family", blocked), false);
}
assert.equal(routing.canAccessRoute("Family", "/family-consent"), true);
assert.equal(routing.canAccessRoute("Family", "/(tabs)"), true);

// 6. Neutral message is identical whether or not the patient exists
const store = new Map();
const familyApiMod = compile("src/family/family-api.ts", {
  "@react-native-async-storage/async-storage": {
    __esModule: true,
    default: {
      getItem: async (k) => (store.has(k) ? store.get(k) : null),
      setItem: async (k, v) => {
        store.set(k, v);
      },
      removeItem: async (k) => {
        store.delete(k);
      },
      getAllKeys: async () => [...store.keys()],
      multiRemove: async (keys) => {
        for (const k of keys) store.delete(k);
      },
    },
  },
  "../cloud-api": { CloudError: class CloudError extends Error {}, cloudRequest: async () => ({}) },
  "../cloud-config": { cloudMode: false },
  "./policy": policy,
});

(async () => {
  const resExisting = await familyApiMod.familyApi.sendRequest(
    "caregiver1@medbloom.in",
    "patient.exists@medbloom.in",
  );
  const resMissing = await familyApiMod.familyApi.sendRequest(
    "caregiver2@medbloom.in",
    "nobody@unknown.example",
  );
  assert.equal(resExisting.message, policy.NEUTRAL_FAMILY_REQUEST_MESSAGE);
  assert.equal(resMissing.message, policy.NEUTRAL_FAMILY_REQUEST_MESSAGE);
  assert.equal(resExisting.message, resMissing.message);

  // Verify accept & revoke state transitions via familyApi
  const accepted = await familyApiMod.familyApi.accept(resExisting.link.id);
  assert.equal(accepted.status, "active");
  assert.equal(await familyApiMod.familyApi.getLinkStatus(accepted.id), "active");
  const revoked = await familyApiMod.familyApi.revoke(accepted.id);
  assert.equal(revoked.status, "revoked");
  assert.equal(await familyApiMod.familyApi.getLinkStatus(revoked.id), "revoked");

  console.log(
    "Passed: family link state machine, consent switch pause/restore, read-only & route guards, neutral request messaging, and API transitions.",
  );
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
