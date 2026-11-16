import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Text,
  View,
} from "react-native";

export function BloomLogo({ size = 44 }: { size?: number }) {
  return (
    <Image
      source={require("../assets/bloom-logo-v2.png")}
      accessibilityLabel="BLOOM MED blossom and medical cross logo"
      style={{ width: size, height: size, borderRadius: size * 0.25 }}
    />
  );
}

export function StartupLoader() {
  const [progress] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    let pulseAnim: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          progress.setValue(1);
          pulse.setValue(1);
          return;
        }
        animation = Animated.spring(progress, {
          toValue: 1,
          damping: 18,
          stiffness: 110,
          mass: 0.8,
          useNativeDriver: Platform.OS !== "web",
        });
        animation.start(() => {
          if (cancelled) return;
          pulseAnim = Animated.loop(
            Animated.sequence([
              Animated.timing(pulse, {
                toValue: 1.03,
                duration: 1000,
                useNativeDriver: Platform.OS !== "web",
              }),
              Animated.timing(pulse, {
                toValue: 0.97,
                duration: 1000,
                useNativeDriver: Platform.OS !== "web",
              }),
            ]),
          );
          pulseAnim.start();
        });
      })
      .catch(() => {
        progress.setValue(1);
        pulse.setValue(1);
      });
    return () => {
      cancelled = true;
      animation?.stop();
      pulseAnim?.stop();
    };
  }, [progress, pulse]);
  return (
    <View
      accessibilityLabel="Opening BLOOM MED"
      style={{
        flex: 1,
        backgroundColor: "#F6F8FA",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <Animated.View
        style={{
          opacity: progress,
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.86, 1],
              }),
            },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        }}
      >
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <BloomLogo size={116} />
        </Animated.View>
      </Animated.View>
      <Text
        style={{
          color: "#162C35",
          fontSize: 26,
          fontWeight: "800",
          letterSpacing: 3,
        }}
      >
        BLOOM MED
      </Text>
      <Text style={{ color: "#657882", fontSize: 14 }}>
        Your care, connected
      </Text>
      <ActivityIndicator color="#147D68" style={{ marginTop: 32 }} />
      <Text style={{ color: "#657882", fontSize: 12 }}>
        Opening your care space…
      </Text>
    </View>
  );
}
