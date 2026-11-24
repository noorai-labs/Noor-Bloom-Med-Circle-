/**
 * Unified Patient Knowledge & Multi-Turn Context Engine for BLOOM MED
 * Connects the voice agent to the entire patient universe:
 * - Health records & diagnostic lab reports (CBC, Lipid profile, X-ray)
 * - Doctor consultations, prescriptions, and follow-up care instructions
 * - Active medicine schedules, dosages, adherence logs, and fuzzy name matching
 * - Vitals, allergy alerts, and care circle access permissions
 * - Multi-turn conversational memory (context persistence across turns)
 * - Clinical safety guardrails and emergency distress detection
 */

import { ClinicState, Medicine, formatDate } from "./clinic";
import { VoiceIntentResolution, VoiceLanguage } from "./voice-types";

export interface ConversationTurn {
  user: string;
  bloom: string;
  topic?: "medicines" | "appointments" | "records" | "consultations" | "allergies" | "care_circle" | "emergency";
  entityName?: string;
}

export interface AdvancedVoiceResponse extends VoiceIntentResolution {
  category?: "records" | "consultation" | "medicine" | "appointment" | "allergy" | "care_circle" | "emergency" | "general";
  isEmergencyAlert?: boolean;
  highlightData?: string;
}

/**
 * Fuzzy matches spoken text against the patient's active prescribed medicines
 * (Handles phonetic spelling / STT transcription variations like "metaformin" -> "Metformin")
 */
export function findMatchingMedicine(
  transcript: string,
  medicines: Medicine[]
): Medicine | null {
  const clean = transcript.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const med of medicines) {
    const medClean = med.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      clean.includes(medClean) ||
      medClean.includes(clean) ||
      levenshteinDistance(clean, medClean) <= 3
    ) {
      return med;
    }
    // Also match individual words
    const words = med.name.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length > 3 && clean.includes(w)) {
        return med;
      }
    }
  }
  return null;
}

/**
 * Levenshtein Distance for fuzzy entity matching
 */
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
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Evaluates patient transcript against the comprehensive clinic state and multi-turn history
 */
