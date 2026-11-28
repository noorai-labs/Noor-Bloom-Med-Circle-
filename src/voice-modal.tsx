/**
 * Multilingual Voice Assistant Modal for BLOOM MED
 * Next-Gen Gemini Live & ChatGPT Advanced Voice Style
 * - Authenticated Backend Speech Proxy (keys kept strictly on server)
 * - Deepgram Nova-3 Real-Time WebSocket Streaming with Interim Words & Utterance Buffering
 * - Cartesia Sonic Speech Synthesis with Pre-Playback Cancellation & Fallback Notice
 * - Unified Patient Knowledge Engine & Multi-Turn Context via Live Refs
 * - Real-Time Audio-Reactive Glowing Visualizer Orb
 * - Sustained-Speech Barge-In & Standalone "Stop" Voice Command
 * - 60-Second Inactivity Hardware Auto-Release (Measured from Last User Speech)
 */

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
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
import { Button, Icon, Touch } from "./components";
import { deepgramCartesiaAdapter } from "./deepgram-cartesia-adapter";
import { ClinicContext } from "./store";
import { SUPPORTED_VOICE_LANGUAGES } from "./voice-adapter";
import { VoiceLanguage, VoicePipelineStatus } from "./voice-types";
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

const STANDALONE_STOP_COMMANDS = new Set([
  "stop",
  "stop listening",
  "exit",
  "close",
  "bye",
  "रोको",
  "बंद करो",
  "ರುಕೋ",
  "ನಿಲ್ಲಿಸಿ",
  "நிறுத்து",
  "ఆపు",
]);

function isStandaloneStopCommand(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return STANDALONE_STOP_COMMANDS.has(normalized);
}

