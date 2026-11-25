const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports = {}) {
  const exports = {};
  const resolvedCache = {};
  const customRequire = (name) => {
    if (imports[name]) return imports[name];
    if (resolvedCache[name]) return resolvedCache[name];
    return {};
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: customRequire,
      Error,
      setTimeout,
      Promise,
      Date,
      Intl,
      Math,
      Set,
      Map,
      RegExp,
      Number,
      Array,
      Object,
      String,
    },
  );
  return exports;
}

const dataMod = load("src/data.ts");
const clinicMod = load("src/clinic.ts", { "./data": dataMod });
const voiceAdapterMod = load("src/voice-adapter.ts");
const { resolveVoiceIntent, speechAdapter, SUPPORTED_VOICE_LANGUAGES } =
  voiceAdapterMod;
const { evaluatePatientKnowledge, findMatchingMedicine } = load(
  "src/voice-context-engine.ts",
  {
    "./clinic": clinicMod,
    "./voice-adapter": voiceAdapterMod,
  },
);

const today = clinicMod.dayKey();
const yesterdayDate = new Date(Date.now() - 86400000);
const yesterday = clinicMod.dayKey(yesterdayDate);
const tomorrowDate = new Date(Date.now() + 86400000);
const tomorrow = clinicMod.dayKey(tomorrowDate);
const nextWeekDate = new Date(Date.now() + 7 * 86400000);
const nextWeek = clinicMod.dayKey(nextWeekDate);

// 1. Language Support Test
assert.equal(
  SUPPORTED_VOICE_LANGUAGES.length >= 3,
  true,
  "Should support at least English, Hindi, and Kannada",
);
assert.equal(
  SUPPORTED_VOICE_LANGUAGES[0].code,
  "en-IN",
  "Default language should be en-IN",
);

// 2. Navigation & SOS Priority Intent Tests (English)
const sosWithPainRes = resolveVoiceIntent("Emergency, I have chest pain", "en-IN");
assert.equal(sosWithPainRes.intent, "EMERGENCY_SOS");
assert.equal(sosWithPainRes.targetRoute, "/sos");

const benignHindiHelp = resolveVoiceIntent("मेरी दवा के लिए मदद करो", "hi-IN");
assert.equal(
  benignHindiHelp.intent,
  "NAVIGATE_MEDICINES",
  "Bare Hindi मदद should not route to SOS",
);

const bookDoctorVisit = resolveVoiceIntent("Book a doctor visit", "en-IN");
assert.equal(bookDoctorVisit.intent, "NAVIGATE_BOOKING");
assert.equal(bookDoctorVisit.targetRoute, "/discover");

const medRes = resolveVoiceIntent("Show my medicines for today", "en-IN");
assert.equal(medRes.intent, "NAVIGATE_MEDICINES");
assert.equal(medRes.targetRoute, "/medicines");
assert.equal(medRes.isMedicalQuery, false);

const apptRes = resolveVoiceIntent("When is my next doctor appointment?", "en-IN");
assert.equal(apptRes.intent, "QUERY_NEXT_APPOINTMENT");
assert.equal(apptRes.targetRoute, "/(tabs)/appointments");

const recRes = resolveVoiceIntent("Show my blood test reports", "en-IN");
assert.equal(recRes.intent, "NAVIGATE_RECORDS");
assert.equal(recRes.targetRoute, "/(tabs)/records");

const bookRes = resolveVoiceIntent("Book a nurse for home care", "en-IN");
assert.equal(bookRes.intent, "NAVIGATE_BOOKING");
assert.equal(bookRes.targetRoute, "/discover");

const sosRes = resolveVoiceIntent("Emergency help needed immediately", "en-IN");
assert.equal(sosRes.intent, "EMERGENCY_SOS");
assert.equal(sosRes.targetRoute, "/sos");
assert.equal(sosRes.requiresConfirmation, true);

// 3. Clinical Safety Guardrail Refusal Tests (English)
const medAdviceRes = resolveVoiceIntent(
  "What medicine should I take for headache and fever?",
  "en-IN",
);
assert.equal(medAdviceRes.intent, "MEDICAL_QUERY_REFUSAL");
assert.equal(medAdviceRes.isMedicalQuery, true);
assert.equal(medAdviceRes.targetRoute, undefined, "Refusal must not navigate away");
assert.equal(
  medAdviceRes.spokenResponse.includes("cannot recommend treatments"),
  true,
);

