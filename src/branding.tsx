import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

export const brandLogoUrl =
  "https://bloom-med-api.bloom-med.workers.dev/branding/bloom-logo-v2.png";

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
      accessibilityLabel="MedBloom blossom and medical cross logo"
      style={{ width: size, height: size, borderRadius: size * 0.25 }}
    />
  );
}

export function StartupLoader({
  onIntroComplete,
}: {
  onIntroComplete?: () => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [layoutHeight, setLayoutHeight] = useState(windowHeight || 800);
  const insets = useSafeAreaInsets();

  const onIntroCompleteRef = useRef(onIntroComplete);
  useEffect(() => {
    onIntroCompleteRef.current = onIntroComplete;
  }, [onIntroComplete]);

  // Distinct, dedicated animation values for buttery smooth 60fps transitions
  const [startTileOpacity] = useState(() => new Animated.Value(1));
  const [flowerScaleAnim] = useState(() => new Animated.Value(0.55));
  const [flowerOpacityAnim] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [ogLogoOpacity] = useState(() => new Animated.Value(0));
  const [shineAnim] = useState(() => new Animated.Value(0));
  const [contentFadeAnim] = useState(() => new Animated.Value(1));
  const [glideAnim] = useState(() => new Animated.Value(0));
  const [bgFadeAnim] = useState(() => new Animated.Value(1));

  // Dynamic layout measurement
  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - layoutHeight) > 2) {
      setLayoutHeight(h);
    }
  };

  const screenHeight = layoutHeight || windowHeight || 800;
  const isSmallScreen = screenHeight < 680;
  const barHeight =
    insets.bottom > 0
      ? (isSmallScreen ? 58 : 62) + insets.bottom
      : isSmallScreen
        ? 64
        : 68;

  // Center "Bloom AI" bottom tab icon button measurement:
  const dockCenterY = screenHeight - (barHeight - 18);
  const initialTileCenterY = screenHeight * 0.376;
  const targetDockY = dockCenterY - initialTileCenterY;

  useEffect(() => {
    let isMounted = true;
    let timerBreathe: ReturnType<typeof setTimeout> | undefined;
    let timerShine: ReturnType<typeof setTimeout> | undefined;

    // Phase 1 -> Phase 2: Start smooth blossom after 500ms initial clean hold
    const startTimer = setTimeout(() => {
      if (!isMounted) return;

      // 1. Petals bloom smoothly outward from behind the starting logo tile (relaxed 1600ms)
      Animated.parallel([
        Animated.timing(flowerScaleAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(flowerOpacityAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(startTileOpacity, {
          toValue: 0,
          duration: 850,
          delay: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start(() => {
        if (!isMounted) return;

        // 2. Gentle single breath pulse during peak bloom (1300ms)
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.028,
            duration: 650,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 650,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: Platform.OS !== "web",
          }),
        ]).start(() => {
          if (!isMounted) return;

          // 3. Flower petals smoothly retract back into center & morph into Main OG Logo (1350ms)
          Animated.parallel([
            Animated.timing(flowerScaleAnim, {
              toValue: 0.55,
              duration: 1350,
              easing: Easing.bezier(0.4, 0, 0.2, 1),
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(flowerOpacityAnim, {
              toValue: 0,
              duration: 1150,
              delay: 180,
              easing: Easing.in(Easing.quad),
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(ogLogoOpacity, {
              toValue: 1,
              duration: 1150,
              delay: 100,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
              useNativeDriver: Platform.OS !== "web",
            }),
          ]).start(() => {
            if (!isMounted) return;

            // 4. Calm 350ms pause on the settled Main OG Logo
            timerShine = setTimeout(() => {
              if (!isMounted) return;

              // 5. Shiny specular reflection sweep across the Main OG Logo face (1050ms)
              Animated.timing(shineAnim, {
                toValue: 1,
                duration: 1050,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1),
                useNativeDriver: Platform.OS !== "web",
              }).start(() => {
                if (!isMounted) return;

                // 6. Seamless glide down to dock into the Bloom AI tab button (950ms)
                Animated.parallel([
                  Animated.timing(contentFadeAnim, {
                    toValue: 0,
                    duration: 400,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: Platform.OS !== "web",
                  }),
                  Animated.timing(bgFadeAnim, {
                    toValue: 0,
                    duration: 700,
                    delay: 60,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: Platform.OS !== "web",
                  }),
                  Animated.timing(glideAnim, {
                    toValue: 1,
                    duration: 950,
                    easing: Easing.bezier(0.22, 1, 0.36, 1),
                    useNativeDriver: Platform.OS !== "web",
                  }),
                ]).start(() => {
                  if (isMounted) {
                    onIntroCompleteRef.current?.();
                  }
                });
              });
            }, 180);
          });
        });
      });
    }, 450);

    return () => {
      isMounted = false;
      clearTimeout(startTimer);
      if (timerBreathe) clearTimeout(timerBreathe);
      if (timerShine) clearTimeout(timerShine);
    };
  }, [
    bgFadeAnim,
    contentFadeAnim,
    flowerOpacityAnim,
    flowerScaleAnim,
    glideAnim,
    ogLogoOpacity,
    pulseAnim,
    shineAnim,
    startTileOpacity,
  ]);

  // Interpolated glide values
  // Scale down from 144px (Main OG logo initial size) to 34px (exact bottom tab icon size)
  const tileScale = glideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 34 / 144],
  });

  const tileTranslateY = glideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetDockY],
  });

  // Shiny specular reflection sweep translation (-180 to +220)
  const shineTranslateX = shineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-180, 220],
  });

  const shineOpacity = shineAnim.interpolate({
    inputRange: [0, 0.12, 0.88, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <View
      onLayout={onLayout}
      pointerEvents="box-none"
      accessibilityLabel="Opening MedBloom"
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 99999,
        },
      ]}
    >
      {/* 1. Solid pure background that crossfades out to reveal Home screen during glide */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: "#F8FAFC",
            opacity: bgFadeAnim,
          },
        ]}
      />

      {/* 2. Central Logo & Petals Container (Glides down and docks directly into tab bar) */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: initialTileCenterY - 170,
          left: 0,
          right: 0,
          height: 340,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Animated.View
          style={{
            alignItems: "center",
            justifyContent: "center",
            transform: [
              { translateY: tileTranslateY },
              { scale: tileScale },
            ],
          }}
        >
          {/* Bloomed Golden Lotus (Unified seamless blossom - zero border overlap) */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: 340,
              height: 340,
              alignItems: "center",
              justifyContent: "center",
              opacity: flowerOpacityAnim,
              transform: [{ scale: flowerScaleAnim }],
            }}
          >
            <Animated.View
              style={{
                width: 340,
                height: 340,
                alignItems: "center",
                justifyContent: "center",
                transform: [{ scale: pulseAnim }],
              }}
            >
              <Image
                source={require("../assets/bloom_emblem_unified.png")}
                style={{ width: 340, height: 340 }}
                resizeMode="contain"
              />
            </Animated.View>
          </Animated.View>

          {/* Starting Logo Tile (Layer A: clean solid starting tile, fades out as flower blooms) */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: 170,
              height: 170,
              alignItems: "center",
              justifyContent: "center",
              opacity: startTileOpacity,
            }}
          >
            <Image
              source={require("../assets/intro_tile_icon.png")}
              style={{ width: 170, height: 170 }}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Main OG Logo Tile (Layer B: emerges as petals retract; receives shiny gradient & docks) */}
          <Animated.View
            pointerEvents="none"
            style={{
              width: 144,
              height: 144,
              borderRadius: 36,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#147D68",
              opacity: ogLogoOpacity,
            }}
          >
            <Image
              source={require("../assets/bloom-logo-v2.png")}
              style={{ width: 144, height: 144, borderRadius: 36 }}
              resizeMode="cover"
            />

            {/* Shiny Specular Gradient Reflection Sweep across Main OG Logo surface */}
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: shineOpacity,
                  transform: [
                    { translateX: shineTranslateX },
                    { rotate: "25deg" },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={[
                  "rgba(255, 255, 255, 0)",
                  "rgba(255, 255, 255, 0.25)",
                  "rgba(255, 255, 255, 0.85)",
                  "rgba(255, 255, 255, 0.25)",
                  "rgba(255, 255, 255, 0)",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  width: 75,
                  height: 260,
                  marginTop: -55,
                }}
              />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>

      {/* 3. Brand Title and Loading Progress (Fades out before docking glide starts) */}
      <Animated.View
        style={{
          position: "absolute",
          top: initialTileCenterY + 104,
          left: 0,
          right: 0,
          alignItems: "center",
          gap: 10,
          opacity: contentFadeAnim,
          transform: [
            {
              translateY: flowerScaleAnim.interpolate({
                inputRange: [0.55, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        }}
      >
        <Text
          style={{
            color: "#162C35",
            fontSize: 26,
            fontWeight: "800",
            letterSpacing: 3,
          }}
        >
          MED BLOOM
        </Text>
        <Text
          style={{
            color: "#64748B",
            fontSize: 14,
            fontWeight: "500",
            letterSpacing: 0.5,
          }}
        >
          Your care, connected
        </Text>

        <View style={{ marginTop: 24, alignItems: "center", gap: 10 }}>
          <ActivityIndicator size="small" color="#147D68" />
          <Text
            style={{
              color: "#64748B",
              fontSize: 12,
              fontWeight: "500",
              letterSpacing: 0.2,
            }}
          >
            Opening your care space…
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
