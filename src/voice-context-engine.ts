/**
 * Unified Patient Knowledge & Multi-Turn Context Engine for BLOOM MED
 * Connects the voice agent to the patient state:
 * - Health records & diagnostic lab reports
 * - Doctor consultations and follow-up plans
 * - Active medicine schedules, dosages, today's adherence logs, and word-level fuzzy matching
 * - Allergies & clinical profile safety checks
 * - Multi-turn conversational memory (typed medicineId persistence)
 * - Clinical safety guardrails and emergency distress detection
 */

import {
  ClinicState,
  Medicine,
  dayKey,
  formatDate,
  slotMinutes,
} from "./clinic";
import { resolveVoiceIntent } from "./voice-adapter";
import { VoiceIntentResolution, VoiceLanguage } from "./voice-types";

export interface ConversationTurn {
  user: string;
  bloom: string;
  topic?:
    | "medicines"
    | "appointments"
    | "records"
    | "consultations"
    | "allergies"
    | "care_circle"
    | "emergency";
  medicineId?: string;
}

export interface AdvancedVoiceResponse extends VoiceIntentResolution {
  category?:
    | "records"
    | "consultation"
    | "medicine"
    | "appointment"
    | "allergy"
    | "care_circle"
    | "emergency"
    | "general";
  isEmergencyAlert?: boolean;
  highlightData?: string;
  medicineId?: string;
}

export interface MedicineMatchResult {
  match: Medicine | null;
  ambiguousMatches: Medicine[];
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Matches spoken candidate tokens/spans against active prescribed medicines.
 * Prefers unique exact matches before word-level fuzzy matches and surfaces
 * ambiguity when multiple medicines remain plausible.
 */
export function findMatchingMedicine(
  transcript: string,
  medicines: Medicine[],
): MedicineMatchResult {
  const activeMedicines = medicines.filter((m) => m.active);
  if (activeMedicines.length === 0) {
    return { match: null, ambiguousMatches: [] };
  }

  // Extract normalized alphanumeric candidate words (ignoring non-Latin transcripts cleanly)
  const rawTokens = transcript
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length >= 3);

  if (rawTokens.length === 0) {
    return { match: null, ambiguousMatches: [] };
  }

  // Build single tokens and adjacent two-word spans for multi-word medicine names
  const spans = new Set<string>(rawTokens);
  for (let i = 0; i < rawTokens.length - 1; i++) {
    spans.add(rawTokens[i] + rawTokens[i + 1]);
  }

  // 1. Exact candidate match pass
  const exactMatches: Medicine[] = [];
  for (const med of activeMedicines) {
    const medClean = med.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const medWords = med.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3);

    if (!medClean) continue;

    const isExact =
      spans.has(medClean) || medWords.some((mw) => spans.has(mw));
    if (isExact) {
      exactMatches.push(med);
    }
  }

  if (exactMatches.length === 1) {
    return { match: exactMatches[0], ambiguousMatches: [] };
  }
  if (exactMatches.length > 1) {
    return { match: null, ambiguousMatches: exactMatches };
  }

  // 2. Word/span-level fuzzy match pass (never compares against whole sentence)
  const fuzzyCandidates: { med: Medicine; dist: number }[] = [];
  for (const med of activeMedicines) {
    const medWords = med.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4);
    const medClean = med.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!medClean && medWords.length === 0) continue;

    const targets = medWords.length > 0 ? medWords : [medClean];
    let bestDist = Infinity;

    for (const token of spans) {
      if (token.length < 4) continue;
      for (const target of targets) {
        if (Math.abs(token.length - target.length) > 2) continue;
        const dist = levenshteinDistance(token, target);
        const maxAllowed = target.length >= 7 ? 2 : 1;
        if (dist <= maxAllowed && dist < bestDist) {
          bestDist = dist;
        }
      }
    }

    if (bestDist < Infinity) {
      fuzzyCandidates.push({ med, dist: bestDist });
    }
  }

  if (fuzzyCandidates.length === 0) {
    return { match: null, ambiguousMatches: [] };
  }

  fuzzyCandidates.sort((a, b) => a.dist - b.dist);
  const topDist = fuzzyCandidates[0].dist;
  const tiedTop = fuzzyCandidates
    .filter((c) => c.dist === topDist)
    .map((c) => c.med);

  if (tiedTop.length === 1) {
    return { match: tiedTop[0], ambiguousMatches: [] };
  }

  return { match: null, ambiguousMatches: tiedTop };
}