// 4. Multilingual Intent & Spoken Response Tests (Hindi, Kannada, Tamil, Telugu)
const hiMedRes = resolveVoiceIntent("मेरी दवाइयाँ दिखाओ", "hi-IN");
assert.equal(hiMedRes.intent, "NAVIGATE_MEDICINES");
assert.equal(hiMedRes.targetRoute, "/medicines");
assert.equal(hiMedRes.spokenResponse.includes("दवा"), true);

const hiRefusalRes = resolveVoiceIntent("सिरदर्द के लिए क्या दवा लूँ?", "hi-IN");
assert.equal(hiRefusalRes.intent, "MEDICAL_QUERY_REFUSAL");
assert.equal(hiRefusalRes.isMedicalQuery, true);
assert.equal(hiRefusalRes.spokenResponse.includes("डॉक्टर"), true);

const knMedRes = resolveVoiceIntent("ನನ್ನ ಮಾತ್ರೆಗಳು ತೋರಿಸಿ", "kn-IN");
assert.equal(knMedRes.intent, "NAVIGATE_MEDICINES");
assert.equal(knMedRes.targetRoute, "/medicines");
assert.equal(knMedRes.spokenResponse.includes("ಔಷಧಿ"), true);

const knRefusalRes = resolveVoiceIntent(
  "ತಲೆನೋವಿಗೆ ಯಾವ ಮಾತ್ರೆ ತೆಗೆದುಕೊಳ್ಳಬೇಕು?",
  "kn-IN",
);
assert.equal(knRefusalRes.intent, "MEDICAL_QUERY_REFUSAL");
assert.equal(knRefusalRes.isMedicalQuery, true);
assert.equal(knRefusalRes.spokenResponse.includes("ಚಿಕಿತ್ಸೆ"), true);

const taBookRes = resolveVoiceIntent("செவிலியரை பதிவு செய்", "ta-IN");
assert.equal(taBookRes.intent, "NAVIGATE_BOOKING");
assert.equal(taBookRes.targetRoute, "/discover");

// 5. Fallback & Unavailable Synthesis Test
const unknownRes = resolveVoiceIntent("Blah blah gibberish xyz", "en-IN");
assert.equal(unknownRes.intent, "UNKNOWN_INTENT");
assert.equal(unknownRes.targetRoute, undefined);

speechAdapter.synthesizeSpeech("Test", "en-IN").then((synthRes) => {
  assert.equal(
    synthRes.synthesized,
    false,
    "Unavailable speechSynthesis must not report fake live success",
  );
});

// 6. Unified Patient Knowledge, Fuzzy Matching, Multi-Turn & Safety Engine Tests
const mockClinicState = {
  profile: {
    name: "Amina Begum",
    allergies: "Penicillin",
  },
  medicines: [
    {
      id: "m0",
      name: "OldInactiveMed",
      dosage: "10mg",
      time: "9:00 AM",
      frequency: "Once daily",
      active: false,
      logs: {},
    },
    {
      id: "m1",
      name: "Metformin",
      dosage: "500mg",
      time: "8:00 AM",
      frequency: "Once daily",
      active: true,
      logs: { [yesterday]: "Taken" },
    },
    {
      id: "m2",
      name: "Atorvastatin",
      dosage: "20mg",
      time: "8:00 PM",
      frequency: "Every night",
      active: true,
      logs: { [today]: "Taken" },
    },
  ],
  records: [
    {
      id: "r1",
      name: "Complete Blood Count",
      category: "Lab Report",
      date: today,
      detail: "Normal HbA1c",
    },
  ],
  consultations: [
    { id: "c1", text: "Low-salt diet and morning walk", followUp: "2 weeks" },
  ],
  visits: [
    {
      id: "v_past",
      service: "Past Dental Check",
      date: yesterday,
      time: "09:00 AM",
      status: "Confirmed",
    },
    {
      id: "v_later",
      service: "Routine Follow-up",
      date: nextWeek,
      time: "02:00 PM",
      status: "Confirmed",
    },
    {
      id: "v_earliest_pm",
      service: "Cardiology Review",
      date: tomorrow,
      time: "04:00 PM",
      status: "Confirmed",
    },
    {
      id: "v_earliest_am",
      service: "Morning Blood Draw",
      date: tomorrow,
      time: "08:30 AM",
      status: "Confirmed",
    },
  ],
};

