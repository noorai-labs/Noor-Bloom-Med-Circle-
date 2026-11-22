/**
 * Multilingual Voice Assistant Modal for BLOOM MED
 * Gemini-style Minimalist Voice AI Agent
 * - Deepgram Nova-3 Real-Time WebSocket Streaming (live words on screen)
 * - Cartesia Sonic sub-90ms Speech Synthesis
 * - Hands-Free Continuous Multi-Turn Conversation
 * - Voice Activity Detection (VAD) with Mid-Sentence Pause Tolerance
 * - Real-Time Interruption (Barge-In)
 * - 60-Second Inactivity Auto-Close & Microphone Release
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
  Chip,
  Icon,
  theme,
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
  VoiceIntentResolution,
  VoiceLanguage,
  VoicePipelineStatus,
} from "./voice-types";

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
  const [resolution, setResolution] = useState<VoiceIntentResolution | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [pulseAnim] = useState(() => new Animated.Value(1));
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 60-Second Inactivity Timer (releases mic & closes session on silence)
  function resetInactivityTimer() {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      // 60 seconds with only background noise/silence -> end session & release microphone
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
  }

  useEffect(() => {
    if (status === "listening" || status === "speaking") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.28,
            duration: 650,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 650,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

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
   * Reads real patient schedule & active medicines aloud from the clinic store
   * Designed specifically for non-literate and elderly patients.
   */
  function enrichIntentWithClinicData(
    intentRes: VoiceIntentResolution,
    lang: VoiceLanguage
  ): VoiceIntentResolution {
    if (!clinicStore?.state) return intentRes;

    if (intentRes.intent === "NAVIGATE_MEDICINES") {
      const activeMeds = clinicStore.state.medicines.filter((m) => m.active);
      if (activeMeds.length > 0) {
        const medList = activeMeds
          .map((m) => `${m.name} (${m.time})`)
          .join(", ");
        if (lang === "hi-IN") {
          intentRes.spokenResponse = `आज आपकी ${activeMeds.length} दवाइयाँ हैं: ${medList}। मैं दवाइयों का पेज खोल रही हूँ।`;
        } else if (lang === "kn-IN") {
          intentRes.spokenResponse = `ಇಂದು ನಿಮಗೆ ${activeMeds.length} ಔಷಧಿಗಳಿವೆ: ${medList}. ಮಾತ್ರೆಗಳ ಪಟ್ಟಿಯನ್ನು ತೆರೆಯುತ್ತಿದ್ದೇನೆ.`;
        } else if (lang === "ta-IN") {
          intentRes.spokenResponse = `இன்று உங்களுக்கு ${activeMeds.length} மருந்துகள் உள்ளன: ${medList}.`;
        } else if (lang === "te-IN") {
          intentRes.spokenResponse = `ఈరోజు మీకు ${activeMeds.length} మందులు ఉన్నాయి: ${medList}.`;
        } else {
          intentRes.spokenResponse = `You have ${activeMeds.length} medicines scheduled today: ${medList}. Opening your medicines schedule.`;
        }
      }
    } else if (intentRes.intent === "QUERY_NEXT_APPOINTMENT") {
      const upcomingVisits = clinicStore.state.visits.filter(
        (v) => !["Completed", "Cancelled"].includes(v.status)
      );
      if (upcomingVisits.length > 0) {
        const nextV = upcomingVisits[0];
        if (lang === "hi-IN") {
          intentRes.spokenResponse = `आपकी अगली विज़िट ${nextV.date} को ${nextV.time} बजे है। अपॉइंटमेंट पेज खोल रही हूँ।`;
        } else if (lang === "kn-IN") {
          intentRes.spokenResponse = `ನಿಮ್ಮ ಮುಂದಿನ ಭೇಟಿ ${nextV.date} ರಂದು ${nextV.time} ಕ್ಕೆ ಇದೆ.`;
        } else if (lang === "ta-IN") {
          intentRes.spokenResponse = `உங்கள் அடுத்த சந்திப்பு ${nextV.date} அன்று ${nextV.time} மணிக்கு உள்ளது.`;
        } else if (lang === "te-IN") {
          intentRes.spokenResponse = `మీ తదుపరి అపాయింట్‌మెంట్ ${nextV.date}న ${nextV.time} గంటలకు ఉంది.`;
        } else {
          intentRes.spokenResponse = `Your next visit is for ${nextV.service} on ${nextV.date} at ${nextV.time}. Opening appointments.`;
        }
      }
    }

    return intentRes;
  }

  async function handleSpokenTranscript(finalText: string) {
    if (!finalText.trim()) return;

    resetInactivityTimer();
    setTranscript(finalText);
    setStatus("processing");

    try {
      let intentRes = deepgramCartesiaAdapter.resolveIntent(
        finalText,
        selectedLanguage
      );
      intentRes = enrichIntentWithClinicData(intentRes, selectedLanguage);
      setResolution(intentRes);

      setStatus("speaking");

      // Play audio response using Cartesia Sonic
      await deepgramCartesiaAdapter.synthesizeSpeech(
        intentRes.spokenResponse,
        selectedLanguage
      );

      // Hands-Free Continuous Loop:
      // The moment Bloom finishes speaking, seamlessly resume listening for next turn!
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
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const dummyCtx = new AudioCtx();
          if (dummyCtx.state === "suspended") {
            dummyCtx.resume().catch(() => {});
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
          // Real-time live words appearing on screen as the user speaks!
          setTranscript(interim);
        },
        onFinalTranscript: (finalText) => {
          handleSpokenTranscript(finalText);
        },
        onBargeIn: () => {
          // User spoke while Bloom was speaking -> instantly cut off Bloom and listen!
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
      // User tapped while Bloom was speaking -> pause audio immediately
      deepgramCartesiaAdapter.stopSpeaking();
      setStatus("listening");
      return;
    }

    if (status === "listening" || status === "processing") {
      // Tap to end session
      stopAll();
      return;
    }

    // Start live WebSocket hands-free session
    startLiveSession();
  }

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
          {/* Top Bar: Minimal Gemini-Style Brand & Close */}
          <View style={localStyles.header}>
            <View style={localStyles.brandRow}>
              <View style={localStyles.statusDot} />
              <Text style={localStyles.brandText}>Bloom</Text>
            </View>
            <Touch
              onPress={() => {
                stopAll();
                onClose();
              }}
              label="Close"
            >
              <Icon name="close" color={theme.muted} size={24} />
            </Touch>
          </View>

          {/* Minimal Language Pill Selector */}
          <View style={localStyles.langStrip}>
            {SUPPORTED_VOICE_LANGUAGES.map((lang) => (
              <Chip
                key={lang.code}
                title={lang.nativeLabel}
                active={selectedLanguage === lang.code}
                onPress={() => {
                  stopAll();
                  setSelectedLanguage(lang.code);
                }}
              />
            ))}
          </View>

          {/* Center Visualizer: Gemini-Style Glowing Orb */}
          <View style={localStyles.visualizerBox}>
            <Animated.View
              style={[
                localStyles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                  backgroundColor:
                    status === "listening"
                      ? "rgba(20, 125, 104, 0.15)"
                      : status === "speaking"
                      ? "rgba(85, 126, 185, 0.15)"
                      : "transparent",
                },
              ]}
            >
              <Touch
                onPress={handleMicPress}
                style={{
                  ...localStyles.micButton,
                  ...(status === "listening"
                    ? { backgroundColor: theme.green }
                    : status === "speaking"
                    ? { backgroundColor: "#557EB9" }
                    : {}),
                }}
                label="Voice Orb"
              >
                <Icon
                  name={
                    status === "speaking"
                      ? "volume-high"
                      : status === "processing"
                      ? "ellipsis-horizontal"
                      : status === "listening"
                      ? "mic"
                      : "mic-outline"
                  }
                  color="white"
                  size={36}
                />
              </Touch>
            </Animated.View>

            {/* Clean Status */}
            <Text style={localStyles.statusText}>
              {status === "idle" &&
                (selectedLanguage === "hi-IN"
                  ? "बात करने के लिए टैप करें"
                  : selectedLanguage === "kn-IN"
                  ? "ಮಾತನಾಡಲು ಒತ್ತಿ"
                  : selectedLanguage === "ta-IN"
                  ? "பேச தட்டவும்"
                  : selectedLanguage === "te-IN"
                  ? "మాట్లాడటానికి నొక్కండి"
                  : "Tap to speak")}
              {status === "listening" &&
                (selectedLanguage === "hi-IN"
                  ? "सुन रही हूँ..."
                  : selectedLanguage === "kn-IN"
                  ? "ಆಲಿಸುತ್ತಿದೆ..."
                  : selectedLanguage === "ta-IN"
                  ? "கேட்கிறது..."
                  : selectedLanguage === "te-IN"
                  ? "వింటున్నాను..."
                  : "Listening...")}
              {status === "processing" && "..."}
              {status === "speaking" &&
                (selectedLanguage === "hi-IN"
                  ? "बोल रही हूँ..."
                  : selectedLanguage === "kn-IN"
                  ? "ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ..."
                  : "Speaking...")}
              {status === "error" && errorMsg}
            </Text>
          </View>

          {/* Floating Transcript Area */}
          {transcript !== "" && (
            <View style={localStyles.transcriptBubble}>
              <Text style={localStyles.transcriptText}>
                &ldquo;{transcript}&rdquo;
              </Text>
            </View>
          )}

          {/* Floating Spoken Response & Action Button */}
          {resolution && (
            <View style={localStyles.responseCard}>
              <Text style={localStyles.responseText}>
                {resolution.spokenResponse}
              </Text>

              {resolution.targetRoute && (
                <View style={{ marginTop: 12 }}>
                  <Button
                    title={`Open ${resolution.targetRoute.replace(
                      /[\/()]/g,
                      ""
                    )} →`}
                    onPress={() => handleNavigate(resolution.targetRoute!)}
                  />
                </View>
              )}
            </View>
          )}

          {/* Subtle Hands-free Indicator */}
          {status === "listening" && (
            <Text style={localStyles.handsFreeHint}>
              Hands-free continuous session · Say &ldquo;Stop&rdquo; or pause to exit
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
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "white",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.green,
  },
  brandText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.ink,
    letterSpacing: -0.3,
  },
  langStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  visualizerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  pulseRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  micButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.green,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  statusText: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: "600",
    color: theme.muted,
    textAlign: "center",
  },
  transcriptBubble: {
    backgroundColor: "#F4F7F6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginVertical: 8,
    alignSelf: "center",
    maxWidth: "92%",
  },
  transcriptText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.ink,
    textAlign: "center",
  },
  responseCard: {
    backgroundColor: theme.mint,
    padding: 16,
    borderRadius: 18,
    marginTop: 8,
    borderColor: "#CDEFE5",
    borderWidth: 1,
  },
  responseText: {
    fontSize: 15,
    color: theme.ink,
    lineHeight: 22,
    fontWeight: "500",
  },
  handsFreeHint: {
    fontSize: 12,
    color: theme.muted,
    textAlign: "center",
    marginTop: 16,
  },
});
