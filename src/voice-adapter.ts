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
    t.includes("cure") ||
    t.includes("symptom") ||
    t.includes("pain")
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
    t.includes("remind") ||
    t.includes("dose") ||
    t.includes("tablets")
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
    t.includes("when is my next") ||
    t.includes("schedule") ||
    t.includes("booking status")
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
    t.includes("blood test") ||
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
    t.includes("find care") ||
    t.includes("specialist")
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

  // 7. Conversational greetings
  if (
    t.startsWith("hello") ||
    t.startsWith("hi") ||
    t.startsWith("hey") ||
    t.includes("who are you") ||
    t.includes("what can you do")
  ) {
    return {
      intent: "UNKNOWN_INTENT",
      confidence: 0.85,
      spokenResponse:
        "Hello! I am Bloom, your healthcare assistant. You can speak to me to check appointments, medicines, or health records.",
      requiresConfirmation: false,
      isMedicalQuery: false,
    };
  }

  // 8. Fallback / Unknown
  return {
    intent: "UNKNOWN_INTENT",
    confidence: 0.5,
    spokenResponse:
      "I can help you navigate appointments, medicines, reports, and booking. What would you like to open?",
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

export class WebVoiceSpeechAdapter implements SpeechProviderAdapter {
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
   * Plays audible sound through computer speakers in browser environments.
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
          utterance.rate = 1.0;
          utterance.pitch = 1.0;

          // Attempt to match an installed voice for the chosen language
          const voices = window.speechSynthesis.getVoices();
          const langCode = language.split("-")[0];
          const matchedVoice = voices.find(
            (v) => v.lang === language || v.lang.startsWith(langCode)
          );
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

          // Safety timeout so UI doesn't hang if browser fails to trigger onend
          const estimatedDuration = Math.max(2000, text.length * 80);
          setTimeout(finish, estimatedDuration + 1000);

          window.speechSynthesis.speak(utterance);
        } catch {
          resolve({ synthesized: false, durationMs: 1000 });
        }
      });
    }

    // Fallback for non-browser/test environments
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      synthesized: true,
      durationMs: 1500,
    };
  }

  /**
   * Stop any in-progress speech playback
   */
  stopSpeaking(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Real microphone speech recognition using Web Speech API
   */
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

  /**
   * Stop any active microphone listening session
   */
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

export const speechAdapter = new WebVoiceSpeechAdapter();