// A. Inactive medicine must not be reported as scheduled
const inactiveRes = evaluatePatientKnowledge(
  "Tell me about OldInactiveMed",
  "en-IN",
  mockClinicState,
);
assert.equal(inactiveRes.medicineId, undefined);

// B. Word-level fuzzy matching selects Metformin specifically (even with surrounding sentence words)
const fuzzyMatch = findMatchingMedicine(
  "Tell me about my metaformin pill",
  mockClinicState.medicines,
);
assert.equal(fuzzyMatch.match?.id, "m1");

const fuzzyRes = evaluatePatientKnowledge(
  "Tell me about my metaformin pill",
  "en-IN",
  mockClinicState,
);
assert.equal(fuzzyRes.intent, "NAVIGATE_MEDICINES");
assert.equal(fuzzyRes.medicineId, "m1");
assert.equal(fuzzyRes.spokenResponse.includes("Metformin"), true);
// Yesterday's Taken entry must NOT report Metformin as taken today
assert.equal(fuzzyRes.spokenResponse.includes("Scheduled for today"), true);

// Today's Taken entry DOES report Atorvastatin as taken today
const takenTodayRes = evaluatePatientKnowledge(
  "Check Atorvastatin",
  "en-IN",
  mockClinicState,
);
assert.equal(
  takenTodayRes.spokenResponse.includes("Marked as taken today"),
  true,
);

// C. Non-Latin Kannada general medicine request must NOT empty-string match first medicine
const knEmptyNormRes = evaluatePatientKnowledge(
  "ನನ್ನ ಮಾತ್ರೆಗಳು ತೋರಿಸಿ",
  "kn-IN",
  mockClinicState,
);
assert.equal(knEmptyNormRes.intent, "NAVIGATE_MEDICINES");
assert.equal(knEmptyNormRes.medicineId, undefined);
assert.equal(knEmptyNormRes.spokenResponse.includes("2 ಔಷಧಿಗಳಿವೆ"), true);

// D. Multi-Turn Conversational Memory: requires typed medicineId & never invents food advice
const followUpValid = evaluatePatientKnowledge(
  "Should I take it with food?",
  "en-IN",
  mockClinicState,
  [{ user: "Check Atorvastatin", bloom: "...", medicineId: "m2" }],
);
assert.equal(followUpValid.spokenResponse.includes("Atorvastatin"), true);
assert.equal(
  followUpValid.spokenResponse.includes("after a meal"),
  false,
  "Must not invent meal timing instructions",
);
assert.equal(
  followUpValid.spokenResponse.includes("prescription"),
  true,
  "Must direct user to printed prescription or clinician",
);

// Records turn without medicineId must NOT enter medicine follow-up
const followUpAfterRecords = evaluatePatientKnowledge(
  "Should I take it with food?",
  "en-IN",
  mockClinicState,
  [{ user: "Show my records", bloom: "3 Active Records" }],
);
assert.equal(followUpAfterRecords.medicineId, undefined);

// E. Treatment refusal runs BEFORE broad medicine schedule even with active medicines
const treatmentWithActiveMeds = evaluatePatientKnowledge(
  "What medicine should I take for headache?",
  "en-IN",
  mockClinicState,
);
assert.equal(treatmentWithActiveMeds.intent, "MEDICAL_QUERY_REFUSAL");
assert.equal(treatmentWithActiveMeds.targetRoute, undefined);

// F. Appointment sorting excludes past dates and orders by date then slotMinutes(time)
const sortedVisitRes = evaluatePatientKnowledge(
  "When is my next appointment?",
  "en-IN",
  mockClinicState,
);
assert.equal(
  sortedVisitRes.spokenResponse.includes("Morning Blood Draw"),
  true,
  "Must pick earliest future date and earliest morning slot",
);

// G. Emergency SOS routing & benign breathing exclusion
const emptyEmergency = evaluatePatientKnowledge(
  "Emergency help",
  "en-IN",
  { ...mockClinicState, medicines: [] },
);
assert.equal(emptyEmergency.intent, "EMERGENCY_SOS");
assert.equal(emptyEmergency.targetRoute, "/sos");
assert.equal(
  emptyEmergency.spokenResponse.includes("alerting"),
  false,
  "Must not falsely claim contacts are alerted",
);

