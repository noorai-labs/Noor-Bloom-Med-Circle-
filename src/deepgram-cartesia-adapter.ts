/**
 * Authenticated Deepgram (STT) + Cartesia (TTS) Client Adapter for BLOOM MED
 * - Keeps all speech provider API keys strictly on the backend (CWE-522 compliant)
 * - Uses short-lived tokens from POST /v1/voice/stt-token for live Deepgram WebSockets
 * - Proxies TTS audio synthesis through POST /v1/voice/tts
 * - Features generation-guarded cancellation, utterance buffering, and barge-in VAD
 */

import { SpeechProviderAdapter, resolveVoiceIntent } from "./voice-adapter";
import {
  VoiceIntentResolution,
  VoiceLanguage,
  VoiceRecognitionResult,
} from "./voice-types";

const DEEPGRAM_LANG_MAP: Record<VoiceLanguage, string> = {
  "en-IN": "en",
  "hi-IN": "hi",
  "kn-IN": "kn",
  "ta-IN": "ta",
  "te-IN": "te",
};

export interface VoiceBackendClient {
  status: () => Promise<{ sttAvailable: boolean; ttsAvailable: boolean }>;
  sttToken: () => Promise<{ accessToken: string; expiresIn: number }>;
  synthesizeTts: (
    transcript: string,
    language: VoiceLanguage,
    signal?: AbortSignal,
  ) => Promise<ArrayBuffer>;
}

