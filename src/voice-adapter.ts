/**
 * Multilingual Voice Pipeline Adapter & Intent Resolver for BLOOM MED
 * Part of Week 2 deliverable: feature/roshan/voice-help-prototype
 * Supports English (en-IN), Hindi (hi-IN), Kannada (kn-IN), Tamil (ta-IN), Telugu (te-IN)
 */

import {
  VoiceIntentResolution,
  VoiceLanguage,
  VoiceRecognitionResult,
} from "./voice-types";

export interface SpeechProviderAdapter {
  transcribeTestAudio(
    testPhrase: string,
    language?: VoiceLanguage
  ): Promise<VoiceRecognitionResult>;
  resolveIntent(
    transcript: string,
    language?: VoiceLanguage
  ): VoiceIntentResolution;
  synthesizeSpeech(
    text: string,
    language?: VoiceLanguage
  ): Promise<{ synthesized: boolean; durationMs: number }>;
}

export const SUPPORTED_VOICE_LANGUAGES: {
  code: VoiceLanguage;
  label: string;
  nativeLabel: string;
}[] = [
  { code: "en-IN", label: "English (India)", nativeLabel: "English" },
  { code: "hi-IN", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "kn-IN", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
  { code: "ta-IN", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "te-IN", label: "Telugu", nativeLabel: "తెలుగు" },
];

export const MOCK_TEST_PHRASES: Record<VoiceLanguage, string[]> = {
  "en-IN": [
    "When is my next appointment?",
    "Show my medicines",
    "Show my reports",
    "Book a nurse for home visit",
    "What medicine should I take for headache?",
    "Emergency help",
  ],
  "hi-IN": [
    "मेरी दवाइयाँ दिखाओ",
    "मेरी अगली मुलाकात कब है?",
    "मेरी स्वास्थ्य रिपोर्ट दिखाओ",
    "डॉक्टर या नर्स बुक करें",
    "सिरदर्द के लिए कौन सी दवा लूँ?",
    "आपातकालीन सहायता",
  ],
  "kn-IN": [
    "ನನ್ನ ಮಾತ್ರೆಗಳು ತೋರಿಸಿ",
    "ನನ್ನ ಮುಂದಿನ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಯಾವಾಗ?",
    "ಆರೋಗ್ಯ ದಾಖಲೆಗಳನ್ನು ತೋರಿಸಿ",
    "ಮನೆಗೆ ನರ್ಸ್ ಬುಕ್ ಮಾಡಿ",
    "ತಲೆನೋವಿಗೆ ಯಾವ ಮಾತ್ರೆ ತೆಗೆದುಕೊಳ್ಳಬೇಕು?",
    "ತುರ್ತು ಸಹಾಯ",
  ],
  "ta-IN": [
    "என் மருந்துகளை காட்டு",
    "எனது அடுத்த சந்திப்பு எப்போது?",
    "மருத்துவ அறிக்கைகளை காட்டு",
    "செவிலியரை பதிவு செய்",
    "தலைவலிக்கு என்ன மாத்திரை எடுக்க வேண்டும்?",
    "அவசர உதவி",
  ],
  "te-IN": [
    "నా మందులను చూపించు",
    "నా తదుపరి అపాయింట్‌మెంట్ ఎప్పుడు?",
    "ఆరోగ్య నివేదికలను చూపించు",
    "నర్సును బుక్ చేయండి",
    "తలనొప్పికి ఏ మందు వేసుకోవాలి?",
    "అత్యవసర సహాయం",
  ],
};

// Response message catalog across Indian languages
const RESPONSES = {
  MEDICAL_REFUSAL: {
    "en-IN":
      "I cannot recommend treatments or diagnose symptoms. Please consult a registered doctor or book a home visit.",
    "hi-IN":
      "मैं लक्षणों की जांच या इलाज की दवा नहीं बता सकती। कृपया पंजीकृत डॉक्टर से सलाह लें या होम विजिट बुक करें।",
    "kn-IN":
      "ನಾನು ಚಿಕಿತ್ಸೆ ಅಥವಾ ಔಷಧಿಗಳನ್ನು ಶಿಫಾರಸು ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ನೋಂದಾಯಿತ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ ಅಥವಾ ಮನೆ ಭೇಟಿ ಬುಕ್ ಮಾಡಿ.",
    "ta-IN":
      "நான் சிகிச்சைகளை பரிந்துரைக்கவோ அறிகுறிகளைக் கண்டறியவோ முடியாது. தயவுசெய்து பதிவுசெய்த மருத்துவரை அணுகவும்.",
    "te-IN":
      "నేను చికిత్సలు లేదా రోగ నిర్ధారణ చేయలేను. దయచేసి అర్హత కలిగిన వైద్యుడిని సంప్రదించండి.",
  },
  EMERGENCY: {
    "en-IN": "Opening emergency support. Stay calm, help is ready.",
    "hi-IN": "आपातकालीन सहायता खोली जा रही है। शांत रहें, मदद तैयार है।",
    "kn-IN": "ತುರ್ತು ಸಹಾಯವನ್ನು ತೆರೆಯಲಾಗುತ್ತಿದೆ. ಶಾಂತರಾಗಿರಿ, ಸಹಾಯ ಸಿದ್ಧವಾಗಿದೆ.",
    "ta-IN": "அவசர உதவி திறக்கப்படுகிறது. அமைதியாக இருங்கள், உதவி தயாராக உள்ளது.",
    "te-IN": "అత్యవసర మద్దతు తెరవబడుతోంది. ప్రశాంతంగా ఉండండి, సహాయం సిద్ధంగా ఉంది.",
  },
  MEDICINES: {
    "en-IN":
      "Opening your medicines routine. You can track your daily doses and reminders here.",
    "hi-IN":
      "आपकी दवाओं का रूटीन खोला जा रहा है। यहाँ आप दैनिक खुराक और रिमाइंडर देख सकते हैं।",
    "kn-IN":
      "ನಿಮ್ಮ ಔಷಧಿಗಳ ಪಟ್ಟಿಯನ್ನು ತೆರೆಯಲಾಗುತ್ತಿದೆ. ನಿಮ್ಮ ದೈನಂದಿನ ಮಾತ್ರೆಗಳು ಇಲ್ಲಿವೆ.",
    "ta-IN": "உங்கள் மருந்துகள் பட்டியல் திறக்கப்படுகிறது.",
    "te-IN": "మీ మందుల వివరాలు తెరవబడుతున్నాయి.",
  },
  APPOINTMENTS: {
    "en-IN": "Opening your care calendar to review your scheduled visits.",
    "hi-IN":
      "आपका अपॉइंटमेंट कैलेंडर खोला जा रहा है। यहाँ आपकी आगामी मुलाकातें हैं।",
    "kn-IN":
      "ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಕ್ಯಾಲೆಂಡರ್ ತೆರೆಯಲಾಗುತ್ತಿದೆ. ಮುಂಬರುವ ಭೇಟಿಗಳು ಇಲ್ಲಿವೆ.",
    "ta-IN": "உங்கள் சந்திப்புகள் காலண்டர் திறக்கப்படுகிறது.",
    "te-IN": "మీ అపాయింట్‌మెంట్ క్యాలెండర్ తెరవబడుతోంది.",
  },
  RECORDS: {
    "en-IN":
      "Opening your health records folder. Your uploaded documents and care plans are here.",
    "hi-IN":
      "आपके स्वास्थ्य रिकॉर्ड खोले जा रहे हैं। आपकी रिपोर्ट और दस्तावेज यहाँ हैं।",
    "kn-IN": "ನಿಮ್ಮ ಆರೋಗ್ಯ ದಾಖಲೆಗಳು ಮತ್ತು ವರದಿಗಳನ್ನು ತೆರೆಯಲಾಗುತ್ತಿದೆ.",
    "ta-IN": "உங்கள் மருத்துவ பதிவுகள் திறக்கப்படுகின்றன.",
    "te-IN": "మీ ఆరోగ్య రికార్డులు తెరవబడుతున్నాయి.",
  },
  BOOKING: {
    "en-IN":
      "Opening care discovery. You can browse verified doctors and nurses for home care.",
    "hi-IN":
      "केयर डिस्कवरी खोली जा रही है। यहाँ आप डॉक्टर और नर्स बुक कर सकते हैं।",
    "kn-IN":
      "ಕೇರ್ ಡಿಸ್ಕವರಿ ತೆರೆಯಲಾಗುತ್ತಿದೆ. ನೀವು ವೈದ್ಯರು ಮತ್ತು ನರ್ಸ್‌ಗಳನ್ನು ಬುಕ್ ಮಾಡಬಹುದು.",
    "ta-IN": "மருத்துவர் மற்றும் செவிலியர் பதிவு பக்கம் திறக்கப்படுகிறது.",
    "te-IN": "డాక్టర్ మరియు నర్సు బుకింగ్ పేజీ తెరవబడుతోంది.",
  },
  GREETING: {
    "en-IN":
      "Hello! I am Bloom, your healthcare companion. How can I help you today?",
    "hi-IN":
      "नमस्ते! मैं ब्लूम हूँ, आपकी स्वास्थ्य सहायिका। मैं आपकी क्या मदद करूँ?",
    "kn-IN":
      "ನಮಸ್ಕಾರ! ನಾನು ಬ್ಲೂಮ್, ನಿಮ್ಮ ಆರೋಗ್ಯ ಸಹಾಯಕ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
    "ta-IN": "வணக்கம்! நான் ப்ளூம், உங்கள் நல்வாழ்வு உதவியாளர்.",
    "te-IN": "నమస్కారం! నేను బ్లూమ్, మీ ఆరోగ్య సహాయకురాలిని.",
  },
  UNKNOWN: {
    "en-IN":
      "I can help you navigate appointments, medicines, reports, and booking. What would you like to open?",
    "hi-IN":
      "मैं आपकी मुलाकातें, दवाइयाँ, रिपोर्ट और बुकिंग खोलने में मदद कर सकती हूँ। आप क्या देखना चाहते हैं?",
    "kn-IN":
      "ನಾನು ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್, ಮಾತ್ರೆಗಳು, ವರದಿಗಳು ಮತ್ತು ಬುಕಿಂಗ್ ತೆರೆಯಲು ಸಹಾಯ ಮಾಡಬಲ್ಲೆ. ನೀವು ಏನನ್ನು ನೋಡಲು ಬಯಸುತ್ತೀರಿ?",
    "ta-IN":
      "சந்திப்புகள், மருந்துகள், அறிக்கைகள் மற்றும் பதிவுகளை திறக்க உதவ முடியும்.",
    "te-IN":
      "నేను అపాయింట్‌మెంట్‌లు, మందులు మరియు రికార్డులను తెరవడానికి సహాయం చేయగలను.",
  },
};

export function resolveVoiceIntent(
  rawTranscript: string,
  language: VoiceLanguage = "en-IN"
): VoiceIntentResolution {
  const t = rawTranscript.toLowerCase().trim();
  const langKey = RESPONSES.MEDICAL_REFUSAL[language] ? language : "en-IN";

  // 1. Clinical Safety Guardrail (Highest Priority)
  // Matches English, Hindi (Devanagari + Roman), Kannada, Tamil, Telugu
  if (
    t.includes("headache") ||
    t.includes("fever") ||
    t.includes("diagnose") ||
    t.includes("dose") ||
    t.includes("what medicine should i take") ||
    t.includes("cure") ||
    t.includes("symptom") ||
    t.includes("pain") ||
    // Hindi
    t.includes("सिरदर्द") ||
    t.includes("बुखार") ||
    t.includes("दर्द") ||
    t.includes("इलाज") ||
    t.includes("sirdard") ||
    t.includes("bukhar") ||
    t.includes("dawa len") ||
    // Kannada
    t.includes("ತಲೆನೋವ") ||
    t.includes("ತಲೆನೋವು") ||
    t.includes("ಜ್ವರ") ||
    t.includes("ನೋವ") ||
    t.includes("ನೋವು") ||
    t.includes("ಚಿಕಿತ್ಸೆ") ||
    t.includes("ಯಾವ ಮಾತ್ರೆ") ||
    t.includes("talenov") ||
    t.includes("talenovu") ||
    t.includes("jvara") ||
    // Tamil
    t.includes("தலைவலி") ||
    t.includes("காய்ச்சல்") ||
    // Telugu
    t.includes("తలనొప్పి") ||
    t.includes("జ్వరం")
  ) {
    return {
      intent: "MEDICAL_QUERY_REFUSAL",
      confidence: 0.98,
      spokenResponse: RESPONSES.MEDICAL_REFUSAL[langKey],
      requiresConfirmation: false,
      isMedicalQuery: true,
    };
  }

  // 2. Emergency SOS
  if (
    t.includes("emergency") ||
    t.includes("sos") ||
    t.includes("ambulance") ||
    t.includes("urgent help") ||
    // Hindi
    t.includes("आपातकाल") ||
    t.includes("मदद") ||
    t.includes("इमरजेंसी") ||
    t.includes("एम्बुलेंस") ||
    t.includes("madad") ||
    // Kannada
    t.includes("ತುರ್ತು") ||
    t.includes("ಸಹಾಯ") ||
    t.includes("ಆಂಬ್ಯುಲೆನ್ಸ್") ||
    t.includes("thurtu") ||
    // Tamil
    t.includes("அவசரம்") ||
    t.includes("உதவி") ||
    // Telugu
    t.includes("అత్యవసరం") ||
    t.includes("సహాయం")
  ) {
    return {
      intent: "EMERGENCY_SOS",
      confidence: 0.99,
      targetRoute: "/sos",
      spokenResponse: RESPONSES.EMERGENCY[langKey],
      requiresConfirmation: true,
      isMedicalQuery: false,
    };
  }

  // 3. Navigation: Medicines
  if (
    t.includes("medicine") ||
    t.includes("pill") ||
    t.includes("prescription") ||
    t.includes("remind") ||
    t.includes("dose") ||
    t.includes("tablets") ||
    // Hindi
    t.includes("दवा") ||
    t.includes("दवाई") ||
    t.includes("दवाइयाँ") ||
    t.includes("गोली") ||
    t.includes("dawai") ||
    t.includes("davai") ||
    t.includes("dawa") ||
    // Kannada
    t.includes("ಮಾತ್ರೆ") ||
    t.includes("ಔಷಧ") ||
    t.includes("ಮಾತ್ರೆಗಳು") ||
    t.includes("maathre") ||
    t.includes("aushadha") ||
    // Tamil
    t.includes("மருந்து") ||
    t.includes("மருந்துகள்") ||
    // Telugu
    t.includes("మందులు") ||
    t.includes("ఔషధం")
  ) {
    return {
      intent: "NAVIGATE_MEDICINES",
      confidence: 0.95,
      targetRoute: "/medicines",
      spokenResponse: RESPONSES.MEDICINES[langKey],
      requiresConfirmation: false,
      isMedicalQuery: false,
    };
  }

  // 4. Navigation: Appointments / Visits
  if (
    t.includes("appointment") ||
    t.includes("visit") ||
    t.includes("doctor appointment") ||
    t.includes("when is my next") ||
    t.includes("schedule") ||
    t.includes("booking status") ||
    // Hindi
    t.includes("अपॉइंटमेंट") ||
    t.includes("मुलाकात") ||
    t.includes("कब है") ||
    t.includes("doctor kab") ||
    // Kannada
    t.includes("ಭೇಟಿ") ||
    t.includes("ಅಪಾಯಿಂಟ್ಮೆಂಟ್") ||
    t.includes("ನೇಮಕಾತಿ") ||
    t.includes("ಯಾವಾಗ") ||
    t.includes("bheti") ||
    // Tamil
    t.includes("சந்திப்பு") ||
    t.includes("எப்போது") ||
    // Telugu
    t.includes("అపాయింట్‌మెంట్") ||
    t.includes("ఎప్పుడు")
  ) {
    return {
      intent: "QUERY_NEXT_APPOINTMENT",
      confidence: 0.96,
      targetRoute: "/(tabs)/appointments",
      spokenResponse: RESPONSES.APPOINTMENTS[langKey],
      requiresConfirmation: false,
      isMedicalQuery: false,
    };
  }

  // 5. Navigation: Records & Reports
  if (
    t.includes("report") ||
    t.includes("record") ||
    t.includes("lab") ||
    t.includes("blood test") ||
    t.includes("documents") ||
    // Hindi
    t.includes("रिपोर्ट") ||
    t.includes("रिकॉर्ड") ||
    t.includes("जांच") ||
    t.includes("पर्चा") ||
    // Kannada
    t.includes("ದಾಖಲೆ") ||
    t.includes("ವರದಿ") ||
    t.includes("ವರದಿಗಳು") ||
    t.includes("varadi") ||
    // Tamil
    t.includes("அறிக்கை") ||
    t.includes("பதிவு") ||
    // Telugu
    t.includes("రికార్డు") ||
    t.includes("నివేదిక")
  ) {
    return {
      intent: "NAVIGATE_RECORDS",
      confidence: 0.94,
      targetRoute: "/(tabs)/records",
      spokenResponse: RESPONSES.RECORDS[langKey],
      requiresConfirmation: false,
      isMedicalQuery: false,
    };
  }

  // 6. Navigation: Booking / Find Care
  if (
    t.includes("book") ||
    t.includes("doctor") ||
    t.includes("nurse") ||
    t.includes("physio") ||
    t.includes("find care") ||
    t.includes("specialist") ||
    // Hindi
    t.includes("बुक") ||
    t.includes("डॉक्टर") ||
    t.includes("नर्स") ||
    // Kannada
    t.includes("ವೈದ್ಯ") ||
    t.includes("ಬುಕ್") ||
    t.includes("ಶುಶ್ರೂಷಕಿ") ||
    // Tamil
    t.includes("பதிவு") ||
    t.includes("மருத்துவர்") ||
    // Telugu
    t.includes("బుకింగ్") ||
    t.includes("వైద్యుడు")
  ) {
    return {
      intent: "NAVIGATE_BOOKING",
      confidence: 0.92,
      targetRoute: "/discover",
      spokenResponse: RESPONSES.BOOKING[langKey],
      requiresConfirmation: false,
      isMedicalQuery: false,
    };
  }

  // 7. Conversational greetings
  if (
    t.startsWith("hello") ||
    t.startsWith("hi") ||
    t.startsWith("hey") ||
    t.includes("who are you") ||
    t.includes("what can you do") ||
    // Hindi
    t.includes("नमस्ते") ||
    t.includes("हेलो") ||
    t.includes("कौन हो") ||
    t.includes("kaise ho") ||
    t.includes("namaste") ||
    // Kannada
    t.includes("ನಮಸ್ಕಾರ") ||
    t.includes("ಹೇಗಿದ್ದೀರಾ") ||
    t.includes("ಯಾರು") ||
    t.includes("namaskara") ||
    // Tamil
    t.includes("வணக்கம்") ||
    // Telugu
    t.includes("నమస్కారం")
  ) {
    return {
      intent: "UNKNOWN_INTENT",
      confidence: 0.85,
      spokenResponse: RESPONSES.GREETING[langKey],
      requiresConfirmation: false,
      isMedicalQuery: false,
    };
  }

  // 8. Fallback / Unknown
  return {
    intent: "UNKNOWN_INTENT",
    confidence: 0.5,
    spokenResponse: RESPONSES.UNKNOWN[langKey],
    requiresConfirmation: false,
    isMedicalQuery: false,
  };
}

export interface LiveVoiceListenerCallbacks {
  onListeningStart?: () => void;
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: () => void;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}

export class MultilingualSpeechAdapter implements SpeechProviderAdapter {
  private activeRecognition: any = null;

  async transcribeTestAudio(
    testPhrase: string,
    language: VoiceLanguage = "en-IN"
  ): Promise<VoiceRecognitionResult> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      transcript: testPhrase,
      confidence: 0.96,
      detectedLanguage: language,
      durationMs: 1200,
    };
  }

  resolveIntent(
    transcript: string,
    language: VoiceLanguage = "en-IN"
  ): VoiceIntentResolution {
    return resolveVoiceIntent(transcript, language);
  }

  /**
   * Real speech synthesis using Web Speech API (window.speechSynthesis)
   * Matches system voice in Hindi, Kannada, Tamil, Telugu, or English.
   */
  async synthesizeSpeech(
    text: string,
    language: VoiceLanguage = "en-IN"
  ): Promise<{ synthesized: boolean; durationMs: number }> {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      return new Promise((resolve) => {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = language;
          utterance.rate = 0.95;
          utterance.pitch = 1.0;

          // Select matching voice for Indian languages
          const voices = window.speechSynthesis.getVoices();
          const langCode = language.split("-")[0];
          const matchedVoice =
            voices.find((v) => v.lang === language) ||
            voices.find((v) => v.lang.startsWith(langCode)) ||
            voices.find((v) => v.lang.includes("IN"));

          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }

          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve({ synthesized: true, durationMs: 1200 });
            }
          };

          utterance.onend = finish;
          utterance.onerror = finish;

          const estimatedDuration = Math.max(2200, text.length * 85);
          setTimeout(finish, estimatedDuration + 1000);

          window.speechSynthesis.speak(utterance);
        } catch {
          resolve({ synthesized: false, durationMs: 1000 });
        }
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      synthesized: true,
      durationMs: 1500,
    };
  }

  stopSpeaking(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  startLiveListening(
    language: VoiceLanguage = "en-IN",
    callbacks: LiveVoiceListenerCallbacks
  ): () => void {
    if (typeof window === "undefined") {
      callbacks.onError?.("Speech recognition not supported in this environment");
      return () => {};
    }

    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      callbacks.onError?.(
        "Web Speech API is not supported in this browser. Please use Chrome or Edge."
      );
      return () => {};
    }

    this.stopLiveListening();

    try {
      const recognition = new SpeechRec();
      this.activeRecognition = recognition;
      recognition.lang = language;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        callbacks.onListeningStart?.();
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        if (final) {
          callbacks.onFinalTranscript?.(final.trim());
        } else if (interim) {
          callbacks.onInterimTranscript?.(interim.trim());
        }
      };

      recognition.onerror = (event: any) => {
        let message = "Speech recognition error.";
        if (event.error === "not-allowed") {
          message = "Microphone access blocked. Please allow mic permissions in your browser.";
        } else if (event.error === "no-speech") {
          message = "No speech detected. Please try speaking again.";
        }
        callbacks.onError?.(message);
      };

      recognition.onend = () => {
        this.activeRecognition = null;
        callbacks.onEnd?.();
      };

      recognition.start();

      return () => {
        this.stopLiveListening();
      };
    } catch (err: any) {
      callbacks.onError?.(err?.message || "Could not start speech recognition");
      return () => {};
    }
  }

  stopLiveListening(): void {
    if (this.activeRecognition) {
      try {
        this.activeRecognition.abort();
      } catch {
        // ignore
      }
      this.activeRecognition = null;
    }
  }
}

export const speechAdapter = new MultilingualSpeechAdapter();