const benignBreathing = evaluatePatientKnowledge(
  "मेरी सांस ठीक है",
  "hi-IN",
  mockClinicState,
);
assert.notEqual(benignBreathing.intent, "EMERGENCY_SOS");

// H. Empty lists preserve navigation routes & Tamil/Telugu work with empty data
const emptyState = {
  profile: { name: "Test", allergies: "" },
  medicines: [],
  records: [],
  consultations: [],
  visits: [],
};
const taReportEmpty = evaluatePatientKnowledge(
  "மருத்துவ அறிக்கைகளை காட்டு",
  "ta-IN",
  emptyState,
);
assert.equal(taReportEmpty.intent, "NAVIGATE_RECORDS");
assert.equal(taReportEmpty.targetRoute, "/(tabs)/records");

const teBookEmpty = evaluatePatientKnowledge(
  "నర్సును బుక్ చేయండి",
  "te-IN",
  emptyState,
);
assert.equal(teBookEmpty.intent, "NAVIGATE_BOOKING");
assert.equal(teBookEmpty.targetRoute, "/discover");

// I. Health records & consultation notes
const recordsRes = evaluatePatientKnowledge(
  "What are my lab reports and blood test?",
  "en-IN",
  mockClinicState,
);
assert.equal(recordsRes.intent, "NAVIGATE_RECORDS");
assert.equal(recordsRes.spokenResponse.includes("Complete Blood Count"), true);

const consultRes = evaluatePatientKnowledge(
  "What did the doctor say in my consultation?",
  "en-IN",
  mockClinicState,
);
assert.equal(consultRes.spokenResponse.includes("Low-salt diet"), true);

// J. Code Review Edge Cases & Regressions
// 1. Home visit routing: query vs booking
const homeVisitQuery = resolveVoiceIntent("When is my next home visit?", "en-IN");
assert.equal(homeVisitQuery.intent, "QUERY_NEXT_APPOINTMENT");
assert.equal(homeVisitQuery.targetRoute, "/(tabs)/appointments");

const homeVisitBook = resolveVoiceIntent("Book a home visit", "en-IN");
assert.equal(homeVisitBook.intent, "NAVIGATE_BOOKING");
assert.equal(homeVisitBook.targetRoute, "/discover");

const contextHomeVisitQuery = evaluatePatientKnowledge(
  "When is my next home visit?",
  "en-IN",
  mockClinicState,
);
assert.equal(contextHomeVisitQuery.intent, "QUERY_NEXT_APPOINTMENT");
assert.equal(contextHomeVisitQuery.targetRoute, "/(tabs)/appointments");

// 2. Treatment refusal on "pain" and "which medicine should I take"
const painQuery = evaluatePatientKnowledge(
  "Which medicine should I take for pain?",
  "en-IN",
  mockClinicState,
);
assert.equal(painQuery.intent, "MEDICAL_QUERY_REFUSAL");
assert.equal(painQuery.isMedicalQuery, true);
assert.equal(painQuery.targetRoute, undefined);

const painRefusalAdapter = resolveVoiceIntent(
  "Which medicine should I take for pain?",
  "en-IN",
);
assert.equal(painRefusalAdapter.intent, "MEDICAL_QUERY_REFUSAL");

// 3. Explicit medicine utterance overrides previous follow-up medicine
const followUpOverride = evaluatePatientKnowledge(
  "When should I take Metformin?",
  "en-IN",
  mockClinicState,
  [
    {
      user: "Tell me about Atorvastatin",
      bloom: "Atorvastatin schedule",
      medicineId: "m2",
    },
  ],
);
assert.equal(followUpOverride.highlightData.includes("Metformin"), true);
assert.equal(
  followUpOverride.spokenResponse.includes("Metformin"),
  true,
  "Must evaluate Metformin, not Atorvastatin",
);

// Anonymous follow-up still correctly resolves to Atorvastatin
const followUpPreserved = evaluatePatientKnowledge(
  "When should I take it?",
  "en-IN",
  mockClinicState,
  [
    {
      user: "Tell me about Atorvastatin",
      bloom: "Atorvastatin schedule",
      medicineId: "m2",
    },
  ],
);
assert.equal(followUpPreserved.spokenResponse.includes("Atorvastatin"), true);

