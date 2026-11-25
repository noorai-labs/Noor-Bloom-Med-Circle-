import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useClinic } from "../store";
import { formatDate, visibleVisits } from "../clinic";
import { providerFor } from "../provider-display";
import { Icon, Touch, theme } from "../components";

// Iridescent perimeter gradient colors inspired by Google Gemini on Android
const GEMINI_IRIDESCENT_COLORS = [
  "#00F2FE", // Electric Cyan
  "#4FACFE", // Radiant Blue
  "#8B5CF6", // Violet
  "#EC4899", // Magenta Pink
  "#F59E0B", // Amber Gold
  "#10B981", // Emerald Mint
  "#147D68", // MedBloom Teal
  "#00F2FE", // Seamless Loop
] as const;

// Animated Fluid Waveform Ribbon Component
function FluidWaveformRibbon({
  active = true,
  thinking = false,
}: {
  active?: boolean;
  thinking?: boolean;
}) {
  const barCount = 28;
  const [animValues] = useState(() =>
    Array.from({ length: barCount }, () => new Animated.Value(0.3)),
  );

  useEffect(() => {
    let isMounted = true;
    const loops: Animated.CompositeAnimation[] = [];

    animValues.forEach((val, i) => {
      const phase = (i / barCount) * Math.PI * 2;
      const duration = thinking ? 350 + (i % 5) * 60 : 700 + (i % 6) * 120;
      const minH = thinking ? 0.25 : active ? 0.35 : 0.15;
      const maxH = thinking ? 0.95 : active ? 0.85 : 0.45;

      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: maxH,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(val, {
            toValue: minH,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ]),
      );
      loops.push(anim);
      // Stagger start based on spatial phase
      setTimeout(() => {
        if (isMounted) anim.start();
      }, (phase / (Math.PI * 2)) * 300);
    });

    return () => {
      isMounted = false;
      loops.forEach((l) => l.stop());
    };
  }, [active, animValues, thinking]);

  return (
    <View style={styles.waveRibbonContainer}>
      {/* Background Soft Glow Ribbon */}
      <LinearGradient
        colors={[
          "rgba(0, 242, 254, 0.18)",
          "rgba(139, 92, 246, 0.22)",
          "rgba(16, 185, 129, 0.2)",
          "rgba(245, 158, 11, 0.18)",
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.waveRibbonGlow}
      />

      {/* Undulating Vertical Harmonic Bars */}
      <View style={styles.waveBarsRow}>
        {animValues.map((val, index) => {
          // Color progression across the spectrum
          const colors = [
            "#00F2FE",
            "#38BDF8",
            "#60A5FA",
            "#818CF8",
            "#A78BFA",
            "#C084FC",
            "#E879F9",
            "#F472B6",
            "#FB7185",
            "#F59E0B",
            "#34D399",
            "#10B981",
            "#147D68",
            "#00F2FE",
          ];
          const color = colors[index % colors.length];

          const barHeight = val.interpolate({
            inputRange: [0, 1],
            outputRange: [6, 48],
          });

          return (
            <Animated.View
              key={index}
              style={[
                styles.waveBar,
                {
                  height: barHeight,
                  backgroundColor: color,
                  opacity: val.interpolate({
                    inputRange: [0.1, 0.9],
                    outputRange: [0.55, 1],
                  }),
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

// Iridescent Glowing Border Sweep Component
function IridescentEdgeSweep() {
  const [sweepAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweepAnim]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Top glowing edge */}
      <LinearGradient
        colors={GEMINI_IRIDESCENT_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.edgeTop}
      />

      {/* Bottom glowing edge */}
      <LinearGradient
        colors={GEMINI_IRIDESCENT_COLORS}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 0 }}
        style={styles.edgeBottom}
      />

      {/* Left glowing edge */}
      <LinearGradient
        colors={GEMINI_IRIDESCENT_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.edgeLeft}
      />

      {/* Right glowing edge */}
      <LinearGradient
        colors={GEMINI_IRIDESCENT_COLORS}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={styles.edgeRight}
      />

      {/* Corner Ambient Radial Auras */}
      <LinearGradient
        colors={["rgba(0, 242, 254, 0.35)", "transparent"]}
        style={styles.ambientTopLeft}
      />
      <LinearGradient
        colors={["rgba(139, 92, 246, 0.35)", "transparent"]}
        style={styles.ambientTopRight}
      />
      <LinearGradient
        colors={["rgba(16, 185, 129, 0.35)", "transparent"]}
        style={styles.ambientBottomLeft}
      />
      <LinearGradient
        colors={["rgba(245, 158, 11, 0.35)", "transparent"]}
        style={styles.ambientBottomRight}
      />
    </View>
  );
}

export interface GeminiVoiceOverlayProps {
  visible: boolean;
  onClose: () => void;
  onNavigate?: (route: string) => void;
}

export function GeminiVoiceOverlay({
  visible,
  onClose,
  onNavigate,
}: GeminiVoiceOverlayProps) {
  const { state } = useClinic();
  const [inputText, setInputText] = useState("");
  const [status, setStatus] = useState<"listening" | "thinking" | "speaking">(
    "listening",
  );
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [response, setResponse] = useState<string>(
    "Hi, I’m Bloom! How can I support your care journey today?",
  );
  const [isVoiceActive, setIsVoiceActive] = useState(true);

  // Core pulsing animation for Bloom AI emblem
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [haloAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.14,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.96,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const haloLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(haloAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    pulseLoop.start();
    haloLoop.start();

    return () => {
      pulseLoop.stop();
      haloLoop.stop();
    };
  }, [haloAnim, pulseAnim, visible]);

  function handleCommand(cmd: string) {
    if (!cmd.trim()) return;
    setLastQuery(cmd);
    setStatus("thinking");

    const t = cmd.toLowerCase();
    const visits = visibleVisits(state);
    const next = visits.find(
      (v) => !["Completed", "Cancelled"].includes(v.status),
    );

    setTimeout(() => {
      let reply =
        "I'm here to help you navigate your appointments, medicines, and medical records safely.";

      if (t.includes("appointment") || t.includes("visit") || t.includes("next")) {
        reply = next
          ? `Your next appointment is with Dr. ${providerFor(next).name} on ${formatDate(next.date)} at ${next.time}. It is currently ${next.status.toLowerCase()}.`
          : "You have no upcoming consultations scheduled. You can book an appointment anytime from Find Care.";
      } else if (t.includes("medicine") || t.includes("remind") || t.includes("dose")) {
        const activeMeds = state.medicines.filter((m) => m.active);
        reply =
          activeMeds.length > 0
            ? `You have ${activeMeds.length} active prescription${activeMeds.length > 1 ? "s" : ""}: ${activeMeds.map((m) => m.name).join(", ")}. Follow your clinician's exact timing.`
            : "No active medicine reminders found. You can set up medication schedules directly in the Medicines tab.";
      } else if (t.includes("record") || t.includes("report") || t.includes("document")) {
        reply = `Your health folder currently holds ${state.records.length} document${state.records.length === 1 ? "" : "s"} and ${state.consultations.length} care summaries. Open Records to inspect them.`;
      } else if (t.includes("doctor") || t.includes("nurse") || t.includes("book")) {
        reply =
          "You can find verified doctors and home nurses under Find Care, view their credentials, and book visits directly.";
      } else if (t.includes("sos") || t.includes("emergency")) {
        reply =
          "If you are having a medical emergency, please call your local emergency services (911/112) or tap the red SOS button at the top of your Home screen immediately.";
      }

      setResponse(reply);
      setStatus("speaking");
      setInputText("");

      setTimeout(() => {
        setStatus("listening");
      }, 2500);
    }, 600);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Iridescent Edge Perimeter Glow (Google Gemini android visual signature) */}
        <IridescentEdgeSweep />

        <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardContainer}
          >
            {/* Header: Title, Live Status Badge, and Close Button */}
            <View style={styles.headerRow}>
              <View style={styles.titleGroup}>
                <View style={styles.sparkleBadge}>
                  <Icon name="sparkles" size={16} color="#00F2FE" />
                </View>
                <View>
                  <Text style={styles.geminiTitle}>Bloom AI</Text>
                  <View style={styles.statusIndicator}>
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            status === "thinking"
                              ? "#F59E0B"
                              : status === "speaking"
                                ? "#10B981"
                                : "#00F2FE",
                        },
                      ]}
                    />
                    <Text style={styles.statusText}>
                      {status === "thinking"
                        ? "Thinking…"
                        : status === "speaking"
                          ? "Speaking"
                          : "Listening to you"}
                    </Text>
                  </View>
                </View>
              </View>

              <Pressable
                onPress={onClose}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel="Close Bloom AI"
                style={styles.closeButton}
              >
                <Icon name="close" size={22} color="#94A3B8" />
              </Pressable>
            </View>

            {/* Conversation / Query Response Area */}
            <ScrollView
              style={styles.chatScroll}
              contentContainerStyle={styles.chatScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {lastQuery && (
                <View style={styles.userBubble}>
                  <Text style={styles.userBubbleText}>{lastQuery}</Text>
                </View>
              )}

              <View style={styles.bloomBubble}>
                <View style={styles.bloomBubbleHeader}>
                  <Icon name="sparkles" size={14} color="#10B981" />
                  <Text style={styles.bloomBubbleSender}>Bloom Care Companion</Text>
                </View>
                <Text style={styles.bloomBubbleText}>{response}</Text>
              </View>

              {status === "thinking" && (
                <View style={styles.thinkingBox}>
                  <ActivityIndicator size="small" color="#00F2FE" />
                  <Text style={styles.thinkingText}>
                    Bloom is retrieving your health space…
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Quick Action Suggestion Chips */}
            <View style={styles.chipsContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScroll}
              >
                {[
                  { label: "Next appointment 📅", query: "When is my next appointment?" },
                  { label: "Today's medicines 💊", query: "Check my medicine routine" },
                  { label: "Health records 📋", query: "Show my health records" },
                  { label: "Find a doctor 🩺", query: "Find a doctor" },
                ].map((chip) => (
                  <Touch
                    key={chip.label}
                    label={chip.label}
                    onPress={() => handleCommand(chip.query)}
                    style={styles.chipButton}
                  >
                    <Text style={styles.chipText}>{chip.label}</Text>
                  </Touch>
                ))}
              </ScrollView>
            </View>

            {/* Fluid Undulating Waveform Ribbon Area */}
            <View style={styles.waveformSection}>
              <FluidWaveformRibbon
                active={isVoiceActive}
                thinking={status === "thinking"}
              />

              {/* Pulsing Central Bloom AI Core Emblem */}
              <View style={styles.orbCenterWrapper}>
                {/* Expanding Halo Ring */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.haloRing,
                    {
                      transform: [
                        {
                          scale: haloAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2.1],
                          }),
                        },
                      ],
                      opacity: haloAnim.interpolate({
                        inputRange: [0, 0.7, 1],
                        outputRange: [0.75, 0.25, 0],
                      }),
                    },
                  ]}
                />

                {/* Core Circular Orb with Pulse */}
                <Animated.View
                  style={[
                    styles.coreOrb,
                    {
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      setIsVoiceActive((v) => !v);
                      if (!isVoiceActive) {
                        setStatus("listening");
                      }
                    }}
                    style={styles.coreOrbPressable}
                  >
                    <LinearGradient
                      colors={["#00F2FE", "#147D68", "#10B981"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.coreOrbGradient}
                    >
                      <Icon
                        name={isVoiceActive ? "mic" : "mic-off"}
                        size={28}
                        color="white"
                      />
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              </View>
            </View>

            {/* Bottom Input Field for Text Input */}
            <View style={styles.inputContainer}>
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ask Bloom anything about your care…"
                placeholderTextColor="#64748B"
                returnKeyType="send"
                onSubmitEditing={() => handleCommand(inputText)}
                style={styles.inputField}
              />
              <Pressable
                onPress={() => handleCommand(inputText)}
                disabled={!inputText.trim()}
                style={[
                  styles.sendButton,
                  { opacity: inputText.trim() ? 1 : 0.4 },
                ]}
              >
                <Icon name="arrow-up" size={18} color="white" />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 11, 20, 0.94)",
    justifyContent: "space-between",
  },
  safeArea: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    justifyContent: "space-between",
  },
  // Iridescent Edge Perimeter Glow Styles
  edgeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    shadowColor: "#00F2FE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  edgeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  edgeLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  edgeRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: 4,
    shadowColor: "#F59E0B",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  ambientTopLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 140,
    height: 140,
    borderBottomRightRadius: 140,
  },
  ambientTopRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 140,
    height: 140,
    borderBottomLeftRadius: 140,
  },
  ambientBottomLeft: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 140,
    height: 140,
    borderTopRightRadius: 140,
  },
  ambientBottomRight: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 140,
    height: 140,
    borderTopLeftRadius: 140,
  },
  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sparkleBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 242, 254, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(0, 242, 254, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  geminiTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "500",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Conversation
  chatScroll: {
    flex: 1,
    marginVertical: 14,
  },
  chatScrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(20, 125, 104, 0.8)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    maxWidth: "85%",
  },
  userBubbleText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  bloomBubble: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    maxWidth: "92%",
  },
  bloomBubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  bloomBubbleSender: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  bloomBubbleText: {
    color: "#E2E8F0",
    fontSize: 14,
    lineHeight: 22,
  },
  thinkingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "rgba(0, 242, 254, 0.1)",
    borderRadius: 14,
    alignSelf: "flex-start",
  },
  thinkingText: {
    color: "#00F2FE",
    fontSize: 12,
    fontWeight: "600",
  },
  // Chips
  chipsContainer: {
    marginBottom: 12,
  },
  chipsScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  chipButton: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  chipText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "500",
  },
  // Waveform Ribbon Section
  waveformSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    minHeight: 120,
  },
  waveRibbonContainer: {
    width: "100%",
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  waveRibbonGlow: {
    position: "absolute",
    width: "100%",
    height: 40,
    borderRadius: 20,
    opacity: 0.8,
  },
  waveBarsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: "100%",
    paddingHorizontal: 10,
  },
  waveBar: {
    width: 3.5,
    borderRadius: 3,
  },
  orbCenterWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  haloRing: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "#00F2FE",
  },
  coreOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    shadowColor: "#00F2FE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 8,
  },
  coreOrbPressable: {
    flex: 1,
    borderRadius: 32,
    overflow: "hidden",
  },
  coreOrbGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Text input row
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
    gap: 8,
  },
  inputField: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 14,
    paddingVertical: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.green,
    alignItems: "center",
    justifyContent: "center",
  },
});
