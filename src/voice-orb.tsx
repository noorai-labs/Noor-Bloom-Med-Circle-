import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VoicePoweredOrb } from "../components/ui/voice-powered-orb";
import { Icon, Touch } from "./components";

export { VoicePoweredOrb };

export function VoiceOrb({
  size = 190,
  active = true,
}: {
  size?: number;
  active?: boolean;
}) {
  return <VoicePoweredOrb size={size} bg="#070C14" enableVoiceControl={active} />;
}

export function VoiceOrbButton({
  onPress,
  size = 52,
}: {
  onPress: () => void;
  size?: number;
}) {
  return (
    <VoicePoweredOrb
      size={size}
      enableVoiceControl={false}
      onPress={onPress}
    />
  );
}

export function VoiceOrbModal({
  visible,
  onClose,
  onCommand,
  language = "English",
}: {
  visible: boolean;
  onClose: () => void;
  onCommand: (text: string) => void;
  language?: string;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={orbStyles.backdrop}>
        <SafeAreaView edges={["bottom", "top"]} style={orbStyles.sheet}>
          {/* Subtle X close icon blending into the background, pinned to top-right */}
          <Pressable
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Close voice assistant"
            onPress={onClose}
            style={orbStyles.closeButton}
          >
            <Icon name="close" color="#94A3B8" size={24} />
          </Pressable>

          <View style={orbStyles.content}>
            <Text style={orbStyles.title}>Voice Assistant</Text>
            <Text style={orbStyles.subtitle}>
              Listening in {language} · Speak or tap a care request
            </Text>

            <View style={orbStyles.orbContainer}>
              <VoicePoweredOrb size={190} bg="#070C14" enableVoiceControl={true} />
            </View>

            <Text style={orbStyles.listeningText}>
              Listening for your care request…
            </Text>

            <View style={orbStyles.commandsList}>
              {[
                "When is my next appointment?",
                "Show my reports",
                "Remind me about my medicine",
                "Book a doctor",
              ].map((cmd) => (
                <Touch
                  key={cmd}
                  label={cmd}
                  onPress={() => {
                    onCommand(cmd);
                    onClose();
                  }}
                  style={orbStyles.commandChip}
                >
                  <Icon
                    name="chatbubble-ellipses-outline"
                    size={16}
                    color="#67E8F9"
                  />
                  <Text style={orbStyles.commandText}>{cmd}</Text>
                </Touch>
              ))}
            </View>

            <Touch
              label="Stop listening"
              onPress={onClose}
              style={orbStyles.stopButton}
            >
              <View style={orbStyles.stopIndicator}>
                <View style={orbStyles.stopSquare} />
              </View>
              <Text style={orbStyles.stopButtonText}>Stop listening</Text>
            </Touch>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const orbStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 10, 18, 0.88)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#070C14",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: "#1E293B",
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    right: 20,
    top: 20,
    width: 36,
    height: 36,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  content: {
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#F8FAFC",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
  },
  orbContainer: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  listeningText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#67E8F9",
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  commandsList: {
    width: "100%",
    maxWidth: 380,
    gap: 8,
    marginVertical: 4,
  },
  commandChip: {
    backgroundColor: "#0F1A28",
    borderWidth: 1,
    borderColor: "#1E2E42",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  commandText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "500",
    flexShrink: 1,
  },
  stopButton: {
    width: "100%",
    maxWidth: 380,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  stopIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(244, 63, 94, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  stopSquare: {
    width: 9,
    height: 9,
    borderRadius: 2,
    backgroundColor: "#F43F5E",
  },
  stopButtonText: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
