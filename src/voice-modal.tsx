/**
 * Multilingual Voice Assistant Modal Component for BLOOM MED
 * Accessible Voice AI Agent with Dynamic Patient Schedule Reading
 * Features Voice Activity Detection (VAD) / Silence Auto-Stop
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
  Body,
  Button,
  Card,
  Chip,
  Icon,
  styles as globalStyles,
  theme,
  Title,
  Touch,
} from "./components";
import {
  deepgramCartesiaAdapter,
} from "./deepgram-cartesia-adapter";
import { ClinicContext } from "./store";
import {
  MOCK_TEST_PHRASES,
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
  const [isLiveListening, setIsLiveListening] = useState<boolean>(false);
  const [autoNavigating, setAutoNavigating] = useState<boolean>(false);

  const [pulseAnim] = useState(() => new Animated.Value(1));
  const isStoppingRef = useRef<boolean>(false);
  const autoNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopAll() {
    isStoppingRef.current = false;
    if (autoNavTimerRef.current) {
      clearTimeout(autoNavTimerRef.current);
      autoNavTimerRef.current = null;
    }
    deepgramCartesiaAdapter.stopSpeaking();
    deepgramCartesiaAdapter.stopMicrophoneCapture().catch(() => {});
    setIsLiveListening(false);
    setAutoNavigating(false);
    setStatus("idle");
  }

  useEffect(() => {
    if (status === "listening" || isLiveListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, isLiveListening, pulseAnim]);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, []);

  function handleStop() {
    stopAll();
    setErrorMsg("");
  }

  function handleRetry() {
    stopAll();
    setTranscript("");
    setResolution(null);
    setErrorMsg("");
  }

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

    setTranscript(finalText);
    setStatus("processing");
    setIsLiveListening(false);

    try {
      let intentRes = deepgramCartesiaAdapter.resolveIntent(
        finalText,
        selectedLanguage
      );
      intentRes = enrichIntentWithClinicData(intentRes, selectedLanguage);
      setResolution(intentRes);

      setStatus("speaking");

      // 1. Wait for Bloom to finish speaking the entire response aloud!
      await deepgramCartesiaAdapter.synthesizeSpeech(
        intentRes.spokenResponse,
        selectedLanguage
      );
      setStatus("idle");

      // 2. ONLY navigate AFTER the full speech audio has finished playing!
      if (intentRes.targetRoute && !intentRes.requiresConfirmation) {
        setAutoNavigating(true);
        autoNavTimerRef.current = setTimeout(() => {
          handleNavigate(intentRes.targetRoute!);
        }, 1200);
      }
    } catch {
      setStatus("error");
      setErrorMsg("Error generating voice response.");
    }
  }

  async function startMicrophone() {
    stopAll();
    setTranscript("");
    setResolution(null);
    setErrorMsg("");
    setIsLiveListening(true);
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

    const started = await deepgramCartesiaAdapter.startMicrophoneCapture({
      onSilenceAutoStop: () => {
        stopMicrophoneAndTranscribe();
      },
    });

    if (!started) {
      setIsLiveListening(false);
      setStatus("error");
      setErrorMsg("Could not access microphone. Please check mic permissions.");
    }
  }

  async function stopMicrophoneAndTranscribe() {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    setIsLiveListening(false);
    setStatus("processing");

    try {
      const blob = await deepgramCartesiaAdapter.stopMicrophoneCapture();
      if (!blob) {
        setStatus("idle");
        return;
      }

      const recognized = await deepgramCartesiaAdapter.transcribeAudioBlob(
        blob,
        selectedLanguage
      );

      if (!recognized) {
        setStatus("idle");
        setErrorMsg("No speech detected. Please speak clearly into the mic.");
        return;
      }

      await handleSpokenTranscript(recognized);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message || "Transcription failed.");
    } finally {
      isStoppingRef.current = false;
    }
  }

  async function processPresetPhrase(phrase: string) {
    stopAll();
    setTranscript(phrase);
    setResolution(null);
    setErrorMsg("");
    setStatus("processing");

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    try {
      let intentRes = deepgramCartesiaAdapter.resolveIntent(phrase, selectedLanguage);
      intentRes = enrichIntentWithClinicData(intentRes, selectedLanguage);
      setResolution(intentRes);

      setStatus("speaking");

      // 1. Wait for Bloom to finish speaking the entire response aloud!
      await deepgramCartesiaAdapter.synthesizeSpeech(
        intentRes.spokenResponse,
        selectedLanguage
      );
      setStatus("idle");

      // 2. ONLY navigate AFTER the full speech audio has finished playing!
      if (intentRes.targetRoute && !intentRes.requiresConfirmation) {
        setAutoNavigating(true);
        autoNavTimerRef.current = setTimeout(() => {
          handleNavigate(intentRes.targetRoute!);
        }, 1200);
      }
    } catch {
      setStatus("error");
      setErrorMsg("Could not synthesize speech.");
    }
  }

  function handleMicPress() {
    if (status === "speaking") {
      stopAll();
      return;
    }

    if (isLiveListening || status === "listening") {
      stopMicrophoneAndTranscribe();
      return;
    }

    startMicrophone();
  }

  const currentSamplePhrases =
    MOCK_TEST_PHRASES[selectedLanguage] || MOCK_TEST_PHRASES["en-IN"];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        stopAll();
        onClose();
      }}
    >
      <View style={localStyles.overlay}>
        <View style={localStyles.container}>
          {/* Header */}
          <View style={localStyles.header}>
            <View style={globalStyles.row}>
              <Icon name="mic" color={theme.green} size={24} />
              <Title small>Bloom Voice Assistant</Title>
            </View>
            <Touch
              onPress={() => {
                stopAll();
                onClose();
              }}
              label="Close"
            >
              <Icon name="close-circle-outline" color={theme.muted} size={26} />
            </Touch>
          </View>

          {/* Multilingual Language Switcher */}
          <View style={{ marginBottom: 12 }}>
            <Body muted>Select conversation language:</Body>
            <View
              style={[
                globalStyles.row,
                { flexWrap: "wrap", gap: 8, marginTop: 4 },
              ]}
            >
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
          </View>

          {/* Central Interactive Microphone Button */}
          <View style={localStyles.visualizerBox}>
            <Animated.View
              style={[
                localStyles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                  backgroundColor:
                    status === "listening" || isLiveListening
                      ? "rgba(20, 125, 104, 0.2)"
                      : status === "speaking"
                      ? "rgba(85, 126, 185, 0.2)"
                      : "transparent",
                },
              ]}
            >
              <Touch
                onPress={handleMicPress}
                style={{
                  ...localStyles.micButton,
                  ...(status === "listening" || isLiveListening
                    ? { backgroundColor: theme.green }
                    : status === "speaking"
                    ? { backgroundColor: "#557EB9" }
                    : {}),
                }}
                label="Microphone Button"
              >
                <Icon
                  name={
                    status === "speaking"
                      ? "volume-high"
                      : status === "processing"
                      ? "hourglass-outline"
                      : isLiveListening || status === "listening"
                      ? "mic"
                      : "mic-outline"
                  }
                  color="white"
                  size={32}
                />
              </Touch>
            </Animated.View>

            <Text style={localStyles.statusText}>
              {status === "idle" &&
                (selectedLanguage === "hi-IN"
                  ? "🎙️ बात करने के लिए माइक दबाएँ"
                  : selectedLanguage === "kn-IN"
                  ? "🎙️ ಮಾತನಾಡಲು ಮೈಕ್ ಒತ್ತಿ"
                  : selectedLanguage === "ta-IN"
                  ? "🎙️ பேச மைக் அழுத்தவும்"
                  : selectedLanguage === "te-IN"
                  ? "🎙️ మాట్లాడటానికి మైక్ నొక్కండి"
                  : "🎙️ Tap mic & speak")}
              {(status === "listening" || isLiveListening) &&
                (selectedLanguage === "hi-IN"
                  ? "सुन रही हूँ..."
                  : selectedLanguage === "kn-IN"
                  ? "ಆಲಿಸುತ್ತಿದೆ..."
                  : selectedLanguage === "ta-IN"
                  ? "கேட்கிறது..."
                  : selectedLanguage === "te-IN"
                  ? "వింటున్నాను..."
                  : "Listening...")}
              {status === "processing" &&
                (selectedLanguage === "hi-IN"
                  ? "प्रोसेस हो रहा है..."
                  : selectedLanguage === "kn-IN"
                  ? "ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗುತ್ತಿದೆ..."
                  : selectedLanguage === "ta-IN"
                  ? "செயலாக்குகிறது..."
                  : selectedLanguage === "te-IN"
                  ? "ప్రాసెస్ చేస్తోంది..."
                  : "Processing...")}
              {status === "speaking" &&
                (selectedLanguage === "hi-IN"
                  ? "🔊 बोल रही है..."
                  : selectedLanguage === "kn-IN"
                  ? "🔊 ಮಾತನಾಡುತ್ತಿದೆ..."
                  : selectedLanguage === "ta-IN"
                  ? "🔊 பேசுகிறது..."
                  : selectedLanguage === "te-IN"
                  ? "🔊 మాట్లాడుతోంది..."
                  : "🔊 Speaking...")}
              {status === "error" && errorMsg}
            </Text>

            {autoNavigating && (
              <View style={localStyles.autoNavBadge}>
                <Icon name="arrow-forward-circle" color={theme.green} size={16} />
                <Text style={localStyles.autoNavText}>
                  {selectedLanguage === "hi-IN"
                    ? "सीधे खोला जा रहा है..."
                    : selectedLanguage === "kn-IN"
                    ? "ನೇರವಾಗಿ ತೆರೆಯಲಾಗುತ್ತಿದೆ..."
                    : "Opening tab directly..."}
                </Text>
              </View>
            )}
          </View>

          {/* Transcript & Response Display */}
          {transcript !== "" && (
            <Card style={localStyles.transcriptCard}>
              <Body muted>
                {selectedLanguage === "hi-IN"
                  ? "आपने कहा:"
                  : selectedLanguage === "kn-IN"
                  ? "ನೀವು ಹೇಳಿದ್ದು:"
                  : "You said:"}
              </Body>
              <Text style={localStyles.transcriptText}>
                &ldquo;{transcript}&rdquo;
              </Text>

              {resolution && (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <Text style={localStyles.responseText}>
                    {resolution.spokenResponse}
                  </Text>

                  {resolution.isMedicalQuery && (
                    <View style={localStyles.guardrailBadge}>
                      <Icon
                        name="shield-checkmark"
                        color={theme.red}
                        size={16}
                      />
                      <Text style={localStyles.guardrailText}>
                        Clinical Guardrail: Medical Advice Refused
                      </Text>
                    </View>
                  )}

                  {resolution.targetRoute && (
                    <Button
                      title={`Open ${resolution.targetRoute.replace(
                        /[\/()]/g,
                        ""
                      )} →`}
                      onPress={() => handleNavigate(resolution.targetRoute!)}
                    />
                  )}
                </View>
              )}
            </Card>
          )}

          {/* Quick Queries in Current Language */}
          <View style={{ marginTop: 6 }}>
            <Body muted>
              {selectedLanguage === "hi-IN"
                ? "या कोई प्रश्न चुनें (बोलकर सुने):"
                : selectedLanguage === "kn-IN"
                ? "ಅಥವಾ ಧ್ವನಿಯಲ್ಲಿ ಕೇಳಲು ಆಯ್ಕೆಮಾಡಿ:"
                : selectedLanguage === "ta-IN"
                ? "அல்லது குரலில் கேட்க தேர்வு செய்யவும்:"
                : selectedLanguage === "te-IN"
                ? "లేదా వాయిస్‌లో వినడానికి ఎంచుకోండి:"
                : "Or tap to hear Bloom speak:"}
            </Body>
            <View style={{ gap: 6, marginTop: 6 }}>
              {currentSamplePhrases.slice(0, 3).map((p) => (
                <Touch
                  key={p}
                  style={localStyles.testPhraseButton}
                  onPress={() => processPresetPhrase(p)}
                  label={p}
                >
                  <Icon
                    name="play-circle-outline"
                    size={18}
                    color={theme.green}
                  />
                  <Text style={localStyles.testPhraseText}>{p}</Text>
                </Touch>
              ))}
            </View>
          </View>

          {/* Controls: Stop / Retry / Type Instead */}
          <View style={[globalStyles.row, { gap: 10, marginTop: 14 }]}>
            {(status !== "idle" || isLiveListening) && (
              <View style={{ flex: 1 }}>
                <Button title="Stop Audio" secondary danger onPress={handleStop} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button title="Retry" secondary onPress={handleRetry} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Type Instead"
                secondary
                onPress={() => {
                  stopAll();
                  onClose();
                }}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "white",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  visualizerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  pulseRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.green,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  statusText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: theme.ink,
    textAlign: "center",
  },
  autoNavBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.mint,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginTop: 6,
  },
  autoNavText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.green,
  },
  transcriptCard: {
    backgroundColor: theme.mint,
    borderColor: "#CDEFE5",
    padding: 12,
    borderRadius: 14,
    marginVertical: 8,
  },
  transcriptText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.ink,
    marginTop: 2,
  },
  responseText: {
    fontSize: 14,
    color: theme.ink,
    lineHeight: 20,
  },
  guardrailBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FBE0E5",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  guardrailText: {
    fontSize: 12,
    color: theme.red,
    fontWeight: "600",
  },
  testPhraseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bg,
  },
  testPhraseText: {
    fontSize: 13,
    color: theme.ink,
    fontWeight: "500",
  },
});
