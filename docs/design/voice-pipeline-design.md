# BLOOM MED — Voice Pipeline Design Specification

**Feature:** Initial Voice Pipeline Design & Architecture  
**Owner:** Roshan Shariff  
**Target Branch:** `feature/roshan/voice-pipeline-design`  
**Status:** In Review (Week 1 Deliverable)  
**Date:** 16 November 2026  

---

## 1. Executive Summary & Objective

In home-healthcare delivery across India, elderly patients, post-operative individuals, and users with limited literacy or motor impairments face high friction when interacting with text-heavy mobile interfaces.

Currently, the BLOOM MED assistant (`src/screens/assistant.tsx`) features a simulated placeholder mic icon with static mock responses. This specification details the end-to-end architecture to replace the mock with an accessible, multilingual, privacy-preserving **Voice Navigation & Query Pipeline**.

### Key Goals
1. **Consent-First Audio Capture:** Enforce explicit, revocable patient consent before opening device audio channels.
2. **Multilingual India Support:** Target Indian English (`en-IN`), Hindi (`hi-IN`), Kannada (`kn-IN`), Tamil (`ta-IN`), and Telugu (`te-IN`).
3. **Pluggable Speech Adapters:** Abstract Speech-to-Text (STT) and Text-to-Speech (TTS) behind standardized backend interfaces.
4. **Clinical Guardrails:** Strictly enforce healthcare safety rules: the voice assistant helps patients **navigate** appointments, view records, and log medicines; it **never** provides clinical diagnoses, prescribing recommendations, or dosage modifications.
5. **Accessibility & Graceful Degradation:** Provide immediate visual transcription, audible response, and instant fallback to text/tap controls.

---

## 2. Privacy, Consent & Language Selection

### 2.1 Consent Architecture
Voice data in healthcare is biometric and sensitive. Audio capture must adhere to strict zero-surveillance principles:
* **Push-to-Talk Only:** The app will never listen passively in the background. Audio recording initiates only on an active user tap and terminates automatically after speech ends (or at a 12-second cutoff).
* **Explicit In-App Consent:** On first activation of the microphone, the user is presented with a dedicated modal:
  * *"BLOOM MED uses your microphone only while you hold or tap Speak. Spoken audio is used to navigate your care space and is not saved for marketing."*
* **Revocable Settings:** Users can revoke voice permissions anytime under `(tabs)/profile > Settings > Voice & Audio`.
* **Data Minimization:** Raw audio recordings are ephemeral and discarded immediately after transcription. No audio binaries are permanently stored in database tables.

### 2.2 Language Selection
India's multilingual context requires explicit language declaration and automatic fallback:
* **Selection UI:** A language picker pill strip displayed directly on the voice interface.
* **Supported Locales (Phased):**
  * **Phase 1 (Prototype):** English (`en-IN`), Hindi (`hi-IN`).
  * **Phase 2 (Rollout):** Kannada (`kn-IN`), Tamil (`ta-IN`), Telugu (`te-IN`).
* **Persistence:** The selected language defaults to the patient profile language (`state.profile.language`) and can be overridden in the voice modal.

---

## 3. End-to-End Pipeline Architecture

```
[ Patient Speaks ]
        │
        ▼
[ Client Audio Capture ] ── (16kHz PCM / WAV, max 12s)
        │
        ▼ (Authenticated Request via Clerk Token)
[ Backend Speech Adapter (/v1/voice/transcribe) ]
        │
   ┌────┴──────────────────────────┐
   ▼                               ▼
[ Speech-to-Text Engine ]    [ Intent Classifier ]
(Google Speech / Gemini)     (Structured Rule + LLM Router)
   │                               │
   └───────────────┬───────────────┘
                   ▼
         [ Intent Resolution ]
    - Route Destination (e.g. /medicines)
    - Contextual Summary (e.g. Next visit info)
    - Medical Safety Guardrail Check
                   │
                   ▼
[ Backend TTS / Synthesis Adapter (/v1/voice/synthesize) ]
                   │
                   ▼
[ Client UI Feedback & Playback ]
    - Visible On-Screen Transcript
    - Audible TTS Response
    - Action Confirmation Button ("Open Medicines")
```

