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

export const brandLogoUrl =
  "https://pub-b3a4fce9843242c59ef266bfd5409265.r2.dev/bloom-med/branding/bloom-logo-v2.png";
export function BloomLogo({ size = 44 }: { size?: number }) {
  const [remoteFailed, setRemoteFailed] = useState(false);
  return (
    <Image
      source={
        remoteFailed
          ? require("../assets/bloom-logo-v2.png")
          : { uri: brandLogoUrl }
      }
      defaultSource={require("../assets/bloom-logo-v2.png")}
      onError={() => setRemoteFailed(true)}
      accessibilityLabel="BLOOM MED blossom and medical cross logo"
      style={{ width: size, height: size, borderRadius: size * 0.25 }}
    />
  );
}

export function StartupLoader() {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          progress.setValue(1);
          return;
        }
        animation = Animated.spring(progress, {
          toValue: 1,
          damping: 18,
          stiffness: 110,
          mass: 0.8,
          useNativeDriver: Platform.OS !== "web",
        });
        animation.start();
      })
      .catch(() => progress.setValue(1));
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [progress]);
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
        <BloomLogo size={116} />
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
