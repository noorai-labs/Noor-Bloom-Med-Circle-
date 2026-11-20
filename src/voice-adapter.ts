/**
 * Voice Pipeline Adapter & Intent Resolver for BLOOM MED
 * Part of Week 2 deliverable: feature/roshan/voice-help-prototype
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

export const MOCK_TEST_PHRASES = [
  "When is my next appointment?",
  "Show my medicines",
  "Show my reports",
  "Book a nurse for home visit",
  "What medicine should I take for headache?",
  "Emergency help",
];

export function resolveVoiceIntent(
  rawTranscript: string,
  _language: VoiceLanguage = "en-IN"
): VoiceIntentResolution {
  const t = rawTranscript.toLowerCase().trim();

  // 1. Clinical Safety Guardrail (Highest Priority)
  if (
    t.includes("headache") ||
    t.includes("fever") ||
    t.includes("diagnose") ||
    t.includes("dose") ||
    t.includes("what medicine should i take") ||
    t.includes("cure")
  ) {
    return {
      intent: "MEDICAL_QUERY_REFUSAL",
      confidence: 0.98,
      spokenResponse:
        "I cannot recommend treatments or diagnose symptoms. Please consult a registered doctor or book a home visit.",
      requiresConfirmation: false,
      isMedicalQuery: true,
    };
  }

  // 2. Emergency SOS
  if (
    t.includes("emergency") ||
    t.includes("sos") ||
    t.includes("ambulance") ||
    t.includes("urgent help")
  ) {
    return {
      intent: "EMERGENCY_SOS",
      confidence: 0.99,
      targetRoute: "/sos",
      spokenResponse: "Opening emergency support. Stay calm, help is ready.",
      requiresConfirmation: true,
      isMedicalQuery: false,
    };
  }

  // 3. Navigation: Medicines
  if (
    t.includes("medicine") ||
    t.includes("pill") ||
    t.includes("prescription") ||
    t.includes("remind")
  ) {
    return {
      intent: "NAVIGATE_MEDICINES",
      confidence: 0.95,
      targetRoute: "/medicines",
      spokenResponse:
        "Opening your medicines routine. You can track your daily doses and reminders here.",
      requiresConfirmation: false,
      isMedicalQuery: false,
    };
  }

  // 4. Navigation: Appointments / Visits
  if (
    t.includes("appointment") ||
    t.includes("visit") ||
    t.includes("doctor appointment") ||
    t.includes("when is my next")
  ) {
    return {
      intent: "QUERY_NEXT_APPOINTMENT",
      confidence: 0.96,
      targetRoute: "/(tabs)/appointments",
      spokenResponse:
        "Opening your care calendar to review your scheduled home visits.",
      requiresConfirmation: false,
      isMedicalQuery: false,
    };
  }

  // 5. Navigation: Records & Reports
  if (
    t.includes("report") ||
    t.includes("record") ||
    t.includes("lab") ||
    t.includes("documents")
  ) {
    return {
      intent: "NAVIGATE_RECORDS",
      confidence: 0.94,
      targetRoute: "/(tabs)/records",
      spokenResponse:
        "Opening your health records folder. Your uploaded documents and care plans are here.",
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
    t.includes("find care")
  ) {
    return {
      intent: "NAVIGATE_BOOKING",
      confidence: 0.92,
      targetRoute: "/discover",
      spokenResponse:
        "Opening care discovery. You can browse verified doctors and nurses for home care.",
      requiresConfirmation: false,
      isMedicalQuery: false,
    };
  }

  // 7. Fallback / Unknown
  return {
    intent: "UNKNOWN_INTENT",
    confidence: 0.5,
    spokenResponse:
      "I can help you navigate appointments, medicines, reports, and booking. What would you like to open?",
    requiresConfirmation: false,
    isMedicalQuery: false,
  };
}

export class MockSpeechAdapter implements SpeechProviderAdapter {
  async transcribeTestAudio(
    testPhrase: string,
    language: VoiceLanguage = "en-IN"
  ): Promise<VoiceRecognitionResult> {
    await new Promise((resolve) => setTimeout(resolve, 400));
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

  async synthesizeSpeech(
    _text: string,
    _language: VoiceLanguage = "en-IN"
  ): Promise<{ synthesized: boolean; durationMs: number }> {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      synthesized: true,
      durationMs: 1800,
    };
  }
}

export const speechAdapter = new MockSpeechAdapter();