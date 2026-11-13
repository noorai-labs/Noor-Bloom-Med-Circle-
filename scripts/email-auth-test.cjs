const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript");
const result = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/email-auth.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: result.exports, Error },
);
const { sendEmailCode, createEmailAccount, resendEmailCode, verifyEmailCode } =
  result.exports;
(async () => {
  let sends = 0,
    signups = 0,
    checks = 0;
  const signIn = {
    create: async () => ({
      supportedFirstFactors: [
        { strategy: "email_code", emailAddressId: "email_test" },
      ],
    }),
    prepareFirstFactor: async (p) => {
      assert.equal(p.emailAddressId, "email_test");
      sends++;
    },
    attemptFirstFactor: async (p) => {
      checks++;
      return { status: "complete", createdSessionId: "sess_email" };
    },
  };
  const signUp = {
    create: async (p) => {
      assert.equal(p.emailAddress, "new@example.com");
      signups++;
    },
    prepareEmailAddressVerification: async () => {
      sends++;
    },
    attemptEmailAddressVerification: async () => ({
      status: "complete",
      createdSessionId: "sess_new",
    }),
  };
  await assert.rejects(
    () => sendEmailCode(signIn, signUp, "bad"),
    "valid email",
  );
  const existing = await sendEmailCode(signIn, signUp, "user@example.com");
  assert.equal(existing.kind, "signIn");
  assert.equal(signups, 0);
  await resendEmailCode(signIn, signUp, existing);
  assert.equal(sends, 2);
  await assert.rejects(() => verifyEmailCode(signIn, signUp, existing, "123"));
  assert.equal(checks, 0);
  assert.equal(
    await verifyEmailCode(signIn, signUp, existing, "456789"),
    "sess_email",
  );
  const missing = {
    ...signIn,
    create: async () => {
      throw { errors: [{ code: "form_identifier_not_found" }] };
    },
  };
  await assert.rejects(
    () => sendEmailCode(missing, signUp, "new@example.com"),
    (error) => error.name === "EmailAccountNotFoundError",
  );
  assert.equal(signups, 0, "Missing account must not automatically sign up");
  const created = await createEmailAccount(signUp, "new@example.com");
  assert.equal(created.kind, "signUp");
  assert.equal(signups, 1);
  assert.equal(
    await verifyEmailCode(signIn, signUp, created, "456789"),
    "sess_new",
  );
  const outage = {
    ...signIn,
    create: async () => {
      throw Error("Network unavailable");
    },
  };
  await assert.rejects(() => sendEmailCode(outage, signUp, "new@example.com"));
  assert.equal(signups, 1);
  await assert.rejects(() =>
    sendEmailCode(
      {
        ...signIn,
        create: async () => ({
          supportedFirstFactors: [{ strategy: "oauth_google" }],
        }),
      },
      signUp,
      "user@example.com",
    ),
  );
  await assert.rejects(
    () =>
      verifyEmailCode(
        signIn,
        {
          ...signUp,
          attemptEmailAddressVerification: async () => ({
            status: "missing_requirements",
            createdSessionId: null,
            missingFields: ["phone_number"],
          }),
        },
        created,
        "456789",
      ),
    (error) => error.missingFields?.includes("phone_number"),
  );
  await assert.rejects(
    () =>
      verifyEmailCode(
        {
          ...signIn,
          attemptFirstFactor: async () => {
            throw Error("Code expired");
          },
        },
        signUp,
        existing,
        "456789",
      ),
    /Code expired/,
  );
  let repeatAttempts = 0;
  const completedSignUp = {
    ...signUp,
    status: "complete",
    createdSessionId: "sess_recovered",
    attemptEmailAddressVerification: async () => {
      repeatAttempts++;
      throw Error("Must not repeat verification");
    },
  };
  assert.equal(
    await verifyEmailCode(signIn, completedSignUp, created, ""),
    "sess_recovered",
  );
  assert.equal(repeatAttempts, 0);
  const verifiedSignUp = {
    ...signUp,
    verifications: { emailAddress: { status: "verified" } },
    reload: async () => ({
      status: "complete",
      createdSessionId: "sess_reloaded",
    }),
    attemptEmailAddressVerification: async () => {
      repeatAttempts++;
    },
  };
  assert.equal(
    await verifyEmailCode(signIn, verifiedSignUp, created, ""),
    "sess_reloaded",
  );
  assert.equal(repeatAttempts, 0);
  const alreadyVerified = {
    ...signUp,
    attemptEmailAddressVerification: async () => {
      throw { errors: [{ code: "verification_already_verified" }] };
    },
    reload: async () => ({
      status: "complete",
      createdSessionId: "sess_after_retry",
    }),
  };
  assert.equal(
    await verifyEmailCode(signIn, alreadyVerified, created, "456789"),
    "sess_after_retry",
  );
  await assert.rejects(
    () =>
      verifyEmailCode(
        signIn,
        {
          ...verifiedSignUp,
          reload: async () => ({
            status: "missing_requirements",
            createdSessionId: null,
            missingFields: ["password"],
          }),
        },
        created,
        "",
      ),
    (error) =>
      error.name === "EmailSetupError" &&
      error.missingFields.includes("password"),
  );
  const existingComplete = {
    ...signIn,
    status: "complete",
    createdSessionId: "sess_existing_retry",
    attemptFirstFactor: async () => {
      throw Error("Must not repeat code");
    },
  };
  assert.equal(
    await verifyEmailCode(existingComplete, signUp, existing, ""),
    "sess_existing_retry",
  );
  console.log(
    "Passed: existing/new email login, resend, invalid and expired codes, completed session recovery, already-verified email and missing-password handling, incomplete sign-up, disabled email factor and network failures; no signup on generic errors.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