function formatRouteLabel(route: string, isEmergency?: boolean): string {
  if (isEmergency || route === "/sos") {
    return "Open Emergency SOS Support →";
  }
  switch (route) {
    case "/medicines":
      return "Open Medicines →";
    case "/(tabs)/records":
      return "Open Records →";
    case "/(tabs)/appointments":
      return "Open Appointments →";
    case "/discover":
      return "Open Care Directory →";
    default:
      return "Open Screen →";
  }
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
  const [resolution, setResolution] = useState<AdvancedVoiceResponse | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [audioNotice, setAudioNotice] = useState<string>("");
  const [micVolume, setMicVolume] = useState<number>(0);
  const [history, setHistory] = useState<ConversationTurn[]>([]);

  // Live refs so stable WebSocket callbacks always read current state & history
  const clinicStateRef = useRef(clinicStore?.state);
  const historyRef = useRef<ConversationTurn[]>(history);
  const selectedLanguageRef = useRef<VoiceLanguage>(selectedLanguage);
  const errorMsgRef = useRef<string>(errorMsg);

  useEffect(() => {
    clinicStateRef.current = clinicStore?.state;
  }, [clinicStore?.state]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  useEffect(() => {
    errorMsgRef.current = errorMsg;
  }, [errorMsg]);

  // Sync authenticated backend voice proxy client whenever cloud context updates
  useEffect(() => {
    deepgramCartesiaAdapter.setBackendClient(clinicStore?.cloud?.voice ?? null);
  }, [clinicStore?.cloud?.voice]);

  // Animation values for Gemini Live glowing visualizer orb
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [waveAnim1] = useState(() => new Animated.Value(1));
  const [waveAnim2] = useState(() => new Animated.Value(1));

  // Lifecycle & cancellation tokens
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionGenRef = useRef(0);
  const turnGenRef = useRef(0);
  const pendingNavTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const isHandoffNavigationRef = useRef(false);

  const cancelPendingNavigation = useCallback(() => {
    pendingNavTokenRef.current++;
    if (navigationTimerRef.current) {
      clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }
  }, []);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const stopAll = useCallback(
    (keepSpeaking = false) => {
      sessionGenRef.current++;
      turnGenRef.current++;
      cancelPendingNavigation();
      clearInactivityTimer();

      if (keepSpeaking) {
        deepgramCartesiaAdapter.stopLiveWebSocketSession(true);
      } else {
        deepgramCartesiaAdapter.stopSpeaking();
        deepgramCartesiaAdapter.stopLiveWebSocketSession(false);
      }

      if (mountedRef.current) {
        setStatus("idle");
        setMicVolume(0);
      }
    },
    [cancelPendingNavigation, clearInactivityTimer],
  );

  // 60-Second Inactivity Timer (measured strictly from user speech; closes & releases mic)
  function resetInactivityTimer() {
    clearInactivityTimer();
    const capturedSession = sessionGenRef.current;
    inactivityTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || capturedSession !== sessionGenRef.current) {
        return;
      }
      stopAll(false);
      onClose();
    }, 60000);
  }

  // Visualizer Orb Animations
  useEffect(() => {
    if (
      status === "listening" ||
      status === "speaking" ||
      status === "processing"
    ) {
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
        ]),
      );

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
        ]),
      );

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
        ]),
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (!isHandoffNavigationRef.current) {
        stopAll(false);
      }
    };
  }, [stopAll]);

  // Cancel any live session / pending nav if parent hides the modal externally
  useEffect(() => {
    if (!visible) {
      if (isHandoffNavigationRef.current) {
        isHandoffNavigationRef.current = false;
        return;
      }
      stopAll(false);
    }
  }, [visible, stopAll]);

  function handleNavigate(route: string) {
    isHandoffNavigationRef.current = false;
    stopAll(false);
    onClose();
    router.push(route as any);
  }

  /**
   * Process final user utterance using latest refs for patient knowledge & memory.
   */
  async function handleSpokenTranscript(finalText: string) {
    if (!finalText.trim()) return;

    // 1. Standalone "Stop" voice command ends the session immediately before patient evaluation
    if (isStandaloneStopCommand(finalText)) {
      stopAll(false);
      onClose();
      return;
    }

    const capturedSession = sessionGenRef.current;
    const capturedTurn = ++turnGenRef.current;

    resetInactivityTimer();
    setTranscript(finalText);
    setAudioNotice("");
    setStatus("processing");

    try {
      const lang = selectedLanguageRef.current;
      const res = evaluatePatientKnowledge(
        finalText,
        lang,
        clinicStateRef.current,
        historyRef.current,
      );

      if (
        !mountedRef.current ||
        capturedSession !== sessionGenRef.current ||
        capturedTurn !== turnGenRef.current
      ) {
        return;
      }

      setResolution(res);

      const nextTurn: ConversationTurn = {
        user: finalText,
        bloom: res.spokenResponse,
        topic: res.category as ConversationTurn["topic"],
        medicineId: res.medicineId,
      };
      const updatedHistory = [...historyRef.current, nextTurn];
      historyRef.current = updatedHistory;
      setHistory(updatedHistory);

      // 2. Check server TTS availability before treating navigation as an audible readout
      const availability = await deepgramCartesiaAdapter.checkAvailability();
      if (
        !mountedRef.current ||
        capturedSession !== sessionGenRef.current ||
        capturedTurn !== turnGenRef.current
      ) {
        return;
      }

      if (!availability.ttsAvailable) {
        setAudioNotice(
          "Voice playback is unavailable; showing text response.",
        );
        setStatus("listening");
        return;
      }

      setStatus("speaking");

      if (res.targetRoute && !res.requiresConfirmation) {
        const navToken = ++pendingNavTokenRef.current;
        const target = res.targetRoute;

        const speechResult = await deepgramCartesiaAdapter.speakScreenPrompt(
          lang,
          () => {
            // Schedule handoff ONLY once audible playback actually starts
            if (
              !mountedRef.current ||
              capturedSession !== sessionGenRef.current ||
              navToken !== pendingNavTokenRef.current
            ) {
              return;
            }
            if (navigationTimerRef.current) {
              clearTimeout(navigationTimerRef.current);
            }
            navigationTimerRef.current = setTimeout(() => {
              if (
                !mountedRef.current ||
                capturedSession !== sessionGenRef.current ||
                navToken !== pendingNavTokenRef.current
              ) {
                return;
              }
              navigationTimerRef.current = null;
              isHandoffNavigationRef.current = true;
              stopAll(true);
              onClose();
              router.push(target as any);
            }, 300);
          },
        );

        if (
          !mountedRef.current ||
          capturedSession !== sessionGenRef.current ||
          capturedTurn !== turnGenRef.current
        ) {
          return;
        }

        if (!speechResult.synthesized) {
          cancelPendingNavigation();
          setAudioNotice(
            "Voice playback could not play; tap the button below to continue.",
          );
          setStatus("listening");
        }
        return;
      }

      // Conversational or confirmation-required queries remain inside the modal
      const speechResult = await deepgramCartesiaAdapter.speakScreenPrompt(
        lang,
      );

      if (
        !mountedRef.current ||
        capturedSession !== sessionGenRef.current ||
        capturedTurn !== turnGenRef.current
      ) {
        return;
      }

      if (!speechResult.synthesized) {
        setAudioNotice(
          "Voice playback could not play; showing text response.",
        );
      }

      // Resume listening without resetting the 60s user-speech inactivity timer
      setStatus("listening");
    } catch {
      if (
        !mountedRef.current ||
        capturedSession !== sessionGenRef.current ||
        capturedTurn !== turnGenRef.current
      ) {
        return;
      }
      setStatus("error");
      setErrorMsg("Error generating voice response.");
    }
  }

  async function startLiveSession() {
    isHandoffNavigationRef.current = false;
    stopAll(false);
    const capturedSession = sessionGenRef.current;

    setTranscript("");
    setResolution(null);
    setErrorMsg("");
    errorMsgRef.current = "";
    setAudioNotice("");
    setStatus("processing");

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    // Unlock browser audio context on user gesture and always close temporary context cleanly
    if (typeof window !== "undefined") {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        let testCtx: AudioContext | null = null;
        try {
          testCtx = new AudioCtxClass();
          if (testCtx.state === "suspended") {
            await testCtx.resume();
          }
        } catch {
          // ignore
        } finally {
          if (testCtx) {
            await testCtx.close().catch(() => {});
          }
        }
      }
    }

    if (!mountedRef.current || capturedSession !== sessionGenRef.current) {
      return;
    }

    if (!deepgramCartesiaAdapter.isConfigured()) {
      setStatus("error");
      setErrorMsg(
        "Cloud voice backend is not configured. Sign in via cloud mode to use live voice.",
      );
      return;
    }

    resetInactivityTimer();

    const started = await deepgramCartesiaAdapter.startLiveWebSocketSession(
      selectedLanguageRef.current,
      {
        onSpeechStarted: () => {
          if (capturedSession === sessionGenRef.current) {
            resetInactivityTimer();
          }
        },
        onInterimTranscript: (interim) => {
          if (capturedSession === sessionGenRef.current) {
            setTranscript(interim);
          }
        },
        onFinalTranscript: (finalText) => {
          if (capturedSession === sessionGenRef.current) {
            void handleSpokenTranscript(finalText);
          }
        },
        onVolumeChange: (vol) => {
          if (capturedSession === sessionGenRef.current) {
            setMicVolume(vol);
          }
        },
        onBargeIn: () => {
          if (capturedSession !== sessionGenRef.current) return;
          cancelPendingNavigation();
          turnGenRef.current++;
          setStatus("listening");
          setTranscript("");
          resetInactivityTimer();
        },
        onError: (err) => {
          if (capturedSession !== sessionGenRef.current) return;
          cancelPendingNavigation();
          errorMsgRef.current = err;
          setStatus("error");
          setErrorMsg(err);
        },
      },
    );

    if (
      started &&
      mountedRef.current &&
      capturedSession === sessionGenRef.current
    ) {
      setStatus("listening");
    } else if (
      !started &&
      mountedRef.current &&
      capturedSession === sessionGenRef.current
    ) {
      setStatus("error");
      if (!errorMsgRef.current) {
        setErrorMsg("Could not connect to live voice session.");
      }
    }
  }

  function handleMicPress() {
    if (status === "speaking") {
      cancelPendingNavigation();
      turnGenRef.current++;
      deepgramCartesiaAdapter.stopSpeaking();
      setStatus("listening");
      return;
    }

    if (status === "listening" || status === "processing") {
      stopAll(false);
      return;
    }

    void startLiveSession();
  }

  const volumeScale = Math.min(1.25, 1.0 + (micVolume / 100) * 0.4);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={() => {
        stopAll(false);
        onClose();
      }}
    >
      <View style={localStyles.overlay}>
        <View style={localStyles.container}>
          {/* Top Bar */}
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

              <View style={localStyles.statusPill}>
                <Text style={localStyles.statusPillText}>
                  {status === "idle" && "Ready"}
                  {status === "listening" && "Listening..."}
                  {status === "processing" && "Thinking..."}
                  {status === "speaking" && "Speaking..."}
                  {status === "error" && "Unavailable"}
                </Text>
              </View>
            </View>

            <Touch
              onPress={() => {
                stopAll(false);
                onClose();
              }}
              label="Close"
            >
              <View style={localStyles.closeCircle}>
                <Icon name="close" color="#94A3B8" size={20} />
              </View>
            </Touch>
          </View>

          {/* Language Pill Selector */}
          <View style={localStyles.langStrip}>
            {SUPPORTED_VOICE_LANGUAGES.map((lang) => {
              const active = selectedLanguage === lang.code;
              return (
                <Touch
                  key={lang.code}
                  onPress={() => {
                    stopAll(false);
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

          {/* Center Visualizer: Audio-Reactive Glowing Orb */}
          <View style={localStyles.visualizerBox}>
            <Animated.View
              style={[
                localStyles.waveRingOuter,
                {
                  transform: [{ scale: waveAnim1 }, { scale: volumeScale }],
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

          {/* Kinetic Live Streaming Transcript */}
          {transcript !== "" && (
            <View style={localStyles.transcriptBubble}>
              <Text style={localStyles.transcriptLabel}>You</Text>
              <Text style={localStyles.transcriptText}>
                &ldquo;{transcript}&rdquo;
              </Text>
            </View>
          )}

          {/* Audio Fallback Notice */}
          {audioNotice !== "" && (
            <View style={localStyles.noticeBanner}>
              <Text style={localStyles.noticeBannerText}>{audioNotice}</Text>
            </View>
          )}

          {/* Spoken Response & Knowledge Card */}
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
                    title={formatRouteLabel(
                      resolution.targetRoute,
                      resolution.isEmergencyAlert,
                    )}
                    danger={resolution.isEmergencyAlert}
                    onPress={() => handleNavigate(resolution.targetRoute!)}
                  />
                </View>
              )}
            </View>
          )}

          {status === "listening" && (
            <Text style={localStyles.handsFreeFooter}>
              Continuous hands-free conversation · Say &ldquo;Stop&rdquo; or
              pause to exit
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
  noticeBanner: {
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    borderColor: "rgba(245, 158, 11, 0.35)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  noticeBannerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FCD34D",
    textAlign: "center",
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
