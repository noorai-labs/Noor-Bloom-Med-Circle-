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
    { exports, require: (name) => imports[name] || {}, Error, setTimeout, Promise },
  );
  return exports;
}

const { resolveVoiceIntent, speechAdapter, SUPPORTED_VOICE_LANGUAGES } = load("src/voice-adapter.ts");

// 1. Language Support Test
assert.equal(SUPPORTED_VOICE_LANGUAGES.length >= 3, true, "Should support at least English, Hindi, and Kannada");
assert.equal(SUPPORTED_VOICE_LANGUAGES[0].code, "en-IN", "Default language should be en-IN");

// 2. Navigation Intent Tests
const medRes = resolveVoiceIntent("Show my medicines for today");
assert.equal(medRes.intent, "NAVIGATE_MEDICINES");
assert.equal(medRes.targetRoute, "/medicines");
assert.equal(medRes.isMedicalQuery, false);

const apptRes = resolveVoiceIntent("When is my next doctor appointment?");
assert.equal(apptRes.intent, "QUERY_NEXT_APPOINTMENT");
assert.equal(apptRes.targetRoute, "/(tabs)/appointments");

const recRes = resolveVoiceIntent("Show my blood test reports");
assert.equal(recRes.intent, "NAVIGATE_RECORDS");
assert.equal(recRes.targetRoute, "/(tabs)/records");

const bookRes = resolveVoiceIntent("Book a nurse for home care");
assert.equal(bookRes.intent, "NAVIGATE_BOOKING");
assert.equal(bookRes.targetRoute, "/discover");

const sosRes = resolveVoiceIntent("Emergency help needed immediately");
assert.equal(sosRes.intent, "EMERGENCY_SOS");
assert.equal(sosRes.targetRoute, "/sos");
assert.equal(sosRes.requiresConfirmation, true);

// 3. Clinical Safety Guardrail Refusal Tests
const medAdviceRes = resolveVoiceIntent("What medicine should I take for headache and fever?");
assert.equal(medAdviceRes.intent, "MEDICAL_QUERY_REFUSAL");
assert.equal(medAdviceRes.isMedicalQuery, true);
assert.equal(medAdviceRes.targetRoute, undefined, "Refusal must not navigate away");
assert.equal(medAdviceRes.spokenResponse.includes("cannot recommend treatments"), true);

// 4. Fallback Intent Test
const unknownRes = resolveVoiceIntent("Blah blah gibberish xyz");
assert.equal(unknownRes.intent, "UNKNOWN_INTENT");
assert.equal(unknownRes.targetRoute, undefined);

console.log("Voice pipeline prototype tests passed: intent routing, clinical guardrails, navigation targets and languages.");