export function evaluatePatientKnowledge(
  transcript: string,
  language: VoiceLanguage = "en-IN",
  clinicState?: ClinicState | null,
  history: ConversationTurn[] = []
): AdvancedVoiceResponse {
  const t = transcript.toLowerCase().trim();
  const lastTurn = history.length > 0 ? history[history.length - 1] : null;

  // 1. EMERGENCY DISTRESS DETECTION (Highest Priority Safety Guardrail)
  if (
    t.includes("chest pain") ||
    t.includes("cannot breathe") ||
    t.includes("can't breathe") ||
    t.includes("collapsed") ||
    t.includes("severe dizziness") ||
    t.includes("heart attack") ||
    t.includes("chhati me dard") ||
    t.includes("saans nahi") ||
    t.includes("छाती में दर्द") ||
    t.includes("सांस") ||
    t.includes("ಎದೆ ನೋವು") ||
    t.includes("ಉಸಿರಾಟ")
  ) {
    let spoken =
      "Please sit down and remain calm. I am alerting your emergency contacts and opening immediate medical support.";
    if (language === "hi-IN") {
      spoken =
        "कृपया तुरंत बैठ जाएँ और शांत रहें। मैं आपके आपातकालीन संपर्क और सहायता को तुरंत अलर्ट कर रही हूँ।";
    } else if (language === "kn-IN") {
      spoken =
        "ದಯವಿಟ್ಟು ತಕ್ಷಣ ಕುಳಿತುಕೊಳ್ಳಿ ಮತ್ತು ಶಾಂತರಾಗಿರಿ. ನಾನು ನಿಮ್ಮ ತುರ್ತು ಸಂಪರ್ಕಗಳನ್ನು ಎಚ್ಚರಿಸುತ್ತಿದ್ದೇನೆ.";
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
      highlightData: "Emergency Distress Detected",
    };
  }

  // 2. MULTI-TURN FOLLOW-UP EVALUATION
  // e.g. User previously asked about a medicine and now asks "When should I take it?" or "Take it with food?"
  if (
    lastTurn?.entityName &&
    (t.includes("with food") ||
      t.includes("before food") ||
      t.includes("after food") ||
      t.includes("when should i take") ||
      t.includes("how to take") ||
      t.includes("khana khane ke baad") ||
      t.includes("khana khane se pehle") ||
      t.includes("ಊಟದ ನಂತರ") ||
      t.includes("ಊಟಕ್ಕೆ ಮುಂಚೆ"))
  ) {
    const medName = lastTurn.entityName;
    let spoken = `Regarding ${medName}, please take it as directed by your clinician, typically after a meal with a full glass of water. Opening your prescriptions.`;
    if (language === "hi-IN") {
      spoken = `${medName} के बारे में: कृपया इसे डॉक्टर के निर्देशानुसार भोजन के बाद पानी के साथ लें।`;
    } else if (language === "kn-IN") {
      spoken = `${medName} ಬಗ್ಗೆ: ದಯವಿಟ್ಟು ವೈದ್ಯರ ಸೂಚನೆಯಂತೆ ಊಟದ ನಂತರ ನೀರಿನೊಂದಿಗೆ ತೆಗೆದುಕೊಳ್ಳಿ.`;
    }
    return {
      intent: "NAVIGATE_MEDICINES",
      confidence: 0.95,
      targetRoute: "/medicines",
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: false,
      category: "medicine",
      highlightData: medName,
    };
  }

  // 3. HEALTH RECORDS & LAB REPORTS KNOWLEDGE
  if (
    t.includes("record") ||
    t.includes("report") ||
    t.includes("lab") ||
    t.includes("blood test") ||
    t.includes("test result") ||
    t.includes("scan") ||
    t.includes("x-ray") ||
    t.includes("रिपोर्ट") ||
    t.includes("जांच") ||
    t.includes("ದಾಖಲೆ") ||
    t.includes("ವರದಿ")
  ) {
    const records = clinicState?.records || [];
    if (records.length > 0) {
      const recordSummary = records
        .slice(0, 3)
        .map((r) => `${r.name} (${r.category})`)
        .join(", ");

      let spoken = `Here are your health records. You have ${records.length} documents in your folder, including ${recordSummary}.`;
      if (language === "hi-IN") {
        spoken = `यहाँ आपके स्वास्थ्य रिकॉर्ड्स हैं। आपके फ़ोल्डर में ${records.length} दस्तावेज़ हैं, जिनमें ${recordSummary} शामिल हैं।`;
      } else if (language === "kn-IN") {
        spoken = `ಇಲ್ಲಿ ನಿಮ್ಮ ಆರೋಗ್ಯ ದಾಖಲೆಗಳಿವೆ. ನಿಮ್ಮ ಫೋಲ್ಡರ್‌ನಲ್ಲಿ ${records.length} ದಾಖಲೆಗಳಿವೆ: ${recordSummary}.`;
      } else if (language === "ta-IN") {
        spoken = `உங்கள் கோப்பில் ${records.length} மருத்துவ அறிக்கைகள் உள்ளன.`;
      } else if (language === "te-IN") {
        spoken = `మీ ఫోల్డర్‌లో ${records.length} ఆరోగ్య రికార్డులు ఉన్నాయి.`;
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
  }

  // 4. DOCTOR CONSULTATIONS & CARE PLANS KNOWLEDGE
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
      let spoken = `In your recent consultation, doctor advised: "${latest.text}". Follow-up plan: ${latest.followUp}. Opening your consultation notes.`;
      if (language === "hi-IN") {
        spoken = `आपकी पिछली सलाह में डॉक्टर ने कहा था: "${latest.text}"। फॉलो-अप: ${latest.followUp}।`;
      } else if (language === "kn-IN") {
        spoken = `ಇತ್ತೀಚಿನ ಸಮಾಲೋಚನೆಯಲ್ಲಿ ವೈದ್ಯರು ತಿಳಿಸಿದ್ದು: "${latest.text}". ಮುಂದಿನ ಭೇಟಿ: ${latest.followUp}.`;
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

  // 5. ALLERGIES & CLINICAL PROFILE ALERTS
  if (
    t.includes("allerg") ||
    t.includes("allergic") ||
    t.includes("एलर्जी") ||
    t.includes("ಅಲರ್ಜಿ")
  ) {
    const allergies = clinicState?.profile?.allergies || "No active allergies recorded";
    let spoken = `Your profile records indicate: ${allergies}. Always inform your visiting clinician before taking new medications.`;
    if (language === "hi-IN") {
      spoken = `आपके स्वास्थ्य प्रोफ़ाइल के अनुसार आपकी एलर्जी: ${allergies}। कोई भी नई दवा लेने से पहले डॉक्टर को ज़रूर बताएं।`;
    } else if (language === "kn-IN") {
      spoken = `ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಪ್ರಕಾರ ಅಲರ್ಜಿ ವಿವರಗಳು: ${allergies}. ಹೊಸ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಮುನ್ನ ವೈದ್ಯರಿಗೆ ತಿಳಿಸಿ.`;
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

  // 6. SPECIFIC MEDICINE LOOKUP (FUZZY MATCHING)
  const allMeds = clinicState?.medicines || [];
  const matchedMed = findMatchingMedicine(t, allMeds);
  if (matchedMed) {
    const isTaken = matchedMed.logs && Object.values(matchedMed.logs).includes("Taken");
    const statusNote = isTaken ? "Marked as taken today." : "Scheduled for today.";
    let spoken = `Here is your medicine details. ${matchedMed.name} (${matchedMed.dosage}) is scheduled for ${matchedMed.time}. ${statusNote}`;
    if (language === "hi-IN") {
      spoken = `यहाँ आपकी दवा का विवरण है। ${matchedMed.name} (${matchedMed.dosage}) का समय ${matchedMed.time} है। ${isTaken ? "आज ली जा चुकी है।" : "आज लेना बाकी है।"}`;
    } else if (language === "kn-IN") {
      spoken = `ಇಲ್ಲಿ ನಿಮ್ಮ ಔಷಧಿಯ ವಿವರವಿದೆ. ${matchedMed.name} (${matchedMed.dosage}) ಮಾತ್ರೆ ಸಮಯ ${matchedMed.time}. ${isTaken ? "ಇಂದು ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ." : "ಇಂದು ತೆಗೆದುಕೊಳ್ಳಬೇಕು."}`;
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
    };
  }

  // 7. COMPREHENSIVE DAILY MEDICINES SCHEDULE
  if (
    t.includes("medicine") ||
    t.includes("tablet") ||
    t.includes("pill") ||
    t.includes("prescription") ||
    t.includes("dose") ||
    t.includes("दवा") ||
    t.includes("माತ್ರೆ") ||
    t.includes("மருந்து") ||
    t.includes("మందు")
  ) {
    const activeMeds = allMeds.filter((m) => m.active);
    if (activeMeds.length > 0) {
      const medList = activeMeds.map((m) => `${m.name} at ${m.time}`).join(", ");
      let spoken = `Here is your medication schedule. You have ${activeMeds.length} active medicines: ${medList}.`;
      if (language === "hi-IN") {
        spoken = `यहाँ आपकी दवाइयों का शेड्यूल है। आज आपकी ${activeMeds.length} दवाइयाँ हैं: ${medList}।`;
      } else if (language === "kn-IN") {
        spoken = `ಇಲ್ಲಿ ನಿಮ್ಮ ಔಷಧಿಗಳ ವೇಳಾಪಟ್ಟಿಯಿದೆ. ಇಂದು ನಿಮಗೆ ${activeMeds.length} ಔಷಧಿಗಳಿವೆ: ${medList}.`;
      } else if (language === "ta-IN") {
        spoken = `இன்று உங்களுக்கு ${activeMeds.length} மருந்துகள் உள்ளன: ${medList}.`;
      } else if (language === "te-IN") {
        spoken = `ఈరోజు మీకు ${activeMeds.length} మందులు ఉన్నాయి: ${medList}.`;
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
  }

  // 8. UPCOMING APPOINTMENTS & CLINIC VISITS
  if (
    t.includes("appointment") ||
    t.includes("visit") ||
    t.includes("doctor coming") ||
    t.includes("मुलाकात") ||
    t.includes("अपॉइंटमेंट") ||
    t.includes("ಭೇಟಿ") ||
    t.includes("ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್")
  ) {
    const upcoming = (clinicState?.visits || []).filter(
      (v) => !["Completed", "Cancelled"].includes(v.status)
    );
    if (upcoming.length > 0) {
      const nextV = upcoming[0];
      const dateStr = formatDate(nextV.date);
      let spoken = `Here is your care schedule. Your next appointment for ${nextV.service} is on ${dateStr} at ${nextV.time}. Status is ${nextV.status.toLowerCase()}.`;
      if (language === "hi-IN") {
        spoken = `यहाँ आपकी देखभाल का शेड्यूल है। आपकी अगली मुलाकात ${nextV.service} के लिए ${dateStr} को ${nextV.time} बजे है।`;
      } else if (language === "kn-IN") {
        spoken = `ಇಲ್ಲಿ ನಿಮ್ಮ ಭೇಟಿಗಳ ವಿವರವಿದೆ. ನಿಮ್ಮ ಮುಂದಿನ ಭೇಟಿ ${nextV.service} ಗಾಗಿ ${dateStr} ರಂದು ${nextV.time} ಕ್ಕೆ ಇದೆ.`;
      }
      return {
        intent: "QUERY_NEXT_APPOINTMENT",
        confidence: 0.97,
        targetRoute: "/(tabs)/appointments",
        spokenResponse: spoken,
        requiresConfirmation: false,
        isMedicalQuery: false,
        category: "appointment",
        highlightData: `${nextV.service} on ${nextV.date}`,
      };
    }
  }

  // 9. FIND CARE & BOOKING
  if (
    t.includes("book") ||
    t.includes("find doctor") ||
    t.includes("find nurse") ||
    t.includes("home visit") ||
    t.includes("बुक") ||
    t.includes("ಬುಕ್")
  ) {
    let spoken =
      "Here is the care directory. You can discover available doctors and nurses for clinic or home care.";
    if (language === "hi-IN") {
      spoken =
        "यहाँ केयर डायरेक्टरी है। आप क्लिनिक या होम विज़िट के लिए उपलब्ध डॉक्टर और नर्स देख सकते हैं।";
    } else if (language === "kn-IN") {
      spoken =
        "ಇಲ್ಲಿ ಆರೋಗ್ಯ ಸೇವಾ ಪಟ್ಟಿಯಿದೆ. ನೀವು ಲಭ್ಯವಿರುವ ವೈದ್ಯರು ಮತ್ತು ನರ್ಸ್‌ಗಳನ್ನು ಆಯ್ಕೆ ಮಾಡಬಹುದು.";
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

  // 10. CLINICAL SAFETY REFUSAL (Unprescribed Treatment & Diagnosis)
  if (
    t.includes("headache") ||
    t.includes("fever") ||
    t.includes("what should i take for") ||
    t.includes("cure") ||
    t.includes("diagnose") ||
    t.includes("सिरदर्द") ||
    t.includes("बुखार") ||
    t.includes("ತಲೆನೋವು") ||
    t.includes("ಜ್ವರ")
  ) {
    let spoken =
      "I cannot recommend treatments or diagnose symptoms. Please consult your registered doctor or book a home visit. I can help book a consultation.";
    if (language === "hi-IN") {
      spoken =
        "मैं लक्षणों की जांच या इलाज की दवा नहीं बता सकती। कृपया अपने डॉक्टर से सलाह लें या होम विजिट बुक करें।";
    } else if (language === "kn-IN") {
      spoken =
        "ನಾನು ಚಿಕಿತ್ಸೆ ಅಥವಾ ಔಷಧಿಗಳನ್ನು ಶಿಫಾರಸು ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.";
    }
    return {
      intent: "MEDICAL_QUERY_REFUSAL",
      confidence: 0.98,
      spokenResponse: spoken,
      requiresConfirmation: false,
      isMedicalQuery: true,
      category: "general",
      highlightData: "Clinical Safety Guardrail",
    };
  }

  // 11. GENERAL SMART ASSISTANT FALLBACK
  let fallbackSpoken =
    "I'm Bloom, your healthcare assistant. You can ask me about your medications, doctor notes, lab reports, or upcoming appointments.";
  if (language === "hi-IN") {
    fallbackSpoken =
      "मैं ब्लूम हूँ। आप मुझसे अपनी दवाइयों, डॉक्टर की सलाह, लैब रिपोर्ट्स या अगली मुलाकातों के बारे में पूछ सकते हैं।";
  } else if (language === "kn-IN") {
    fallbackSpoken =
      "ನಾನು ಬ್ಲೂಮ್. ನಿಮ್ಮ ಮಾತ್ರೆಗಳು, ವೈದ್ಯರ ಟಿಪ್ಪಣಿಗಳು, ಲ್ಯಾಬ್ ವರದಿಗಳು ಅಥವಾ ಭೇಟಿಗಳ ಬಗ್ಗೆ ನನ್ನನ್ನು ಕೇಳಬಹುದು.";
  }
  return {
    intent: "UNKNOWN_INTENT",
    confidence: 0.8,
    spokenResponse: fallbackSpoken,
    requiresConfirmation: false,
    isMedicalQuery: false,
    category: "general",
  };
}
