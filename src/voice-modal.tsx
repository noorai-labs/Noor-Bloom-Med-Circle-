/**
 * Voice Assistant Modal Component for BLOOM MED
 * Part of Week 2 deliverable: feature/roshan/voice-help-prototype
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

  const [pulseAnim] = useState(() => new Animated.Value(1));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === "listening") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleStop() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStatus("idle");
    setErrorMsg("");
  }

  function handleRetry() {
    handleStop();
    setTranscript("");
    setResolution(null);
  }

  async function processPhrase(phrase: string) {
    handleStop();
    setTranscript("");
    setResolution(null);
    setErrorMsg("");
    setStatus("listening");

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    timeoutRef.current = setTimeout(async () => {
      setStatus("processing");

      try {
        const result = await speechAdapter.transcribeTestAudio(
          phrase,
          selectedLanguage
        );
        setTranscript(result.transcript);

        const intentRes = speechAdapter.resolveIntent(
          result.transcript,
          selectedLanguage
        );
        setResolution(intentRes);

        setStatus("speaking");
        const tts = await speechAdapter.synthesizeSpeech(
          intentRes.spokenResponse,
          selectedLanguage
        );

        timeoutRef.current = setTimeout(() => {
          setStatus("idle");
        }, tts.durationMs);
      } catch {
        setStatus("error");
        setErrorMsg("Could not process audio. Please try again or type.");
      }
    }, 700);
  }

  function handleNavigate(route: string) {
    onClose();
    router.push(route as any);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={localStyles.overlay}>
        <View style={localStyles.container}>
          {/* Header */}
          <View style={localStyles.header}>
            <View style={globalStyles.row}>
              <Icon name="mic" color={theme.green} size={24} />
              <Title small>Voice Assistant</Title>
            </View>
            <Touch onPress={onClose} label="Close">
              <Icon name="close-circle-outline" color={theme.muted} size={26} />
            </Touch>
          </View>

          {/* Language Selector */}
          <View style={{ marginBottom: 16 }}>
            <Body muted>Select language:</Body>
            <View style={[globalStyles.row, { flexWrap: "wrap", gap: 8, marginTop: 8 }]}>
              {SUPPORTED_VOICE_LANGUAGES.map((lang) => (
                <Chip
                  key={lang.code}
                  title={lang.nativeLabel}
                  selected={selectedLanguage === lang.code}
                  onPress={() => setSelectedLanguage(lang.code)}
                />
              ))}
            </View>
          </View>

          {/* Central Animated Visualizer */}
          <View style={localStyles.visualizerBox}>
            <Animated.View
              style={[
                localStyles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                  backgroundColor:
                    status === "listening"
                      ? "rgba(20, 125, 104, 0.2)"
                      : "transparent",
                },
              ]}
            >
              <Touch
                onPress={() =>
                  processPhrase(
                    transcript || "When is my next appointment?"
                  )
                }
                style={[
                  localStyles.micButton,
                  status === "listening" && { backgroundColor: theme.green },
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
                      : "mic"
                  }
                  color="white"
                  size={32}
                />
              </Touch>
            </Animated.View>

            <Text style={localStyles.statusText}>
              {status === "idle" && "Tap a test command below or speak"}
              {status === "listening" && "Listening... Speak your command"}
              {status === "processing" && "Understanding audio..."}
              {status === "speaking" && "Bloom is speaking..."}
              {status === "error" && errorMsg}
            </Text>
          </View>

          {/* Visible Transcript & Action Confirmation */}
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
                      <Icon name="shield-checkmark" color={theme.red} size={16} />
                      <Text style={localStyles.guardrailText}>
                        Clinical Guardrail: Diagnosis Refused
                      </Text>
                    </View>
                  )}

                  {resolution.targetRoute && (
                    <Button
                      title={`Open ${resolution.targetRoute.replace(/[\/()]/g, "")} →`}
                      onPress={() => handleNavigate(resolution.targetRoute!)}
                    />
                  )}
                </View>
              )}
            </Card>
          )}

          {/* Test Audio Commands (Slide 06 Requirement) */}
          <View style={{ marginTop: 12 }}>
            <Body muted>Try a test command (Test Audio Simulation):</Body>
            <View style={{ gap: 6, marginTop: 8 }}>
              {MOCK_TEST_PHRASES.slice(0, 4).map((p) => (
                <Touch
                  key={p}
                  style={localStyles.testPhraseButton}
                  onPress={() => processPhrase(p)}
                  label={p}
                >
                  <Icon name="play-circle-outline" size={18} color={theme.green} />
                  <Text style={localStyles.testPhraseText}>{p}</Text>
                </Touch>
              ))}
              <Touch
                style={[localStyles.testPhraseButton, { borderColor: theme.red }]}
                onPress={() =>
                  processPhrase("What medicine should I take for headache?")
                }
                label="Safety Guardrail Test"
              >
                <Icon name="alert-circle-outline" size={18} color={theme.red} />
                <Text style={[localStyles.testPhraseText, { color: theme.red }]}>
                  &ldquo;What medicine for headache?&rdquo; (Test Safety)
                </Text>
              </Touch>
            </View>
          </View>

          {/* Control Actions: Stop / Retry / Text Fallback */}
          <View style={[globalStyles.row, { gap: 10, marginTop: 18 }]}>
            {status !== "idle" && (
              <View style={{ flex: 1 }}>
                <Button title="Stop" secondary danger onPress={handleStop} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button title="Retry" secondary onPress={handleRetry} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Type Instead" secondary onPress={onClose} />
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
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  visualizerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  pulseRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
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
    marginTop: 10,
    fontSize: 14,
    fontWeight: "600",
    color: theme.ink,
  },
  transcriptCard: {
    backgroundColor: theme.mint,
    borderColor: "#CDEFE5",
    padding: 14,
    borderRadius: 16,
    marginVertical: 10,
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
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
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