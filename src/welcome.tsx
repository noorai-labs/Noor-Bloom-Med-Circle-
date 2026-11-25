import React, { useEffect, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthLayout } from "./auth-layout";
import { BloomLogo } from "./branding";
import {
  Body,
  Button,
  Entrance,
  Icon,
  Touch,
  theme,
  useReducedMotion,
  type IconName,
} from "./components";
import { useClinic } from "./store";

const key = "bloom-welcome-complete-v1";
const pages: {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
  points: string[];
  image: number;
}[] = [
  {
    eyebrow: "CARE, CLOSER TO HOME",
    title: "A little support.\nA lot more peace of mind.",
    description:
      "Request doctor and nurse visits, follow appointments, and keep your care plan together.",
    icon: "calendar-outline",
    points: ["Home visit requests", "Care updates in one place"],
    image: require("../assets/welcome-home-visits.png"),
  },
  {
    eyebrow: "YOUR EVERYDAY HEALTH",
    title: "Keep the small things\nin good hands.",
    description:
      "Track your medicines and daily doses. Keep reports and prescriptions ready for your next visit.",
    icon: "medical-outline",
    points: ["Medicine and dose tracking", "Reports when you need them"],
    image: require("../assets/welcome-daily-health-v2.png"),
  },
  {
    eyebrow: "CONNECTED, WITH YOUR CONSENT",
    title: "Your care circle.\nYour choice.",
    description:
      "Let an assigned care team support you, and choose whether family can access your care space.",
    icon: "people-outline",
    points: ["Private health documents", "You control family sharing"],
    image: require("../assets/welcome-family-circle.png"),
  },
];

export function GentleMotion({ children }: { children: React.ReactNode }) {
  const [value] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      value.setValue(0);
      return;
    }
    const motion = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    motion.start();
    return () => motion.stop();
  }, [reduced, value]);
  return (
    <Animated.View
      style={{
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -5],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function WelcomeGate({ children }: { children: React.ReactNode }) {
  const { state } = useClinic();
  const [seen, setSeen] = useState<boolean | null>(null);
  const [page, setPage] = useState(0);
  const { height } = useWindowDimensions();
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key)
      .then((value) => {
        if (active) setSeen(value === "yes");
      })
      .catch(() => {
        if (active) setSeen(false);
      });
    return () => {
      active = false;
    };
  }, []);
  function finish() {
    setSeen(true);
    void AsyncStorage.setItem(key, "yes").catch(() => {});
  }
  if (state.session || seen) return <>{children}</>;
  if (seen === null) return null;
  const content = pages[page];
  const compact = height < 700;
  return (
    <AuthLayout>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <BloomLogo size={38} />
          <Text
            style={{ color: theme.ink, fontWeight: "800", letterSpacing: 1 }}
          >
            MED BLOOM
          </Text>
        </View>
        <Touch
          label="Skip introduction"
          onPress={finish}
          style={{ padding: 12 }}
        >
          <Text style={{ color: theme.muted, fontWeight: "600" }}>Skip</Text>
        </Touch>
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Entrance key={page}>
          <View
            style={{
              borderRadius: 30,
              overflow: "hidden",
              backgroundColor: theme.mint,
            }}
          >
            <Image
              source={content.image}
              style={{
                width: "100%",
                height: Math.min(260, Math.max(110, height * 0.27)),
              }}
              resizeMode="cover"
            />
            <View
              style={{ position: "absolute", bottom: 14, left: 14, right: 14 }}
            >
              <GentleMotion>
                <View
                  style={{
                    backgroundColor: "#FFFFFFF2",
                    borderRadius: 18,
                    padding: 12,
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Icon name={content.icon} />
                  <Text
                    style={{
                      color: theme.green,
                      fontWeight: "700",
                      flexShrink: 1,
                    }}
                  >
                    {content.points[0]}
                  </Text>
                  <Icon name="checkmark-circle" size={18} />
                </View>
              </GentleMotion>
            </View>
          </View>
          <View style={{ gap: compact ? 8 : 12 }}>
            <Text
              style={{
                color: theme.green,
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 1.8,
              }}
            >
              {content.eyebrow}
            </Text>
            <Text
              accessibilityRole="header"
              style={{
                color: theme.ink,
                fontSize: compact ? 25 : 31,
                lineHeight: compact ? 31 : 38,
                fontWeight: "800",
                letterSpacing: -0.7,
              }}
            >
              {content.title}
            </Text>
            <Body muted>{content.description}</Body>
            {!compact && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Icon name="checkmark-circle-outline" size={17} />
                <Text style={{ color: theme.muted, fontSize: 13 }}>
                  {content.points[1]}
                </Text>
              </View>
            )}
          </View>
        </Entrance>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 4,
        }}
      >
        <View
          accessibilityLabel={`Introduction page ${page + 1} of 3`}
          style={{ flexDirection: "row", gap: 7 }}
        >
          {pages.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === page ? 25 : 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: i === page ? theme.green : "#CCDCD6",
              }}
            />
          ))}
        </View>
        <Text style={{ color: theme.muted, fontSize: 12 }}>
          0{page + 1} / 03
        </Text>
      </View>
      <Button
        title={page === 2 ? "Get started" : "Next"}
        icon="arrow-forward"
        onPress={() => (page === 2 ? finish() : setPage(page + 1))}
      />
      {page > 0 && (
        <Touch
          label="Previous introduction page"
          onPress={() => setPage(page - 1)}
          style={{ alignItems: "center", padding: 8 }}
        >
          <Text style={{ color: theme.muted }}>Back</Text>
        </Touch>
      )}
      <Text style={{ textAlign: "center", color: theme.muted, fontSize: 11 }}>
        Your care, connected.
      </Text>
    </AuthLayout>
  );
}
