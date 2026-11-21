/**
 * Deepgram (STT) + Cartesia (TTS) Voice Adapter for BLOOM MED
 * Features Voice Activity Detection (VAD) / Silence Auto-Stop
 * and ultra-low latency streaming for home healthcare.
 */

import {
  SpeechProviderAdapter,
  resolveVoiceIntent,
} from "./voice-adapter";
import {
  VoiceIntentResolution,
  VoiceLanguage,
  VoiceRecognitionResult,
} from "./voice-types";

const DEEPGRAM_API_KEY = process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY || "";

const CARTESIA_API_KEY = process.env.EXPO_PUBLIC_CARTESIA_API_KEY || "";

// Mapping VoiceLanguage to Deepgram ISO language codes
const DEEPGRAM_LANG_MAP: Record<VoiceLanguage, string> = {
  "en-IN": "en",
  "hi-IN": "hi",
  "kn-IN": "kn",
  "ta-IN": "ta",
  "te-IN": "te",
};

// Mapping VoiceLanguage to Cartesia ISO language codes
const CARTESIA_LANG_MAP: Record<VoiceLanguage, string> = {
  "en-IN": "en",
  "hi-IN": "hi",
  "kn-IN": "kn",
  "ta-IN": "ta",
  "te-IN": "te",
};

export interface DeepgramCaptureCallbacks {
  onSilenceAutoStop?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export class DeepgramCartesiaAdapter implements SpeechProviderAdapter {
  private activeAudio: HTMLAudioElement | null = null;
  private mediaRecorder: any = null;
  private recordedChunks: Blob[] = [];
  private audioCtx: any = null;
  private vadInterval: any = null;

  isConfigured(): boolean {
    return Boolean(DEEPGRAM_API_KEY && CARTESIA_API_KEY);
  }

  async transcribeTestAudio(
    testPhrase: string,
    language: VoiceLanguage = "en-IN"
  ): Promise<VoiceRecognitionResult> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      transcript: testPhrase,
      confidence: 0.98,
      detectedLanguage: language,
      durationMs: 800,
    };
  }

  resolveIntent(
    transcript: string,
    language: VoiceLanguage = "en-IN"
  ): VoiceIntentResolution {
    return resolveVoiceIntent(transcript, language);
  }

  /**
   * Transcribe recorded audio buffer using Deepgram Nova-3 API
   */
  async transcribeAudioBlob(
    audioBlob: Blob,
    language: VoiceLanguage = "en-IN"
  ): Promise<string> {
    if (!DEEPGRAM_API_KEY) {
      throw new Error("Deepgram API key is not configured.");
    }

    const langCode = DEEPGRAM_LANG_MAP[language] || "en";
    const endpoint = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=${langCode}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": audioBlob.type || "audio/webm",
      },
      body: audioBlob,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Deepgram STT failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    return transcript.trim();
  }

  /**
   * Synthesize natural speech using Cartesia Sonic (sub-90ms ultra-low latency TTS)
   */
  async synthesizeSpeech(
    text: string,
    language: VoiceLanguage = "en-IN"
  ): Promise<{ synthesized: boolean; durationMs: number }> {
    this.stopSpeaking();

    if (!CARTESIA_API_KEY || typeof window === "undefined") {
      return { synthesized: false, durationMs: 1000 };
    }

    try {
      const cartesiaLang = CARTESIA_LANG_MAP[language] || "en";
      const response = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "X-API-Key": CARTESIA_API_KEY,
          "Cartesia-Version": "2024-06-10",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "sonic-3.6",
          transcript: text,
          voice: {
            mode: "id",
            id: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4", // Skylar (approachable care persona)
          },
          output_format: {
            container: "mp3",
            sample_rate: 44100,
            encoding: "mp3",
          },
          language: cartesiaLang,
        }),
      });

      if (!response.ok) {
        throw new Error(`Cartesia TTS error (${response.status})`);
      }

      const audioBytes = await response.arrayBuffer();
      const blob = new Blob([audioBytes], { type: "audio/mp3" });
      const audioUrl = URL.createObjectURL(blob);

      return new Promise((resolve) => {
        const audio = new Audio(audioUrl);
        this.activeAudio = audio;

        let finished = false;
        const done = () => {
          if (!finished) {
            finished = true;
            URL.revokeObjectURL(audioUrl);
            this.activeAudio = null;
            resolve({ synthesized: true, durationMs: 1500 });
          }
        };

        audio.onended = done;
        audio.onerror = done;

        // Safety fallback timeout
        setTimeout(done, Math.max(3000, text.length * 90));

        audio.play().catch(() => {
          done();
        });
      });
    } catch {
      return { synthesized: false, durationMs: 1000 };
    }
  }

  /**
   * Stop any in-progress speech playback
   */
  stopSpeaking(): void {
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch {
        // ignore
      }
      this.activeAudio = null;
    }
  }

  /**
   * Start microphone capture with Voice Activity Detection (VAD)
   * Automatically stops 1.3 seconds after the user stops speaking!
   */
  async startMicrophoneCapture(callbacks?: DeepgramCaptureCallbacks): Promise<boolean> {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      this.cleanupVAD();
      this.recordedChunks = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      recorder.start(100);

      // Setup Web Audio API VAD (Silence Detector)
      try {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          this.audioCtx = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let silenceStart = 0;
          let speechDetected = false;
          const recordingStartTime = Date.now();

          this.vadInterval = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            callbacks?.onVolumeChange?.(avg);

            const VOICE_THRESHOLD = 14;
            if (avg > VOICE_THRESHOLD) {
              speechDetected = true;
              silenceStart = Date.now();
            } else if (speechDetected) {
              const silenceElapsed = Date.now() - silenceStart;
              // If user spoke and has now paused for 1.2 seconds -> auto-stop!
              if (silenceElapsed > 1200) {
                this.cleanupVAD();
                callbacks?.onSilenceAutoStop?.();
              }
            } else if (Date.now() - recordingStartTime > 8000) {
              // Safety timeout: 8s with no speech detected -> auto-stop
              this.cleanupVAD();
              callbacks?.onSilenceAutoStop?.();
            }
          }, 100);
        }
      } catch {
        // VAD optional; fallback to manual tap
      }

      return true;
    } catch {
      return false;
    }
  }

  private cleanupVAD(): void {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }
  }

  /**
   * Stop microphone capture and return audio blob
   */
  async stopMicrophoneCapture(): Promise<Blob | null> {
    this.cleanupVAD();

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        try {
          const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
          const blob = new Blob(this.recordedChunks, { type: mimeType });
          this.mediaRecorder.stream?.getTracks().forEach((track: any) => track.stop());
          this.mediaRecorder = null;
          this.recordedChunks = [];
          resolve(blob);
        } catch {
          resolve(null);
        }
      };

      try {
        if (this.mediaRecorder.state !== "inactive") {
          this.mediaRecorder.stop();
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  }
}

export const deepgramCartesiaAdapter = new DeepgramCartesiaAdapter();