/**
 * Evaluates patient transcript against clinic state and typed multi-turn history.
 */
export function evaluatePatientKnowledge(
  transcript: string,
  language: VoiceLanguage = "en-IN",
  clinicState?: ClinicState | null,
  history: ConversationTurn[] = [],
  referenceDate?: Date,
): AdvancedVoiceResponse {
  const t = transcript.toLowerCase().trim();
  const lastTurn = history.length > 0 ? history[history.length - 1] : null;
  const allMeds = clinicState?.medicines || [];
  const activeMeds = allMeds.filter((m) => m.active);

  // 1. EMERGENCY & SOS DISPATCH (Highest Priority Safety Guardrail)
  // Direct affirmative distress is NEVER suppressed by benign mentions in other clauses (e.g. "no difficulty walking but cannot breathe")
  const hasAffirmativeDistress =
    t.includes("cannot breathe") ||
    t.includes("can't breathe") ||
    t.includes("unable to breathe") ||
    t.includes("hard to breathe") ||
    t.includes("struggling to breathe") ||
    t.includes("gasping for breath") ||
    t.includes("chest pain") ||
    t.includes("collapsed") ||
    t.includes("severe dizziness") ||
    t.includes("heart attack") ||
    t.includes("emergency") ||
    t.includes("sos") ||
    t.includes("ambulance") ||
    t.includes("urgent help") ||
    // Hindi distress & emergency qualifiers
    t.includes("chhati me dard") ||
    t.includes("छाती में दर्द") ||
    t.includes("आपातकाल") ||
    t.includes("आपातकालीन") ||
    t.includes("इमरजेंसी") ||
    t.includes("एम्बुलेंस") ||
    // Kannada distress & emergency qualifiers
    t.includes("ಎದೆ ನೋವು") ||
    t.includes("ಉಸಿರಾಟದ ತೊಂದರೆ") ||
    t.includes("ಉಸಿರಾಡಲು ಕಷ್ಟ") ||
    t.includes("ತುರ್ತು") ||
    t.includes("ಆಂಬ್ಯುಲೆನ್ಸ್") ||
    // Tamil & Telugu emergency qualifiers
    t.includes("அவசர") ||
    t.includes("அவசரம்") ||
    t.includes("மூச்சுத்திணறல்") ||
    t.includes("అత్యవసర") ||
    t.includes("అత్యవసరం") ||
    t.includes("శ్వాస తీసుకోవడంలో ఇబ్బంది");

  // Specific negated breathing expressions (only negates when specifically referring to breathing)
  const isBreathingClauseNegated =
    t.includes("no difficulty breathing") ||
    t.includes("no trouble breathing") ||
    t.includes("no problem breathing") ||
    t.includes("no shortness of breath") ||
    t.includes("without shortness of breath") ||
    t.includes("not having difficulty breathing") ||
    t.includes("not having trouble breathing") ||
    t.includes("not having shortness of breath") ||
    t.includes("saans theek") ||
    t.includes("सांस ठीक") ||
    /(?:सांस|saans)[^\p{P}]*(?:कोई\s*)?(?:परेशानी|तकलीफ|दिक्कत)\s*नहीं/u.test(t) ||
    /(?:कोई\s*)?(?:परेशानी|तकलीफ|दिक्कत)\s*नहीं[^\p{P}]*(?:सांस|saans)/u.test(t);

  const hasIndicBreathingDistress =
    !isBreathingClauseNegated &&
    ((t.includes("सांस") || t.includes("saans")) &&
      (t.includes("तकलीफ") ||
        t.includes("परेशानी") ||
        t.includes("दिक्कत") ||
        t.includes("कठिनाई") ||
        t.includes("फूल") ||
        t.includes("नहीं आ") ||
        t.includes("रुक") ||
        t.includes("takleef") ||
        t.includes("pareshani") ||
        t.includes("dikkat") ||
        t.includes("kathinai") ||
        t.includes("phool") ||
        t.includes("nahi aa")));

  const hasEnglishDifficultyBreathing =
    !isBreathingClauseNegated &&
    (t.includes("difficulty breathing") ||
      t.includes("trouble breathing") ||
      t.includes("shortness of breath"));

  const isEmergencyRequest =
    hasAffirmativeDistress ||
    hasEnglishDifficultyBreathing ||
    hasIndicBreathingDistress;

  if (isEmergencyRequest) {
    let spoken =
      "Please sit down and remain calm. I am opening immediate emergency support.";
    if (language === "hi-IN") {
      spoken =
        "कृपया बैठ जाएँ और शांत रहें। मैं तुरंत आपातकालीन सहायता खोल रही हूँ।";
    } else if (language === "kn-IN") {
      spoken =
        "ದಯವಿಟ್ಟು ಕುಳಿತುಕೊಳ್ಳಿ ಮತ್ತು ಶಾಂತರಾಗಿರಿ. ನಾನು ತಕ್ಷಣ ತುರ್ತು ಸಹಾಯವನ್ನು ತೆರೆಯುತ್ತಿದ್ದೇನೆ.";
    } else if (language === "ta-IN") {
      spoken =
        "தயவுசெய்து அமைதியாக இருங்கள். உடனடி அவசர உதவியைத் திறக்கிறேன்.";
    } else if (language === "te-IN") {
      spoken =
        "దయచేసి ప్రశాంతంగా కూర్చోండి. నేను వెంటనే అత్యవసర సహాయాన్ని తెరుస్తున్నాను.";
    }
    return {
      intent: "EMERGENCY_SOS",
      confidence: 1.0,
      targetRoute: "/sos",
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: false,
      isEmergencyAlert: true,
      category: "emergency",
      highlightData: "Emergency Support",
    };
  }

  // 2. CLINICAL SAFETY REFUSAL (Before broad schedule/medicine branches)
  const isTreatmentQuery =
    t.includes("headache") ||
    t.includes("fever") ||
    t.includes("pain") ||
    t.includes("what medicine should i take") ||
    t.includes("which medicine should i take") ||
    t.includes("what should i take for") ||
    t.includes("which should i take for") ||
    t.includes("what to take for") ||
    t.includes("which to take for") ||
    t.includes("what medicine for") ||
    t.includes("which medicine for") ||
    t.includes("cure") ||
    t.includes("diagnose") ||
    t.includes("symptom") ||
    // Hindi
    t.includes("सिरदर्द") ||
    t.includes("बुखार") ||
    t.includes("दर्द") ||
    t.includes("कौन सी दवा") ||
    t.includes("क्या दवा लूँ") ||
    t.includes("इलाज") ||
    t.includes("sirdard") ||
    t.includes("bukhar") ||
    t.includes("dard") ||
    // Kannada
    t.includes("ತಲೆನೋವ") ||
    t.includes("ತಲೆನೋವು") ||
    t.includes("ಜ್ವರ") ||
    t.includes("ನೋವ") ||
    t.includes("ನೋವು") ||
    t.includes("ಯಾವ ಮಾತ್ರೆ") ||
    t.includes("ಚಿಕಿತ್ಸೆ") ||
    // Tamil
    t.includes("தலைவலி") ||
    t.includes("காய்ச்சல்") ||
    t.includes("வலி") ||
    t.includes("என்ன மாத்திரை") ||
    // Telugu
    t.includes("తలనొప్పి") ||
    t.includes("జ్వరం") ||
    t.includes("నొప్పి") ||
    t.includes("ఏ మందు");

  if (isTreatmentQuery) {
    const refusal = resolveVoiceIntent(transcript, language);
    return {
      ...refusal,
      category: "general",
      highlightData: "Clinical Safety Guardrail",
    };
  }

  // 3. MULTI-TURN MEDICATION FOLLOW-UP (Requires verified active medicineId)
  // Check if current utterance contains an explicit medicine name before defaulting to previous turn
  const explicitMedLookup = findMatchingMedicine(transcript, allMeds);
  const hasExplicitOrAmbiguousMed =
    Boolean(explicitMedLookup.match) ||
    explicitMedLookup.ambiguousMatches.length > 1;

  const followUpMed =
    !hasExplicitOrAmbiguousMed && lastTurn?.medicineId
      ? activeMeds.find((m) => m.id === lastTurn.medicineId)
      : undefined;

  if (
    followUpMed &&
    (t.includes("with food") ||
      t.includes("before food") ||
      t.includes("after food") ||
      t.includes("when should i take") ||
      t.includes("how to take") ||
      t.includes("khana khane") ||
      t.includes("ಊಟದ ನಂತರ") ||
      t.includes("ಊಟಕ್ಕೆ ಮುಂಚೆ"))
  ) {
    const scheduleParts = [followUpMed.time, followUpMed.frequency]
      .filter(Boolean)
      .join(", ");
    let spoken = `Regarding ${followUpMed.name} (${followUpMed.dosage}): your schedule notes ${scheduleParts}. Please follow your printed prescription or ask your clinician about taking it with food.`;
    if (language === "hi-IN") {
      spoken = `${followUpMed.name} (${followUpMed.dosage}) का निर्धारित समय ${scheduleParts} है। भोजन के साथ लेने के निर्देश के लिए कृपया अपना प्रिस्क्रिप्शन देखें या डॉक्टर से पूछें।`;
    } else if (language === "kn-IN") {
      spoken = `${followUpMed.name} (${followUpMed.dosage}) ವೇಳಾಪಟ್ಟಿ: ${scheduleParts}. ಊಟದೊಂದಿಗೆ ತೆಗೆದುಕೊಳ್ಳುವ ಸೂಚನೆಗಾಗಿ ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ನೋಡಿ ಅಥವಾ ವೈದ್ಯರನ್ನು ಕೇಳಿ.`;
    } else if (language === "ta-IN") {
      spoken = `${followUpMed.name} (${followUpMed.dosage}) நேரம் ${scheduleParts}. உணவுடன் எடுத்துக்கொள்வது குறித்து உங்கள் மருத்துவரின் குறிப்பைப் பார்க்கவும்.`;
    } else if (language === "te-IN") {
      spoken = `${followUpMed.name} (${followUpMed.dosage}) సమయం ${scheduleParts}. ఆహారంతో తీసుకోవాలా వద్దా అనే దాని కోసం దయచేసి మీ డాక్టర్ ప్రిస్క్రిప్షన్ చూడండి.`;
    }
    return {
      intent: "NAVIGATE_MEDICINES",
      confidence: 0.95,
      targetRoute: "/medicines",
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: false,
      category: "medicine",
      highlightData: followUpMed.name,
      medicineId: followUpMed.id,
    };
  }

  // 4. EXPLICIT BOOKING / FIND CARE (checked before "visit" in appointments & Tamil "பதிவு" in records)
  const isBookingAction =
    t.includes("book ") ||
    t.includes("book a") ||
    t.includes("find doctor") ||
    t.includes("find nurse") ||
    t.includes("find care") ||
    ((t.includes("home care") || t.includes("home visit")) &&
      (t.includes("book") ||
        t.includes("find") ||
        t.includes("schedule") ||
        t.includes("need") ||
        t.includes("request") ||
        t.includes("बुक") ||
        t.includes("ಬುಕ್") ||
        t.includes("பதிவு") ||
        t.includes("బుక్"))) ||
    t.includes("बुक") ||
    t.includes("ಬುಕ್") ||
    t.includes("பதிவு செய்") ||
    t.includes("செவிலியரை") ||
    t.includes("బుక్") ||
    t.includes("బుకింగ్");

  if (isBookingAction) {
    let spoken =
      "Here is the care directory. You can discover available doctors and nurses for clinic or home care.";
    if (language === "hi-IN") {
      spoken =
        "यहाँ केयर डायरेक्टरी है। आप क्लिनिक या होम विज़िट के लिए उपलब्ध डॉक्टर और नर्स देख सकते हैं।";
    } else if (language === "kn-IN") {
      spoken =
        "ಇಲ್ಲಿ ಆರೋಗ್ಯ ಸೇವಾ ಪಟ್ಟಿಯಿದೆ. ನೀವು ಲಭ್ಯವಿರುವ ವೈದ್ಯರು ಮತ್ತು ನರ್ಸ್‌ಗಳನ್ನು ಆಯ್ಕೆ ಮಾಡಬಹುದು.";
    } else if (language === "ta-IN") {
      spoken =
        "இங்கே மருத்துவர்கள் மற்றும் செவிலியர்களின் பட்டியல் உள்ளது. நீங்கள் முன்பதிவு செய்யலாம்.";
    } else if (language === "te-IN") {
      spoken =
        "ఇక్కడ డాక్టర్లు మరియు నర్సుల వివరాలు ఉన్నాయి. మీరు హోమ్ విజిట్ బుక్ చేసుకోవచ్చు.";
    }
    return {
      intent: "NAVIGATE_BOOKING",
      confidence: 0.95,
      targetRoute: "/discover",
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: false,
      category: "general",
      highlightData: "Find & Book Care",
    };
  }

  // 5. HEALTH RECORDS & LAB REPORTS KNOWLEDGE
  if (
    t.includes("record") ||
    t.includes("report") ||
    t.includes("lab") ||
    t.includes("blood test") ||
    t.includes("test result") ||
    t.includes("scan") ||
    t.includes("x-ray") ||
    t.includes("रिपोर्ट") ||
    t.includes("रिकॉर्ड") ||
    t.includes("जांच") ||
    t.includes("ದಾಖಲೆ") ||
    t.includes("ವರದಿ") ||
    t.includes("அறிக்கை") ||
    t.includes("பதிவு") ||
    t.includes("రికార్డు") ||
    t.includes("నివేదిక")
  ) {
    const records = clinicState?.records || [];
    let spoken: string;
    if (records.length > 0) {
      const recordSummary = records
        .slice(0, 3)
        .map((r) => `${r.name} (${r.category})`)
        .join(", ");
      spoken = `Here are your health records. You have ${records.length} documents in your folder, including ${recordSummary}.`;
      if (language === "hi-IN") {
        spoken = `यहाँ आपके स्वास्थ्य रिकॉर्ड्स हैं। आपके फ़ोल्डर में ${records.length} दस्तावेज़ हैं, जिनमें ${recordSummary} शामिल हैं।`;
      } else if (language === "kn-IN") {
        spoken = `ಇಲ್ಲಿ ನಿಮ್ಮ ಆರೋಗ್ಯ ದಾಖಲೆಗಳಿವೆ. ನಿಮ್ಮ ಫೋಲ್ಡರ್‌ನಲ್ಲಿ ${records.length} ದಾಖಲೆಗಳಿವೆ: ${recordSummary}.`;
      } else if (language === "ta-IN") {
        spoken = `உங்கள் கோப்பில் ${records.length} மருத்துவ அறிக்கைகள் உள்ளன: ${recordSummary}.`;
      } else if (language === "te-IN") {
        spoken = `మీ ఫోల్డర్‌లో ${records.length} ఆరోగ్య రికార్డులు ఉన్నాయి: ${recordSummary}.`;
      }
    } else {
      spoken =
        "You currently have no health documents saved in your folder. Opening your records.";
      if (language === "hi-IN") {
        spoken =
          "आपके स्वास्थ्य फ़ोल्डर में अभी कोई दस्तावेज़ नहीं है। रिकॉर्ड्स खोले जा रहे हैं।";
      } else if (language === "kn-IN") {
        spoken =
          "ನಿಮ್ಮ ಆರೋಗ್ಯ ಫೋಲ್ಡರ್‌ನಲ್ಲಿ ಸದ್ಯಕ್ಕೆ ಯಾವುದೇ ದಾಖಲೆಗಳಿಲ್ಲ. ದಾಖಲೆಗಳನ್ನು ತೆರೆಯುತ್ತಿದ್ದೇನೆ.";
      } else if (language === "ta-IN") {
        spoken =
          "உங்கள் மருத்துவக் கோப்பில் தற்போது அறிக்கைகள் இல்லை. அறிக்கைப் பக்கத்தைத் திறக்கிறேன்.";
      } else if (language === "te-IN") {
        spoken =
          "మీ ఫోల్డర్‌లో ప్రస్తుతం ఆరోగ్య రికార్డులు లేవు. రికార్డుల పేజీని తెరుస్తున్నాను.";
      }
    }
    return {
      intent: "NAVIGATE_RECORDS",
      confidence: 0.96,
      targetRoute: "/(tabs)/records",
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: false,
      category: "records",
      highlightData: `${records.length} Active Records`,
    };
  }

  // 6. DOCTOR CONSULTATIONS & CARE PLANS KNOWLEDGE
  if (
    t.includes("doctor say") ||
    t.includes("consultation") ||
    t.includes("doctor notes") ||
    t.includes("care plan") ||
    t.includes("follow up") ||
    t.includes("सलाह") ||
    t.includes("परामर्श") ||
    t.includes("ವೈದ್ಯರ ಸಲಹೆ")
  ) {
    const consults = clinicState?.consultations || [];
    if (consults.length > 0) {
      const latest = consults[0];
      let spoken = `Here are your doctor notes. In your recent consultation, doctor advised: "${latest.text}". Follow-up plan: ${latest.followUp}.`;
      if (language === "hi-IN") {
        spoken = `यहाँ आपके डॉक्टर के नोट्स हैं। पिछली सलाह में डॉक्टर ने कहा था: "${latest.text}"। फॉलो-अप: ${latest.followUp}।`;
      } else if (language === "kn-IN") {
        spoken = `ಇಲ್ಲಿ ನಿಮ್ಮ ವೈದ್ಯರ ಟಿಪ್ಪಣಿಗಳಿವೆ. ಇತ್ತೀಚಿನ ಸಮಾಲೋಚನೆಯಲ್ಲಿ ವೈದ್ಯರು ತಿಳಿಸಿದ್ದು: "${latest.text}". ಮುಂದಿನ ಭೇಟಿ: ${latest.followUp}.`;
      } else if (language === "ta-IN") {
        spoken = `மருத்துவரின் குறிப்பு: "${latest.text}". தொடர் ஆலோசனை: ${latest.followUp}.`;
      } else if (language === "te-IN") {
        spoken = `డాక్టర్ సలహా: "${latest.text}". ఫాలో-అప్: ${latest.followUp}.`;
      }
      return {
        intent: "NAVIGATE_RECORDS",
        confidence: 0.95,
        targetRoute: "/(tabs)/records",
        spokenResponse: spoken,
        requiresConfirmation: false,
        isMedicalQuery: false,
        category: "consultation",
        highlightData: "Doctor Consultation Plan",
      };
    }
  }

  // 7. ALLERGIES & CLINICAL PROFILE ALERTS
  if (
    t.includes("allerg") ||
    t.includes("allergic") ||
    t.includes("एलर्जी") ||
    t.includes("ಅಲರ್ಜಿ")
  ) {
    const allergies =
      clinicState?.profile?.allergies || "No active allergies recorded";
    let spoken = `Your profile records indicate: ${allergies}. Always inform your visiting clinician before taking new medications.`;
    if (language === "hi-IN") {
      spoken = `आपके स्वास्थ्य प्रोफ़ाइल के अनुसार आपकी एलर्जी: ${allergies}। कोई भी नई दवा लेने से पहले डॉक्टर को ज़रूर बताएं।`;
    } else if (language === "kn-IN") {
      spoken = `ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಪ್ರಕಾರ ಅಲರ್ಜಿ ವಿವರಗಳು: ${allergies}. ಹೊಸ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಮುನ್ನ ವೈದ್ಯರಿಗೆ ತಿಳಿಸಿ.`;
    } else if (language === "ta-IN") {
      spoken = `உங்கள் சுயவிவரத்தில் உள்ள ஒவ்வாமை விவரம்: ${allergies}.`;
    } else if (language === "te-IN") {
      spoken = `మీ ప్రొఫైల్‌లో ఉన్న అలర్జీ వివరాలు: ${allergies}.`;
    }
    return {
      intent: "NAVIGATE_RECORDS",
      confidence: 0.94,
      targetRoute: "/(tabs)/records",
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: false,
      category: "allergy",
      highlightData: `Allergies: ${allergies}`,
    };
  }

  // 8. SPECIFIC MEDICINE LOOKUP (ACTIVE MEDICINES ONLY + WORD-LEVEL FUZZY MATCH)
  const medLookup = findMatchingMedicine(transcript, allMeds);
  if (medLookup.ambiguousMatches.length > 1) {
    const names = medLookup.ambiguousMatches.map((m) => m.name).join(" or ");
    let spoken = `Did you mean ${names}? Please say the medicine name again.`;
    if (language === "hi-IN") {
      spoken = `क्या आपका मतलब ${names} से था? कृपया दवा का नाम फिर से बताएं।`;
    } else if (language === "kn-IN") {
      spoken = `ನೀವು ಹೇಳಿದ್ದು ${names} ಎನ್ನುವುದಾ? ದಯವಿಟ್ಟು ಔಷಧಿಯ ಹೆಸರನ್ನು ಮತ್ತೆ ಹೇಳಿ.`;
    }
    return {
      intent: "NAVIGATE_MEDICINES",
      confidence: 0.75,
      spokenResponse: spoken,
      requiresConfirmation: true,
      isMedicalQuery: false,
      category: "medicine",
    };
  }

  if (medLookup.match) {
    const matchedMed = medLookup.match;
    const isTaken = matchedMed.logs?.[dayKey()] === "Taken";
    const statusNote = isTaken
      ? "Marked as taken today."
      : "Scheduled for today.";
    let spoken = `Here is your medicine details. ${matchedMed.name} (${matchedMed.dosage}) is scheduled for ${matchedMed.time}. ${statusNote}`;
    if (language === "hi-IN") {
      spoken = `यहाँ आपकी दवा का विवरण है। ${matchedMed.name} (${matchedMed.dosage}) का समय ${matchedMed.time} है। ${isTaken ? "आज ली जा चुकी है।" : "आज लेना बाकी है।"}`;
    } else if (language === "kn-IN") {
      spoken = `ಇಲ್ಲಿ ನಿಮ್ಮ ಔಷಧಿಯ ವಿವರವಿದೆ. ${matchedMed.name} (${matchedMed.dosage}) ಮಾತ್ರೆ ಸಮಯ ${matchedMed.time}. ${isTaken ? "ಇಂದು ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ." : "ಇಂದು ತೆಗೆದುಕೊಳ್ಳಬೇಕು."}`;
    } else if (language === "ta-IN") {
      spoken = `${matchedMed.name} (${matchedMed.dosage}) நேரம் ${matchedMed.time}. ${isTaken ? "இன்று எடுத்துக்கொள்ளப்பட்டது." : "இன்று திட்டமிடப்பட்டுள்ளது."}`;
    } else if (language === "te-IN") {
      spoken = `${matchedMed.name} (${matchedMed.dosage}) సమయం ${matchedMed.time}. ${isTaken ? "ఈరోజు వేసుకోబడింది." : "ఈరోజు షెడ్యూల్ చేయబడింది."}`;
    }
    return {
      intent: "NAVIGATE_MEDICINES",
      confidence: 0.97,
      targetRoute: "/medicines",
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: false,
      category: "medicine",
      highlightData: `${matchedMed.name} ${matchedMed.dosage}`,
      medicineId: matchedMed.id,
    };
  }

  // 9. COMPREHENSIVE DAILY MEDICINES SCHEDULE
  if (
    t.includes("medicine") ||
    t.includes("tablet") ||
    t.includes("pill") ||
    t.includes("prescription") ||
    t.includes("remind") ||
    t.includes("dose") ||
    t.includes("दवा") ||
    t.includes("माತ್ರೆ") ||
    t.includes("ಮಾತ್ರೆ") ||
    t.includes("ಔಷಧ") ||
    t.includes("மருந்து") ||
    t.includes("మందు") ||
    t.includes("ఔషధం")
  ) {
    let spoken: string;
    if (activeMeds.length > 0) {
      const medList = activeMeds.map((m) => `${m.name} at ${m.time}`).join(", ");
      spoken = `Here is your medication schedule. You have ${activeMeds.length} active medicines: ${medList}.`;
      if (language === "hi-IN") {
        spoken = `यहाँ आपकी दवाइयों का शेड्यूल है। आज आपकी ${activeMeds.length} दवाइयाँ हैं: ${medList}।`;
      } else if (language === "kn-IN") {
        spoken = `ಇಲ್ಲಿ ನಿಮ್ಮ ಔಷಧಿಗಳ ವೇಳಾಪಟ್ಟಿಯಿದೆ. ಇಂದು ನಿಮಗೆ ${activeMeds.length} ಔಷಧಿಗಳಿವೆ: ${medList}.`;
      } else if (language === "ta-IN") {
        spoken = `இது உங்கள் மருந்துகள் அட்டவணை. இன்று உங்களுக்கு ${activeMeds.length} மருந்துகள் உள்ளன: ${medList}.`;
      } else if (language === "te-IN") {
        spoken = `ఇది మీ మందుల షెడ్యూల్. ఈరోజు మీకు ${activeMeds.length} మందులు ఉన్నాయి: ${medList}.`;
      }
    } else {
      spoken =
        "You currently have no active medicines scheduled. Opening your medication page.";
      if (language === "hi-IN") {
        spoken =
          "अभी आपकी कोई सक्रिय दवाई निर्धारित नहीं है। दवाइयों का पेज खोला जा रहा है।";
      } else if (language === "kn-IN") {
        spoken =
          "ಸದ್ಯಕ್ಕೆ ನಿಮಗೆ ಯಾವುದೇ ಸಕ್ರಿಯ ಔಷಧಿಗಳಿಲ್ಲ. ಔಷಧಿ ಪುಟವನ್ನು ತೆರೆಯುತ್ತಿದ್ದೇನೆ.";
      } else if (language === "ta-IN") {
        spoken =
          "தற்போது செயலில் உள்ள மருந்துகள் எதுவும் இல்லை. மருந்துகள் பக்கத்தைத் திறக்கிறேன்.";
      } else if (language === "te-IN") {
        spoken =
          "ప్రస్తుతం మీకు చురుకైన మందులు లేవు. మందుల పేజీని తెరుస్తున్నాను.";
      }
    }
    return {
      intent: "NAVIGATE_MEDICINES",
      confidence: 0.96,
      targetRoute: "/medicines",
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: false,
      category: "medicine",
      highlightData: `${activeMeds.length} Active Prescriptions`,
    };
  }

  // 10. UPCOMING APPOINTMENTS & CLINIC VISITS (Sorted by date & slotMinutes, >= today)
  if (
    t.includes("appointment") ||
    t.includes("visit") ||
    t.includes("schedule") ||
    t.includes("doctor coming") ||
    t.includes("मुलाकात") ||
    t.includes("अपॉइंटमेंट") ||
    t.includes("ಭೇಟಿ") ||
    t.includes("ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್") ||
    t.includes("ಅಪಾಯಿಂಟ್ಮೆಂಟ್") ||
    t.includes("சந்திப்பு") ||
    t.includes("எப்போது") ||
    t.includes("అపాయింట్‌మెంట్") ||
    t.includes("ఎప్పుడు")
  ) {
    const now = referenceDate || new Date();
    const today = dayKey(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const upcoming = (clinicState?.visits || [])
      .filter((v) => {
        if (["Completed", "Cancelled"].includes(v.status)) return false;
        if (v.date > today) return true;
        if (v.date === today) {
          return slotMinutes(v.time) >= currentMinutes;
        }
        return false;
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          slotMinutes(a.time) - slotMinutes(b.time),
      );

    let spoken: string;
    let highlightData = "No Upcoming Visits";
    if (upcoming.length > 0) {
      const nextV = upcoming[0];
      const dateStr = formatDate(nextV.date);
      highlightData = `${nextV.service} on ${nextV.date}`;
      spoken = `Here is your care schedule. Your next appointment for ${nextV.service} is on ${dateStr} at ${nextV.time}. Status is ${nextV.status.toLowerCase()}.`;
      if (language === "hi-IN") {
        spoken = `यहाँ आपकी देखभाल का शेड्यूल है। आपकी अगली मुलाकात ${nextV.service} के लिए ${dateStr} को ${nextV.time} बजे है।`;
      } else if (language === "kn-IN") {
        spoken = `ಇಲ್ಲಿ ನಿಮ್ಮ ಭೇಟಿಗಳ ವಿವರವಿದೆ. ನಿಮ್ಮ ಮುಂದಿನ ಭೇಟಿ ${nextV.service} ಗಾಗಿ ${dateStr} ರಂದು ${nextV.time} ಕ್ಕೆ ಇದೆ.`;
      } else if (language === "ta-IN") {
        spoken = `உங்கள் அடுத்த சந்திப்பு ${nextV.service}க்காக ${dateStr} அன்று ${nextV.time} மணிக்கு உள்ளது.`;
      } else if (language === "te-IN") {
        spoken = `మీ తదుపరి అపాయింట్‌మెంట్ ${nextV.service} కోసం ${dateStr}న ${nextV.time} గంటలకు ఉంది.`;
      }
    } else {
      spoken =
        "You currently have no upcoming appointments scheduled. Opening appointments.";
      if (language === "hi-IN") {
        spoken =
          "आपकी कोई आगामी मुलाकात निर्धारित नहीं है। अपॉइंटमेंट पेज खोला जा रहा है।";
      } else if (language === "kn-IN") {
        spoken =
          "ನಿಮ್ಮ ಮುಂದಿನ ಭೇಟಿಗಳು ಯಾವುವೂ ನಿಗದಿಯಾಗಿಲ್ಲ. ಭೇಟಿಗಳ ಪುಟವನ್ನು ತೆರೆಯುತ್ತಿದ್ದೇನೆ.";
      } else if (language === "ta-IN") {
        spoken =
          "வரவிருக்கும் சந்திப்புகள் எதுவும் இல்லை. சந்திப்புகள் பக்கத்தைத் திறக்கிறேன்.";
      } else if (language === "te-IN") {
        spoken =
          "రాబోయే అపాయింట్‌మెంట్‌లు ఏవీ లేవు. అపాయింట్‌మెంట్‌ల పేజీని తెరుస్తున్నాను.";
      }
    }
    return {
      intent: "QUERY_NEXT_APPOINTMENT",
      confidence: 0.97,
      targetRoute: "/(tabs)/appointments",
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: false,
      category: "appointment",
      highlightData,
    };
  }

  // 11. LOCALIZED INTENT FALLBACK (Shares Tamil/Telugu/Hindi/Kannada coverage with voice-adapter)
  const localized = resolveVoiceIntent(transcript, language);
  if (localized.intent !== "UNKNOWN_INTENT") {
    return {
      ...localized,
      category: "general",
    };
  }

  return {
    ...localized,
    category: "general",
  };
}
