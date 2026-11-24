/**
 * Multilingual Voice Assistant Modal for BLOOM MED
 * Next-Gen Gemini Live & ChatGPT Advanced Voice Style
 * - Deepgram Nova-3 Real-Time WebSocket Streaming with Interim Words
 * - Cartesia Sonic Ultra-Low Latency Speech Synthesis
 * - Unified Patient Knowledge Engine (Records, Consultations, Medicines, Vitals, Allergies)
 * - Multi-Turn Conversational Context & Memory Persistence
 * - Real-Time Audio-Reactive Glowing Visualizer Orb
 * - Real-Time Barge-In Interruption
 * - Hands-Free Continuous Multi-Turn Loop
 * - 60-Second Inactivity Hardware Auto-Release
 */

import React, { useContext, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Button,
  Icon,
  Touch,
} from "./components";
import {
  deepgramCartesiaAdapter,
} from "./deepgram-cartesia-adapter";
import { ClinicContext } from "./store";
import {
  SUPPORTED_VOICE_LANGUAGES,
} from "./voice-adapter";
import {
  VoiceLanguage,
  VoicePipelineStatus,
} from "./voice-types";
import {
  AdvancedVoiceResponse,
  ConversationTurn,
  evaluatePatientKnowledge,
} from "./voice-context-engine";

interface VoiceModalProps {
  visible: boolean;
  onClose: () => void;
  defaultLanguage?: VoiceLanguage;
}

