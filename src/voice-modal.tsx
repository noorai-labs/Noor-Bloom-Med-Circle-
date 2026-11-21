/**
 * Multilingual Voice Assistant Modal Component for BLOOM MED
 * Powered exclusively by:
 * ⚡ Deepgram Nova-3 (STT) + Cartesia Sonic-3.6 (TTS)
 * Features Voice Activity Detection (VAD) / Silence Auto-Stop
 */

import React, { useEffect, useRef, useState } from "react";
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

  async function handleSpokenTranscript(finalText: string) {
    if (!finalText.trim()) return;

    setTranscript(finalText);
    setStatus("processing");
    setIsLiveListening(false);

    try {
      const intentRes = deepgramCartesiaAdapter.resolveIntent(
        finalText,
        selectedLanguage
      );
      setResolution(intentRes);

      setStatus("speaking");

      if (intentRes.targetRoute && !intentRes.requiresConfirmation) {
        setAutoNavigating(true);
        autoNavTimerRef.current = setTimeout(() => {
          handleNavigate(intentRes.targetRoute!);
        }, 1500);
      }

      await deepgramCartesiaAdapter.synthesizeSpeech(
        intentRes.spokenResponse,
        selectedLanguage
      );
      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMsg("Error generating Cartesia voice response.");
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

    const started = await deepgramCartesiaAdapter.startMicrophoneCapture({
      onSilenceAutoStop: () => {
        // Auto-stop detected via VAD when user finishes speaking!
        stopMicrophoneAndTranscribe();
      },
    });

    if (!started) {
      setIsLiveListening(false);
      setStatus("error");
      setErrorMsg("Could not access microphone for Deepgram. Please check mic permissions.");
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
        setErrorMsg("Deepgram: No speech detected. Please speak clearly into the mic.");
        return;
      }

      await handleSpokenTranscript(recognized);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message || "Deepgram transcription failed.");
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
      const intentRes = deepgramCartesiaAdapter.resolveIntent(phrase, selectedLanguage);
      setResolution(intentRes);

      setStatus("speaking");

      if (intentRes.targetRoute && !intentRes.requiresConfirmation) {
        setAutoNavigating(true);
        autoNavTimerRef.current = setTimeout(() => {
          handleNavigate(intentRes.targetRoute!);
        }, 1600);
      }

      await deepgramCartesiaAdapter.synthesizeSpeech(
        intentRes.spokenResponse,
        selectedLanguage
      );
      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMsg("Could not synthesize speech with Cartesia.");
    }
  }

  function handleMicPress() {
    if (status === "speaking") {
      stopAll();
      return;
    }

    if (isLiveListening || status === "listening") {
      // User can optionally tap to stop early before VAD 1.2s timeout
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
            <View>
              <View style={globalStyles.row}>
                <Icon name="mic" color={theme.green} size={24} />
                <Title small>Bloom Voice Assistant</Title>
              </View>
              <View style={localStyles.engineBadgeRow}>
                <View style={localStyles.engineBadge}>
                  <Text style={localStyles.engineBadgeText}>
                    ⚡ Deepgram Nova-3 + Cartesia Sonic
                  </Text>
                </View>
              </View>
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
                  ? "🎙️ माइक दबाएँ और बोलें (समाप्त होने पर अपने आप पहचान लेगा)"
                  : selectedLanguage === "kn-IN"
                  ? "🎙️ ಮೈಕ್ ಒತ್ತಿ ಮಾತನಾಡಿ (ಮುಗಿದ ನಂತರ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಕಳುಹಿಸುತ್ತದೆ)"
                  : "🎙️ Tap mic & speak (auto-detects when you finish)")}
              {(status === "listening" || isLiveListening) &&
                (selectedLanguage === "hi-IN"
                  ? "सुन रही हूँ... अपनी बात कहें (रुकने पर अपने आप भेजेगा)"
                  : selectedLanguage === "kn-IN"
                  ? "ಆಲಿಸುತ್ತಿದೆ... ಮಾತನಾಡಿ (ನಿಲ್ಲಿಸಿದ ತಕ್ಷಣ ಕಳುಹಿಸುತ್ತದೆ)"
                  : "Listening with Deepgram... (Speak now, auto-detects pause)")}
              {status === "processing" && "Deepgram Nova-3 transcribing audio..."}
              {status === "speaking" &&
                (selectedLanguage === "hi-IN"
                  ? "🔊 Cartesia Sonic बोल रही है..."
                  : selectedLanguage === "kn-IN"
                  ? "🔊 Cartesia Sonic ಮಾತನಾಡುತ್ತಿದೆ..."
                  : "🔊 Cartesia Sonic is speaking aloud...")}
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
                ? "या कोई उदाहरण चुनें (Cartesia Voice Playback):"
                : selectedLanguage === "kn-IN"
                ? "ಅಥವಾ ಉದಾಹರಣೆ ಕ್ಲಿಕ್ ಮಾಡಿ:"
                : "Or tap a sample query (Cartesia Voice Playback):"}
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
  engineBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  engineBadge: {
    backgroundColor: "#E6F4EA",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CEEAD6",
  },
  engineBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.green,
    letterSpacing: 0.2,
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
