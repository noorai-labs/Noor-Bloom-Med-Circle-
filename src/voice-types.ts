/**
 * Voice Pipeline Type Definitions for BLOOM MED
 * Part of Week 1 deliverable: feature/roshan/voice-pipeline-design
 */

export type VoiceConsentStatus = "prompt" | "granted" | "denied" | "revoked";

export interface VoiceConsentRecord {
  status: VoiceConsentStatus;
  timestamp: string;
  policyVersion: string;
  language: VoiceLanguage;
}

export type VoiceLanguage = "en-IN" | "hi-IN" | "kn-IN" | "ta-IN" | "te-IN";

export interface VoiceLanguageOption {
  code: VoiceLanguage;
  label: string;
  nativeLabel: string;
}

export type VoiceIntentType =
  | "NAVIGATE_MEDICINES"
  | "NAVIGATE_RECORDS"
  | "NAVIGATE_APPOINTMENTS"
  | "NAVIGATE_BOOKING"
  | "NAVIGATE_DISCOVER"
  | "QUERY_NEXT_APPOINTMENT"
  | "QUERY_MEDICINES_TODAY"
  | "QUERY_RECORDS_COUNT"
  | "EMERGENCY_SOS"
  | "MEDICAL_QUERY_REFUSAL"
  | "UNKNOWN_INTENT";

export type AudioUploadFormat = "audio/wav" | "audio/webm";

export interface VoiceCaptureConfig {
  sampleRate: number;
  channels: number;
  captureEncoding: "pcm_16bit" | "aac" | "webm";
  uploadFormat: AudioUploadFormat;
  maxDurationSeconds: number;
}

export interface VoiceRecognitionResult {
  transcript: string;
  confidence: number;
  detectedLanguage: VoiceLanguage;
  durationMs: number;
}

export interface VoiceIntentResolution {
  intent: VoiceIntentType;
  confidence: number;
  targetRoute?: string;
  spokenResponse: string;
  requiresConfirmation: boolean;
  isMedicalQuery: boolean;
}

export type VoicePipelineStatus =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface VoicePipelineError {
  code:
    | "PERMISSION_DENIED"
    | "NETWORK_TIMEOUT"
    | "AUDIO_EMPTY"
    | "STT_FAILED"
    | "UNRECOGNIZED_INTENT";
  message: string;
  retryable: boolean;
}