export function VoiceModal({
  visible,
  onClose,
  defaultLanguage = "en-IN",
}: VoiceModalProps) {
  const clinicStore = useContext(ClinicContext);

  const [status, setStatus] = useState<VoicePipelineStatus>("idle");
  const [selectedLanguage, setSelectedLanguage] =
    useState<VoiceLanguage>(defaultLanguage);
  const [transcript, setTranscript] = useState<string>("");
  const [resolution, setResolution] = useState<AdvancedVoiceResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [micVolume, setMicVolume] = useState<number>(0);
  const [history, setHistory] = useState<ConversationTurn[]>([]);

  // Animation values for the Gemini Live glowing visualizer orb
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(1)).current;
  const waveAnim2 = useRef(new Animated.Value(1)).current;
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 60-Second Inactivity Timer (releases mic & closes session on silence)
  function resetInactivityTimer() {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      // 60 seconds of silence -> close session & release microphone hardware completely
      stopAll();
      onClose();
    }, 60000);
  }

  function stopAll() {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    deepgramCartesiaAdapter.stopSpeaking();
    deepgramCartesiaAdapter.stopLiveWebSocketSession();
    setStatus("idle");
    setMicVolume(0);
  }

  // Visualizer Orb Animations
  useEffect(() => {
    if (status === "listening" || status === "speaking" || status === "processing") {
      // Outer ripple wave 1
      const wave1Loop = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim1, {
            toValue: 1.35,
            duration: 1100,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(waveAnim1, {
            toValue: 1.0,
            duration: 1100,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );

      // Mid shimmer wave 2
      const wave2Loop = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim2, {
            toValue: 1.2,
            duration: 850,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(waveAnim2, {
            toValue: 1.0,
            duration: 850,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );

      // Core pulse
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 650,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 650,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );

      wave1Loop.start();
      wave2Loop.start();
      pulseLoop.start();

      return () => {
        wave1Loop.stop();
        wave2Loop.stop();
        pulseLoop.stop();
      };
    } else {
      pulseAnim.setValue(1);
      waveAnim1.setValue(1);
      waveAnim2.setValue(1);
    }
  }, [status, pulseAnim, waveAnim1, waveAnim2]);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []);

  function handleNavigate(route: string) {
    stopAll();
    onClose();
    router.push(route as any);
  }

  /**
   * Process final spoken transcript using the Unified Patient Knowledge Engine
   * and conversational history
   */
  async function handleSpokenTranscript(finalText: string) {
    if (!finalText.trim()) return;

    resetInactivityTimer();
    setTranscript(finalText);
    setStatus("processing");

    try {
      // Evaluate against full patient universe (records, consultations, medicines, vitals, allergies)
      const res = evaluatePatientKnowledge(
        finalText,
        selectedLanguage,
        clinicStore?.state,
        history
      );

      setResolution(res);

      // Save turn into conversational memory for multi-turn follow-ups
      setHistory((prev) => [
        ...prev,
        {
          user: finalText,
          bloom: res.spokenResponse,
          topic: res.category as any,
          entityName: res.highlightData,
        },
      ]);

      setStatus("speaking");

      // Check if this intent triggers auto-navigation to a specific page
      if (res.targetRoute) {
        // 1. Start speaking the on-screen readout via Cartesia Sonic
        const speechPromise = deepgramCartesiaAdapter.synthesizeSpeech(
          res.spokenResponse,
          selectedLanguage
        );

        // 2. Automatically navigate to the destination page after a smooth delay (300ms)
        // so the patient sees the screen appear while Bloom reads out its contents!
        setTimeout(() => {
          deepgramCartesiaAdapter.stopLiveWebSocketSession(true);
          if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
          }
          setStatus("idle");
          onClose();
          router.push(res.targetRoute as any);
        }, 300);

        await speechPromise;
        return;
      }

      // Conversational queries (no target route) stay in the modal:
      await deepgramCartesiaAdapter.synthesizeSpeech(
        res.spokenResponse,
        selectedLanguage
      );

      // Hands-Free Continuous Loop:
      // When Bloom finishes speaking inside the modal, seamlessly resume listening for next user turn!
      setStatus("listening");
      resetInactivityTimer();
    } catch {
      setStatus("error");
      setErrorMsg("Error generating voice response.");
    }
  }

  async function startLiveSession() {
    stopAll();
    setTranscript("");
    setResolution(null);
    setErrorMsg("");
    setStatus("listening");

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    // Unlock browser audio context on user gesture
    if (typeof window !== "undefined") {
      try {
        const AudioCtxClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          const testCtx = new AudioCtxClass();
          if (testCtx.state === "suspended") {
            await testCtx.resume();
          }
        }
      } catch {
        // ignore
      }
    }

    resetInactivityTimer();

    const started = await deepgramCartesiaAdapter.startLiveWebSocketSession(
      selectedLanguage,
      {
        onSpeechStarted: () => {
          resetInactivityTimer();
        },
        onInterimTranscript: (interim) => {
          // Kinetic streaming: words flow live onto the screen as user speaks!
          setTranscript(interim);
        },
        onFinalTranscript: (finalText) => {
          handleSpokenTranscript(finalText);
        },
        onVolumeChange: (vol) => {
          setMicVolume(vol);
        },
        onBargeIn: () => {
          // Real-time interruption: user spoke over Bloom -> instantly cut off audio and listen!
          setStatus("listening");
          setTranscript("");
          resetInactivityTimer();
        },
        onError: (err) => {
          setStatus("error");
          setErrorMsg(err);
        },
      }
    );

    if (!started) {
      setStatus("error");
      setErrorMsg("Could not connect to live voice session.");
    }
  }

  function handleMicPress() {
    if (status === "speaking") {
      // User tapped while Bloom was speaking -> interrupt audio immediately
      deepgramCartesiaAdapter.stopSpeaking();
      setStatus("listening");
      return;
    }

    if (status === "listening" || status === "processing") {
      stopAll();
      return;
    }

    startLiveSession();
  }

  // Audio-reactive scale factor based on microphone volume (clamped between 1.0 and 1.25)
  const volumeScale = Math.min(1.25, 1.0 + (micVolume / 100) * 0.4);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={() => {
        stopAll();
        onClose();
      }}
    >
      <View style={localStyles.overlay}>
        <View style={localStyles.container}>
          {/* Top Bar: Minimal Gemini-Style Header */}
          <View style={localStyles.header}>
            <View style={localStyles.brandRow}>
              <View
                style={[
                  localStyles.statusDot,
                  status === "listening" && { backgroundColor: "#10B981" },
                  status === "processing" && { backgroundColor: "#818CF8" },
                  status === "speaking" && { backgroundColor: "#06B6D4" },
                ]}
              />
              <Text style={localStyles.brandTitle}>Bloom AI</Text>

              {/* Status Pill */}
              <View style={localStyles.statusPill}>
                <Text style={localStyles.statusPillText}>
                  {status === "idle" && "Ready"}
                  {status === "listening" && "Listening..."}
                  {status === "processing" && "Thinking..."}
                  {status === "speaking" && "Speaking..."}
                  {status === "error" && "Notice"}
                </Text>
              </View>
            </View>

            <Touch
              onPress={() => {
                stopAll();
                onClose();
              }}
              label="Close"
            >
              <View style={localStyles.closeCircle}>
                <Icon name="close" color="#94A3B8" size={20} />
              </View>
            </Touch>
          </View>

          {/* Minimal Language Pill Selector */}
          <View style={localStyles.langStrip}>
            {SUPPORTED_VOICE_LANGUAGES.map((lang) => {
              const active = selectedLanguage === lang.code;
              return (
                <Touch
                  key={lang.code}
                  onPress={() => {
                    stopAll();
                    setSelectedLanguage(lang.code);
                  }}
                  style={
                    active
                      ? [localStyles.langChip, localStyles.langChipActive]
                      : localStyles.langChip
                  }
                >
                  <Text
                    style={[
                      localStyles.langChipText,
                      active && localStyles.langChipTextActive,
                    ]}
                  >
                    {lang.nativeLabel}
                  </Text>
                </Touch>
              );
            })}
          </View>

          {/* Center Visualizer: Gemini Live Glowing Reactive Orb */}
          <View style={localStyles.visualizerBox}>
            {/* Outer soundwave aura ring */}
            <Animated.View
              style={[
                localStyles.waveRingOuter,
                {
                  transform: [
                    { scale: waveAnim1 },
                    { scale: volumeScale },
                  ],
                  opacity: status === "listening" ? 0.35 : 0.15,
                  borderColor:
                    status === "speaking"
                      ? "#06B6D4"
                      : status === "processing"
                      ? "#818CF8"
                      : "#10B981",
                },
              ]}
            />

            {/* Mid shimmer ring */}
            <Animated.View
              style={[
                localStyles.waveRingMid,
                {
                  transform: [{ scale: waveAnim2 }],
                  opacity: status === "listening" ? 0.45 : 0.2,
                  borderColor:
                    status === "speaking"
                      ? "#38BDF8"
                      : status === "processing"
                      ? "#A78BFA"
                      : "#34D399",
                },
              ]}
            />

            {/* Core Neural Interactive Mic Orb */}
            <Animated.View
              style={[
                localStyles.coreOrb,
                {
                  transform: [{ scale: pulseAnim }],
                  backgroundColor:
                    status === "speaking"
                      ? "#0891B2"
                      : status === "processing"
                      ? "#6366F1"
                      : "#059669",
                  shadowColor:
                    status === "speaking"
                      ? "#06B6D4"
                      : status === "processing"
                      ? "#818CF8"
                      : "#10B981",
                },
              ]}
            >
              <Touch
                onPress={handleMicPress}
                style={localStyles.micTouch}
                label="Microphone"
              >
                <Icon
                  name={status === "speaking" ? "volume-high" : "mic"}
                  color="#FFFFFF"
                  size={36}
                />
              </Touch>
            </Animated.View>

            <Text style={localStyles.promptText}>
              {status === "idle" && "Tap to start conversation"}
              {status === "listening" && "Listening to you..."}
              {status === "processing" && "Processing with Bloom..."}
              {status === "speaking" && "Bloom is replying..."}
              {status === "error" && errorMsg}
            </Text>
          </View>

          {/* Kinetic Live Streaming Transcript Bubble */}
          {transcript !== "" && (
            <View style={localStyles.transcriptBubble}>
              <Text style={localStyles.transcriptLabel}>You</Text>
              <Text style={localStyles.transcriptText}>
                &ldquo;{transcript}&rdquo;
              </Text>
            </View>
          )}

          {/* Spoken Response & Unified Patient Knowledge Card */}
          {resolution && (
            <View
              style={[
                localStyles.responseCard,
                resolution.isEmergencyAlert && localStyles.emergencyCard,
              ]}
            >
              <View style={localStyles.responseHeaderRow}>
                <Text
                  style={[
                    localStyles.responseLabel,
                    resolution.isEmergencyAlert && { color: "#FCA5A5" },
                  ]}
                >
                  Bloom AI
                </Text>
                {resolution.highlightData && (
                  <View
                    style={[
                      localStyles.badgePill,
                      resolution.isEmergencyAlert && {
                        backgroundColor: "#7F1D1D",
                      },
                    ]}
                  >
                    <Text style={localStyles.badgePillText}>
                      {resolution.highlightData}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={localStyles.responseText}>
                {resolution.spokenResponse}
              </Text>

              {resolution.targetRoute && (
                <View style={{ marginTop: 14 }}>
                  <Button
                    title={
                      resolution.isEmergencyAlert
                        ? "Open Emergency SOS Support →"
                        : `Open ${resolution.targetRoute.replace(/[\/()]/g, "")} →`
                    }
                    danger={resolution.isEmergencyAlert}
                    onPress={() => handleNavigate(resolution.targetRoute!)}
                  />
                </View>
              )}
            </View>
          )}

          {/* Subtle Hands-Free Session Footer */}
          {status === "listening" && (
            <Text style={localStyles.handsFreeFooter}>
              Continuous hands-free conversation · Say &ldquo;Stop&rdquo; or pause to exit
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.72)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#080D1A",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 36,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#94A3B8",
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F8FAFC",
    letterSpacing: -0.3,
  },
  statusPill: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#CBD5E1",
  },
  closeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  langStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  langChipActive: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderColor: "#10B981",
  },
  langChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94A3B8",
  },
  langChipTextActive: {
    color: "#34D399",
    fontWeight: "700",
  },
  visualizerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 22,
    position: "relative",
  },
  waveRingOuter: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
  },
  waveRingMid: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
  },
  coreOrb: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
    elevation: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  micTouch: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: "center",
    justifyContent: "center",
  },
  promptText: {
    marginTop: 18,
    fontSize: 14,
    fontWeight: "500",
    color: "#94A3B8",
    textAlign: "center",
  },
  transcriptBubble: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    marginVertical: 8,
    alignSelf: "center",
    maxWidth: "94%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  transcriptText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#E2E8F0",
    lineHeight: 22,
  },
  responseCard: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    padding: 18,
    borderRadius: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
  },
  emergencyCard: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  responseHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  responseLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#34D399",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  badgePill: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#A7F3D0",
  },
  responseText: {
    fontSize: 15,
    color: "#F1F5F9",
    lineHeight: 23,
    fontWeight: "500",
  },
  handsFreeFooter: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 16,
    fontWeight: "500",
  },
});
