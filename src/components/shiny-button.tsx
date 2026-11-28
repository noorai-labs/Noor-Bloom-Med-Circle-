import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

export interface ShinyButtonProps {
  label?: string;
  onPress?: () => void;
  fillColor?: string;
  labelColor?: string;
  accentColor?: string;
  accentSoftColor?: string;
  sweepDuration?: number;
  cornerRadius?: number;
  compact?: boolean;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const AnimatedView = Animated.createAnimatedComponent(View);

export function ShinyButton({
  label = "Get Started",
  onPress,
  fillColor = "#DC2626",
  labelColor = "#FFFFFF",
  accentColor = "#FF5F00",
  accentSoftColor = "#FF9253",
  sweepDuration = 2800,
  cornerRadius = 20,
  compact = false,
  icon,
  accessibilityLabel,
  style,
}: ShinyButtonProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const sweep = useSharedValue(0);
  const sheen = useSharedValue(0);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReducedMotion(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReducedMotion(enabled),
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      sweep.value = 0;
      sheen.value = 0;
      return;
    }
    sweep.value = withRepeat(
      withTiming(1, {
        duration: sweepDuration,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    sheen.value = withRepeat(
      withTiming(1, {
        duration: Math.round(sweepDuration * 1.15),
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false,
    );
  }, [reducedMotion, sweep, sheen, sweepDuration]);

  const borderRotationStyle = useAnimatedStyle(() => {
    const deg = interpolate(sweep.value, [0, 1], [0, 360]);
    return {
      transform: [{ rotate: `${deg}deg` }],
    };
  });

  const sheenTranslateStyle = useAnimatedStyle(() => {
    const translateX = interpolate(sheen.value, [0, 1], [-90, 110]);
    return {
      transform: [{ translateX }, { skewX: "-22deg" }],
    };
  });

  const activeGlow = hovered || pressed;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      {...(Platform.OS === "web"
        ? {
            onHoverIn: () => setHovered(true),
            onHoverOut: () => setHovered(false),
          }
        : {})}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      style={[
        {
          alignSelf: "flex-start",
          borderRadius: cornerRadius,
          shadowColor: activeGlow ? accentColor : fillColor,
          shadowOffset: { width: 0, height: activeGlow ? 4 : 2 },
          shadowOpacity: activeGlow ? 0.5 : 0.28,
          shadowRadius: activeGlow ? 8 : 4,
          elevation: activeGlow ? 6 : 3,
          transform: [{ scale: pressed ? 0.96 : hovered ? 1.03 : 1 }],
        },
        style,
      ]}
    >
      {/* Dedicated clipping container (separated from Android elevation) */}
      <View
        style={{
          borderRadius: cornerRadius,
          padding: 1.5,
          overflow: "hidden",
          position: "relative",
          backgroundColor: fillColor,
        }}
      >
        {/* Rotating shiny gradient border inset strictly via absolute offsets */}
        <AnimatedView
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: -40,
              left: -40,
              right: -40,
              bottom: -40,
            },
            borderRotationStyle,
          ]}
        >
          <LinearGradient
            colors={
              activeGlow
                ? [accentColor, accentSoftColor, "#FFFFFF", accentColor]
                : [
                    "rgba(255,255,255,0.18)",
                    accentSoftColor,
                    "#FFFFFF",
                    "rgba(255,255,255,0.18)",
                  ]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </AnimatedView>

        {/* Inner button pill */}
        <View
          style={{
            backgroundColor: fillColor,
            borderRadius: Math.max(0, cornerRadius - 1.5),
            paddingHorizontal: compact ? 11 : 24,
            paddingVertical: compact ? 5.5 : 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: compact ? 5 : 8,
            overflow: "hidden",
          }}
        >
          {activeGlow && (
            <LinearGradient
              pointerEvents="none"
              colors={[accentColor, fillColor, accentSoftColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
            />
          )}

          {!reducedMotion && (
            <AnimatedView
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  top: -6,
                  bottom: -6,
                  width: 30,
                },
                sheenTranslateStyle,
              ]}
            >
              <LinearGradient
                colors={[
                  "rgba(255,255,255,0)",
                  "rgba(255,255,255,0.34)",
                  "rgba(255,255,255,0)",
                ]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </AnimatedView>
          )}

          {icon}
          <Text
            style={{
              color: labelColor,
              fontWeight: "800",
              fontSize: compact ? 12 : 16,
              letterSpacing: compact ? 0.6 : 0.3,
            }}
          >
            {label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default ShinyButton;
