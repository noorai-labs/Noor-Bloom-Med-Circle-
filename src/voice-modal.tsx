/**
 * Voice Assistant Modal Component for BLOOM MED
 * Part of Week 2 deliverable: feature/roshan/voice-help-prototype
 * Features real-time microphone listening (STT) and voice speech synthesis (TTS)
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
  isSpeechRecognitionSupported,
  MOCK_TEST_PHRASES,
  speechAdapter,
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

  const [pulseAnim] = useState(() => new Animated.Value(1));
  const cancelLiveListeningRef = useRef<(() => void) | null>(null);

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

  function stopAll() {
    if (cancelLiveListeningRef.current) {
      cancelLiveListeningRef.current();
      cancelLiveListeningRef.current = null;
    }
    speechAdapter.stopLiveListening();
    speechAdapter.stopSpeaking();
    setIsLiveListening(false);
    setStatus("idle");
  }

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

  async function handleSpokenTranscript(finalText: string) {
    if (!finalText.trim()) return;

    setTranscript(finalText);
    setStatus("processing");
    setIsLiveListening(false);

    try {
      const intentRes = speechAdapter.resolveIntent(
        finalText,
        selectedLanguage
      );
      setResolution(intentRes);

      setStatus("speaking");
      await speechAdapter.synthesizeSpeech(
        intentRes.spokenResponse,
        selectedLanguage
      );
      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMsg("Error generating speech response.");
    }
  }

  function startMicrophoneListening() {
    stopAll();
    setTranscript("");
    setResolution(null);
    setErrorMsg("");

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    if (!isSpeechRecognitionSupported()) {
      // Fallback if browser doesn't have webkitSpeechRecognition
      processPresetPhrase("Show my medicines");
      return;
    }

    setIsLiveListening(true);
    setStatus("listening");

    const cleanup = speechAdapter.startLiveListening(selectedLanguage, {
      onListeningStart: () => {
        setStatus("listening");
        setIsLiveListening(true);
      },
      onInterimTranscript: (interim) => {
        setTranscript(interim);
      },
      onFinalTranscript: (finalText) => {
        handleSpokenTranscript(finalText);
      },
      onError: (err) => {
        setIsLiveListening(false);
        setStatus("error");
        setErrorMsg(err);
      },
      onEnd: () => {
        setIsLiveListening(false);
      },
    });

    cancelLiveListeningRef.current = cleanup;
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
      const intentRes = speechAdapter.resolveIntent(phrase, selectedLanguage);
      setResolution(intentRes);

      setStatus("speaking");
      await speechAdapter.synthesizeSpeech(
        intentRes.spokenResponse,
        selectedLanguage
      );
      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMsg("Could not synthesize speech.");
    }
  }

  function handleNavigate(route: string) {
    stopAll();
    onClose();
    router.push(route as any);
  }

  function handleMicPress() {
    if (status === "speaking") {
      speechAdapter.stopSpeaking();
      setStatus("idle");
      return;
    }
    if (isLiveListening || status === "listening") {
      stopAll();
      return;
    }
    startMicrophoneListening();
  }

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
              <Title small>Voice Assistant (Live Audio)</Title>
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

          {/* Language Selector */}
          <View style={{ marginBottom: 12 }}>
            <Body muted>Select language:</Body>
            <View
              style={[
                globalStyles.row,
                { flexWrap: "wrap", gap: 8, marginTop: 6 },
              ]}
            >
              {SUPPORTED_VOICE_LANGUAGES.map((lang) => (
                <Chip
                  key={lang.code}
                  title={lang.nativeLabel}
                  selected={selectedLanguage === lang.code}
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
                style={[
                  localStyles.micButton,
                  (status === "listening" || isLiveListening) && {
                    backgroundColor: theme.green,
                  },
                  status === "speaking" && { backgroundColor: "#557EB9" },
                ]}
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
              {status === "idle" && "🎙️ Tap the mic to speak to Bloom"}
              {(status === "listening" || isLiveListening) &&
                "Listening to your microphone... (Speak now)"}
              {status === "processing" && "Processing what you said..."}
              {status === "speaking" && "🔊 Bloom is speaking aloud..."}
              {status === "error" && errorMsg}
            </Text>
          </View>

          {/* Real-time Visible Transcript & Spoken Response Card */}
          {transcript !== "" && (
            <Card style={localStyles.transcriptCard}>
              <Body muted>You said:</Body>
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

          {/* Quick Simulation Options */}
          <View style={{ marginTop: 8 }}>
            <Body muted>Or try a sample query:</Body>
            <View style={{ gap: 6, marginTop: 6 }}>
              {MOCK_TEST_PHRASES.slice(0, 3).map((p) => (
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
              <Touch
                style={[
                  localStyles.testPhraseButton,
                  { borderColor: theme.red },
                ]}
                onPress={() =>
                  processPresetPhrase("What medicine should I take for headache?")
                }
                label="Safety Guardrail Test"
              >
                <Icon
                  name="alert-circle-outline"
                  size={18}
                  color={theme.red}
                />
                <Text
                  style={[localStyles.testPhraseText, { color: theme.red }]}
                >
                  &ldquo;What medicine for headache?&rdquo; (Test Safety)
                </Text>
              </Touch>
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
    marginBottom: 10,
  },
  visualizerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  pulseRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
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