export interface DeepgramStreamingCallbacks {
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (err: string) => void;
  onBargeIn?: () => void;
  onSpeechStarted?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export class DeepgramCartesiaAdapter implements SpeechProviderAdapter {
  private backendClient: VoiceBackendClient | null = null;
  private activeAudio: HTMLAudioElement | null = null;
  private activePlaybackTimeout: ReturnType<typeof setTimeout> | null = null;
  private activePlaybackCleanup: ((synthesized: boolean) => void) | null = null;
  private activeAbortController: AbortController | null = null;
  private speechGeneration = 0;

  private liveWs: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private vadInterval: ReturnType<typeof setInterval> | null = null;
  private activeStream: MediaStream | null = null;
  private liveSessionId = 0;
  private isSpeaking = false;

  setBackendClient(client?: VoiceBackendClient | null): void {
    this.backendClient = client ?? null;
  }

  isConfigured(): boolean {
    return Boolean(this.backendClient);
  }

  async checkAvailability(): Promise<{
    sttAvailable: boolean;
    ttsAvailable: boolean;
  }> {
    if (!this.backendClient) {
      return { sttAvailable: false, ttsAvailable: false };
    }
    try {
      return await this.backendClient.status();
    } catch {
      return { sttAvailable: false, ttsAvailable: false };
    }
  }

  async transcribeTestAudio(
    testPhrase: string,
    language: VoiceLanguage = "en-IN",
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
    language: VoiceLanguage = "en-IN",
  ): VoiceIntentResolution {
    return resolveVoiceIntent(transcript, language);
  }

  /**
   * Synthesize speech via authenticated backend proxy (/v1/voice/tts).
   * Supports cancellation before audio element creation via speechGeneration & AbortController.
   */
  async synthesizeSpeech(
    text: string,
    language: VoiceLanguage = "en-IN",
    onPlaybackStart?: () => void,
  ): Promise<{ synthesized: boolean; durationMs: number }> {
    this.stopSpeaking();

    if (!this.backendClient || typeof window === "undefined") {
      return { synthesized: false, durationMs: 0 };
    }

    const gen = ++this.speechGeneration;
    const controller = new AbortController();
    this.activeAbortController = controller;

    try {
      const audioBytes = await this.backendClient.synthesizeTts(
        text,
        language,
        controller.signal,
      );

      if (gen !== this.speechGeneration || controller.signal.aborted) {
        return { synthesized: false, durationMs: 0 };
      }

      const blob = new Blob([audioBytes], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(blob);

      return await new Promise((resolve) => {
        if (gen !== this.speechGeneration || controller.signal.aborted) {
          URL.revokeObjectURL(audioUrl);
          resolve({ synthesized: false, durationMs: 0 });
          return;
        }

        const audio = new Audio(audioUrl);
        this.activeAudio = audio;
        this.isSpeaking = true;

        let finished = false;
        let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

        const done = (synthesized: boolean) => {
          if (finished) return;
          finished = true;

          if (this.activePlaybackCleanup === done) {
            this.activePlaybackCleanup = null;
          }

          if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          if (this.activePlaybackTimeout === fallbackTimer) {
            this.activePlaybackTimeout = null;
          }
          if (this.activeAudio === audio) {
            this.isSpeaking = false;
            this.activeAudio = null;
          }

          URL.revokeObjectURL(audioUrl);
          resolve({
            synthesized,
            durationMs: synthesized ? 1500 : 0,
          });
        };

        this.activePlaybackCleanup = done;

        audio.onended = () => done(true);
        audio.onerror = () => done(false);

        const maxDuration = Math.max(5000, text.length * 140);
        fallbackTimer = setTimeout(() => done(true), maxDuration);
        this.activePlaybackTimeout = fallbackTimer;

        audio.play()
          .then(() => {
            if (gen === this.speechGeneration && !finished) {
              onPlaybackStart?.();
            }
          })
          .catch(() => done(false));
      });
    } catch {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
      return { synthesized: false, durationMs: 0 };
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  stopSpeaking(): void {
    this.speechGeneration++;
    this.isSpeaking = false;

    if (this.activePlaybackCleanup) {
      const cleanup = this.activePlaybackCleanup;
      this.activePlaybackCleanup = null;
      cleanup(false);
    }

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {
        // ignore
      }
      this.activeAbortController = null;
    }

    if (this.activePlaybackTimeout) {
      clearTimeout(this.activePlaybackTimeout);
      this.activePlaybackTimeout = null;
    }

    if (this.activeAudio) {
      const audio = this.activeAudio;
      this.activeAudio = null;
      try {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    }
  }

  /**
   * Starts a live Deepgram WebSocket session using a short-lived token minted by the backend.
   * Resolves true ONLY after microphone acquisition, WebSocket open, and MediaRecorder start succeed.
   */
  async startLiveWebSocketSession(
    language: VoiceLanguage = "en-IN",
    callbacks?: DeepgramStreamingCallbacks,
  ): Promise<boolean> {
    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      callbacks?.onError?.("Microphone streaming is not supported in this environment.");
      return false;
    }

    if (!this.backendClient) {
      callbacks?.onError?.(
        "Voice service requires cloud backend configuration. Switch to cloud mode and sign in to continue.",
      );
      return false;
    }

    this.stopLiveWebSocketSession();
    const sessionId = ++this.liveSessionId;

    let stream: MediaStream | null = null;
    let accessToken = "";

    try {
      // 1. Acquire short-lived Deepgram token and microphone permission BEFORE opening WebSocket
      // Uses allSettled to ensure that if token fetch fails, any resolved MediaStream is not orphaned.
      const [tokenOutcome, streamOutcome] = await Promise.allSettled([
        this.backendClient.sttToken(),
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }),
      ]);

      if (streamOutcome.status === "fulfilled") {
        stream = streamOutcome.value;
      }

      if (tokenOutcome.status === "rejected") {
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
        }
        throw tokenOutcome.reason;
      }

      if (streamOutcome.status === "rejected") {
        throw streamOutcome.reason;
      }

      accessToken = tokenOutcome.value.accessToken;

      // Cancel cleanly if modal closed or another session superseded while awaiting permissions/token
      if (sessionId !== this.liveSessionId) {
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
        }
        return false;
      }
    } catch (err: any) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      if (sessionId === this.liveSessionId) {
        const message =
          err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError"
            ? "Microphone access denied. Please allow mic permissions in your browser."
            : err?.message || "Could not access microphone or speech token.";
        callbacks?.onError?.(message);
      }
      return false;
    }

    if (!stream) {
      return false;
    }

    this.activeStream = stream;

    // 2. Setup Web Audio VAD analyzer for real-time volume visualization and sustained-speech barge-in
    try {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        const ctx = new AudioCtxClass();
        this.audioCtx = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let sustainedBargeInFrames = 0;

        this.vadInterval = setInterval(() => {
          if (sessionId !== this.liveSessionId) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          callbacks?.onVolumeChange?.(avg);

          // Require sustained clear user speech (> 26 energy for 3 consecutive 80ms frames = ~240ms)
          // to avoid brief ambient noise spikes or speaker bleed triggering self-interruption.
          if (this.isSpeaking) {
            if (avg > 26) {
              sustainedBargeInFrames++;
              if (sustainedBargeInFrames >= 3) {
                sustainedBargeInFrames = 0;
                this.stopSpeaking();
                callbacks?.onBargeIn?.();
              }
            } else {
              sustainedBargeInFrames = 0;
            }
          } else {
            sustainedBargeInFrames = 0;
          }
        }, 80);
      }
    } catch {
      // VAD visualization optional
    }

    // 3. Open WebSocket with short-lived token and register all handlers synchronously
    const langCode = DEEPGRAM_LANG_MAP[language] || "en";
    const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true&vad_events=true&endpointing=850&language=${langCode}`;

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      let utteranceBuffer = "";

      const settle = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };

      const failAndCleanup = (errorMessage?: string) => {
        utteranceBuffer = "";
        if (sessionId === this.liveSessionId) {
          this.stopLiveWebSocketSession(true);
          if (errorMessage) {
            callbacks?.onError?.(errorMessage);
          }
        }
        settle(false);
      };

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl, ["token", accessToken]);
        this.liveWs = ws;
      } catch (err: any) {
        failAndCleanup(err?.message || "Could not open speech streaming connection.");
        return;
      }

      ws.onopen = () => {
        if (sessionId !== this.liveSessionId) {
          try {
            ws.close();
          } catch {
            // ignore
          }
          settle(false);
          return;
        }

        try {
          let mimeType = "audio/webm";
          if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            mimeType = "audio/webm;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          }

          const recorder = new MediaRecorder(stream!, { mimeType });
          this.mediaRecorder = recorder;

          recorder.ondataavailable = (event) => {
            if (
              sessionId === this.liveSessionId &&
              event.data &&
              event.data.size > 0 &&
              ws.readyState === WebSocket.OPEN
            ) {
              ws.send(event.data);
            }
          };

          recorder.onerror = () => {
            failAndCleanup("Microphone recording failed.");
          };

          recorder.start(100);
          settle(true);
        } catch (err: any) {
          failAndCleanup(err?.message || "Failed to start audio recorder.");
        }
      };

      ws.onmessage = (msg) => {
        if (sessionId !== this.liveSessionId) return;
        try {
          const data = JSON.parse(msg.data as string);

          // Ignore Deepgram speech events/transcripts caused by Bloom's own playback
          if (this.isSpeaking) {
            return;
          }

          if (data.type === "SpeechStarted") {
            callbacks?.onSpeechStarted?.();
            return;
          }

          if (data.type === "UtteranceEnd" && utteranceBuffer.trim()) {
            const combined = utteranceBuffer.trim();
            utteranceBuffer = "";
            callbacks?.onFinalTranscript?.(combined);
            return;
          }

          const transcript = data?.channel?.alternatives?.[0]?.transcript || "";
          if (transcript.trim()) {
            if (data.is_final) {
              utteranceBuffer = utteranceBuffer
                ? `${utteranceBuffer} ${transcript.trim()}`
                : transcript.trim();

              if (data.speech_final || data.from_finalize) {
                const combined = utteranceBuffer.trim();
                utteranceBuffer = "";
                callbacks?.onFinalTranscript?.(combined);
              } else {
                callbacks?.onInterimTranscript?.(utteranceBuffer);
              }
            } else {
              const preview = utteranceBuffer
                ? `${utteranceBuffer} ${transcript}`
                : transcript;
              callbacks?.onInterimTranscript?.(preview);
            }
          } else if (data.speech_final && utteranceBuffer.trim()) {
            const combined = utteranceBuffer.trim();
            utteranceBuffer = "";
            callbacks?.onFinalTranscript?.(combined);
          }
        } catch {
          // ignore malformed keepalive messages
        }
      };

      ws.onerror = () => {
        failAndCleanup("Deepgram live streaming connection error.");
      };

      ws.onclose = () => {
        if (sessionId === this.liveSessionId && !settled) {
          failAndCleanup("Speech connection closed before recording started.");
        } else if (sessionId === this.liveSessionId) {
          // Unexpected drop mid-session: release mic and VAD resources cleanly and alert UI
          this.stopLiveWebSocketSession(true);
          callbacks?.onError?.("Speech connection was lost. Please tap to reconnect.");
        }
      };
    });
  }

  /**
   * Stop live WebSocket streaming and release all microphone hardware.
   * @param keepSpeaking If true, ongoing TTS audio continues playing across navigation.
   */
  stopLiveWebSocketSession(keepSpeaking = false): void {
    this.liveSessionId++;

    if (!keepSpeaking) {
      this.stopSpeaking();
    }

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

    if (this.mediaRecorder) {
      const rec = this.mediaRecorder;
      this.mediaRecorder = null;
      if (rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
    }

    if (this.liveWs) {
      const ws = this.liveWs;
      this.liveWs = null;
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      } catch {
        // ignore
      }
    }

    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => track.stop());
      this.activeStream = null;
    }
  }
}

export const deepgramCartesiaAdapter = new DeepgramCartesiaAdapter();