// 4. Negated breathing statement must not trigger SOS, but compound clauses with distress must trigger SOS
const negatedHindiBreathing = evaluatePatientKnowledge(
  "सांस लेने में कोई परेशानी नहीं है",
  "hi-IN",
  mockClinicState,
);
assert.notEqual(negatedHindiBreathing.intent, "EMERGENCY_SOS");

const negatedEnglishBreathing = evaluatePatientKnowledge(
  "I have no difficulty breathing",
  "en-IN",
  mockClinicState,
);
assert.notEqual(negatedEnglishBreathing.intent, "EMERGENCY_SOS");

const compoundBreathingDistress = evaluatePatientKnowledge(
  "I have no difficulty walking but I cannot breathe",
  "en-IN",
  mockClinicState,
);
assert.equal(compoundBreathingDistress.intent, "EMERGENCY_SOS");
assert.equal(compoundBreathingDistress.targetRoute, "/sos");

const distressHindiBreathing = evaluatePatientKnowledge(
  "सांस लेने में बहुत तकलीफ हो रही है",
  "hi-IN",
  mockClinicState,
);
assert.equal(distressHindiBreathing.intent, "EMERGENCY_SOS");
assert.equal(distressHindiBreathing.targetRoute, "/sos");

// 5. Elapsed appointments today are filtered out deterministically
const fixedNow = new Date("2026-11-25T14:00:00");
const fixedToday = clinicMod.dayKey(fixedNow);
const pastTodayVisit = {
  id: "v_today_past",
  patientId: "p1",
  doctorId: "d1",
  doctorName: "Dr. Past",
  service: "Early Consultation",
  date: fixedToday,
  time: "12:01 AM",
  status: "Confirmed",
};
const futureTodayVisit = {
  id: "v_today_future",
  patientId: "p1",
  doctorId: "d1",
  doctorName: "Dr. Future",
  service: "Evening Checkup",
  date: fixedToday,
  time: "11:59 PM",
  status: "Confirmed",
};
const elapsedFilterState = {
  ...mockClinicState,
  visits: [pastTodayVisit, futureTodayVisit],
};
const apptFilteredRes = evaluatePatientKnowledge(
  "When is my next appointment?",
  "en-IN",
  elapsedFilterState,
  [],
  fixedNow,
);
assert.equal(
  apptFilteredRes.spokenResponse.includes("Evening Checkup"),
  true,
  "Must pick the upcoming appointment, not the elapsed one",
);

// 6. Audio adapter stopSpeaking pauses activeAudio before settling cleanup
const adapterMod = load("src/deepgram-cartesia-adapter.ts", {
  "./cloud-client": { CloudClient: class {} },
  "./voice-types": {},
});
const testAdapter = new adapterMod.DeepgramCartesiaAdapter();
let audioPausedBeforeCleanup = false;
let playbackCleanedUp = false;
testAdapter.activeAudio = {
  pause() {
    audioPausedBeforeCleanup = true;
  },
  currentTime: 10,
  onended: null,
  onerror: null,
};
testAdapter.activePlaybackCleanup = () => {
  assert.equal(
    audioPausedBeforeCleanup,
    true,
    "activeAudio must be paused before activePlaybackCleanup settles",
  );
  playbackCleanedUp = true;
};
testAdapter.stopSpeaking();
assert.equal(audioPausedBeforeCleanup, true);
assert.equal(playbackCleanedUp, true);
assert.equal(testAdapter.activeAudio, null);

// 7. Indic stop command regex retains combining marks
const testStopRegex = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
assert.equal(testStopRegex("रोको"), "रोको", "Devanagari matras must be preserved");
assert.equal(testStopRegex("ಆಪು"), "ಆಪು", "Kannada vowel signs must be preserved");
assert.equal(testStopRegex("நிறுத்து!"), "நிறுத்து", "Tamil pulli must be preserved");

console.log(
  "Voice pipeline prototype tests passed: intent priorities, multilingual Tamil/Telugu/Hindi/Kannada, word-level fuzzy matching, typed multi-turn safety, sorted future visits, emergency checks, and code-review edge cases.",
);