---

## 4. Audio Capture Contract

### 4.1 Client Specifications
* **Module:** Built using cross-platform audio capture abstractions compatible with Expo CNG (Continuous Native Generation).
* **Sample Rate:** `16,000 Hz` (optimal balance between STT accuracy and low network payload).
* **Bit Depth:** 16-bit Mono PCM or compressed AAC.
* **Duration Limiter:** Maximum `12 seconds` with automatic Silence Detection (Voice Activity Detection - VAD) to cut off when the patient finishes speaking.
* **State Management:**
  * `idle` $\rightarrow$ `listening` (pulsing emerald visualizer) $\rightarrow$ `processing` (subtle spinner) $\rightarrow$ `speaking` $\rightarrow$ `idle`.

---

## 5. Speech-to-Text & Intent Routing

### 5.1 Intent Mapping Matrix

| Spoken Phrase (Example) | Detected Intent | Target Action / Route | Response / Disclaimer |
|---|---|---|---|
| *"When is my next doctor visit?"* | `QUERY_NEXT_APPOINTMENT` | Opens `/(tabs)/appointments` | *"Your next visit is with Dr. Aisha Khan on Thursday at 10:30 AM."* |
| *"Show me my medicine schedule"* | `NAVIGATE_MEDICINES` | Redirects to `/medicines` | *"Opening your medicines list. You have 2 doses scheduled today."* |
| *"I want to see my blood test report"* | `NAVIGATE_RECORDS` | Redirects to `/(tabs)/records` | *"Opening your health records folder."* |
| *"Book a nurse for home visit"* | `NAVIGATE_BOOKING` | Redirects to `/discover` | *"Opening care booking to choose an available home nurse."* |
| *"What medicine should I take for headache?"* | `MEDICAL_QUERY_REFUSAL` | None (Stays on screen) | *"I cannot recommend treatments or diagnose symptoms. Please contact your doctor or book a consultation."* |
| *"Emergency / I need help right now"* | `EMERGENCY_SOS` | Triggers `/sos` modal | *"Opening Emergency Support. Tap to confirm emergency contacts."* |

### 5.2 Strict Medical Guardrail Policy
If an intent is classified as asking for medical advice, prescription changes, or diagnosis:
1. The pipeline **must not** synthesize medical advice.
2. It returns a standardized disclaimer:
   > *"BLOOM MED Voice Assistant is a navigation and care-coordination tool, not a doctor. We cannot recommend medications, alter dosages, or evaluate symptoms."*
3. Offers a single tap button to book a consultation with a registered healthcare professional.

---

## 6. Confirmation, Visual Transcript & Audio Playback

### 6.1 Confirmation & Transcript
* **Simultaneous Display:** As soon as STT finishes, the transcript displays as a prominent text bubble before executing navigation.
* **Confirmation Step:** For destructive or major actions (e.g., booking a new slot or cancelling), an explicit tap confirmation is required.
* **Text Fallback:** If background noise prevents transcription, an error card appears with one-tap suggestions and a field to type manually.

### 6.2 Text-to-Speech (TTS) Playback
* Generates clear, compassionate, and naturally paced audio responses in the user's selected language.
* Audio includes an instant **Pause / Stop** button so users can silence playback anytime.
* Volume respects system media volume and does not route to the ear speaker.

---

## 7. Week 2 Prototype Deliverables

Following this design specification, Week 2 implementation will deliver:
1. **Voice Component (`src/components/voice-modal.tsx`):** A clean sheet containing:
   * Language selector.
   * Visual pulsing microphone button.
   * Stop / Cancel / Retry actions.
   * Live transcript card.
2. **Navigation Hook (`src/hooks/use-voice-navigation.ts`):** Client-side hook resolving spoken transcripts to router pushes.
3. **Mock Speech Adapter (`src/adapters/speech-mock.ts`):** Deterministic test audio and phrase mapping for automated CI verification.
4. **Demo Flow:** An interactive demonstration showing capture $\rightarrow$ transcription $\rightarrow$ visual confirmation $\rightarrow$ voice reply $\rightarrow$ target route execution.

---

*Authored by Roshan Shariff for Noor AI Labs / BLOOM MED intern delivery.*