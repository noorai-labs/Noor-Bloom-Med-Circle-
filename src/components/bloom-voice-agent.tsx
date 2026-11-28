import React, { createContext, useContext, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

// Context to trigger the Bloom AI Voice Agent overlay from anywhere in the app
interface VoiceAgentContextType {
  isVoiceActive: boolean;
  openVoiceAgent: () => void;
  closeVoiceAgent: () => void;
  toggleVoiceAgent: () => void;
}

const VoiceAgentContext = createContext<VoiceAgentContextType>({
  isVoiceActive: false,
  openVoiceAgent: () => {},
  closeVoiceAgent: () => {},
  toggleVoiceAgent: () => {},
});

export const useVoiceAgent = () => useContext(VoiceAgentContext);

export function VoiceAgentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  return (
    <VoiceAgentContext.Provider
      value={{
        isVoiceActive,
        openVoiceAgent: () => setIsVoiceActive(true),
        closeVoiceAgent: () => setIsVoiceActive(false),
        toggleVoiceAgent: () => setIsVoiceActive((v) => !v),
      }}
    >
      {children}
      <BloomVoiceAgentOverlay
        visible={isVoiceActive}
        onClose={() => setIsVoiceActive(false)}
      />
    </VoiceAgentContext.Provider>
  );
}

// Main Bloom AI Voice Agent Overlay Component (matches video frames 25-36)
export function BloomVoiceAgentOverlay({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [borderScaleX] = useState(() => new Animated.Value(1));
  const [borderScaleY] = useState(() => new Animated.Value(1));
  const [borderGlow] = useState(() => new Animated.Value(0.85));
  const [waveScaleX] = useState(() => new Animated.Value(1));
  const [waveCycle] = useState(() => new Animated.Value(0));
  const [floatAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) {
      fadeAnim.setValue(0);
      return;
    }

    // Fade in overlay smoothly
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: Platform.OS !== "web",
    }).start();

    // Border acoustic breathing: scaleX undulation
    const borderXLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(borderScaleX, {
          toValue: 1.01,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(borderScaleX, {
          toValue: 0.99,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );

    // Border acoustic breathing: scaleY undulation
    const borderYLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(borderScaleY, {
          toValue: 1.005,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(borderScaleY, {
          toValue: 0.995,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );

    // Border luminous glow breathing
    const borderGlowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(borderGlow, {
          toValue: 1.0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(borderGlow, {
          toValue: 0.82,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );

    // Wave horizontal breathing
    const waveScaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(waveScaleX, {
          toValue: 1.025,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(waveScaleX, {
          toValue: 0.975,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );

    // Continuous undulating fluid wave cycle (loops 0 -> 1 -> 2 -> 3)
    const waveLoop = Animated.loop(
      Animated.timing(waveCycle, {
        toValue: 3,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );

    // Subtle vertical floating motion of the wave and orb
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -4,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(floatAnim, {
          toValue: 4,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );

    borderXLoop.start();
    borderYLoop.start();
    borderGlowLoop.start();
    waveScaleLoop.start();
    waveLoop.start();
    floatLoop.start();

    return () => {
      borderXLoop.stop();
      borderYLoop.stop();
      borderGlowLoop.stop();
      waveScaleLoop.stop();
      waveLoop.stop();
      floatLoop.stop();
    };
  }, [
    borderGlow,
    borderScaleX,
    borderScaleY,
    fadeAnim,
    floatAnim,
    visible,
    waveCycle,
    waveScaleX,
  ]);

  if (!visible) return null;

  // Wave crossfade interpolations between phase 1, 2, 3
  const wave1Opacity = waveCycle.interpolate({
    inputRange: [0, 0.7, 1.4, 2.1, 2.8, 3],
    outputRange: [1, 0.2, 0, 0, 0.6, 1],
  });

  const wave2Opacity = waveCycle.interpolate({
    inputRange: [0, 0.7, 1.4, 2.1, 2.8, 3],
    outputRange: [0, 0.8, 1, 0.3, 0, 0],
  });

  const wave3Opacity = waveCycle.interpolate({
    inputRange: [0, 0.7, 1.4, 2.1, 2.8, 3],
    outputRange: [0, 0, 0.2, 1, 0.5, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        {/* Soft darkened backdrop overlay */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "rgba(8, 14, 22, 0.52)",
              opacity: fadeAnim,
            },
          ]}
        />

        {/* 1. Undulating Luminous Gold Perimeter Border (Matches video frames 25-36) */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.goldBorder,
            {
              top: insets.top > 0 ? insets.top + 8 : 16,
              bottom: insets.bottom > 0 ? insets.bottom + 8 : 16,
              opacity: Animated.multiply(fadeAnim, borderGlow),
              transform: [
                { scaleX: borderScaleX },
                { scaleY: borderScaleY },
              ],
            },
          ]}
        />

        {/* 2. Undulating Sound Wings & Bloom AI Voice Orb (Unified graphic from reference video) */}
        <Animated.View
          style={[
            styles.voiceWidgetContainer,
            {
              bottom: insets.bottom > 0 ? insets.bottom + 48 : 64,
              opacity: fadeAnim,
              transform: [
                { translateY: floatAnim },
                { scaleX: waveScaleX },
              ],
            },
          ]}
        >
          {/* Wave Phase 1 */}
          <Animated.Image
            source={require("../../assets/bloom_wave_phase_1.png")}
            style={[styles.waveImage, { opacity: wave1Opacity }]}
            resizeMode="contain"
          />
          {/* Wave Phase 2 */}
          <Animated.Image
            source={require("../../assets/bloom_wave_phase_2.png")}
            style={[styles.waveImage, { opacity: wave2Opacity }]}
            resizeMode="contain"
          />
          {/* Wave Phase 3 */}
          <Animated.Image
            source={require("../../assets/bloom_wave_phase_3.png")}
            style={[styles.waveImage, { opacity: wave3Opacity }]}
            resizeMode="contain"
          />

          {/* Center Orb Touch Target */}
          <Pressable
            onPress={() => {
              onClose();
              router.push("/assistant");
            }}
            accessibilityRole="button"
            accessibilityLabel="Open Bloom assistant"
            style={styles.emblemTouch}
          />
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  goldBorder: {
    position: "absolute",
    left: 12,
    right: 12,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: "rgba(246, 200, 96, 0.95)",
    shadowColor: "#F5BE50",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.92,
    shadowRadius: 20,
    elevation: 12,
  },
  voiceWidgetContainer: {
    position: "absolute",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    height: 160,
  },
  waveImage: {
    position: "absolute",
    width: "100%",
    height: 160,
  },
  emblemTouch: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    zIndex: 20,
  },
});
