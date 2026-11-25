import React from "react";
import { Image, useWindowDimensions, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useClinic } from "../../store";
import { cloudMode } from "../../cloud-config";
import { useLoginAudience } from "../../login-audience";
import { Icon, theme } from "../../components";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  VoiceAgentProvider,
  useVoiceAgent,
} from "../../components/bloom-voice-agent";

export default function TabLayout() {
  const { state, ready, cloud } = useClinic();
  const { audience, ready: audienceReady } = useLoginAudience();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (!ready || (cloudMode && !audienceReady)) return null;
  if (!state.session) return <Redirect href="/sign-in" />;
  if (
    cloudMode &&
    audience === "Doctor" &&
    state.session.role !== "Doctor" &&
    !cloud?.doctorApproved
  )
    return <Redirect href="/doctor-entry" />;

  return (
    <VoiceAgentProvider>
      <TabNavigator
        role={state.session.role}
        height={height}
        bottomInset={insets.bottom}
      />
    </VoiceAgentProvider>
  );
}

function TabNavigator({
  role,
  height,
  bottomInset,
}: {
  role: string;
  height: number;
  bottomInset: number;
}) {
  const { toggleVoiceAgent } = useVoiceAgent();
  const isSmallScreen = height < 680;
  const bottomPadding = bottomInset > 0 ? bottomInset : isSmallScreen ? 8 : 10;
  const barHeight =
    bottomInset > 0
      ? (isSmallScreen ? 60 : 64) + bottomInset
      : isSmallScreen
        ? 68
        : 72;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.green,
        tabBarInactiveTintColor: theme.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          backgroundColor: "white",
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: barHeight,
          paddingTop: 4,
          paddingBottom: bottomPadding,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
          elevation: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 1,
          marginBottom: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          justifyContent: "center",
          alignItems: "center",
          maxWidth: 160,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Icon name="grid-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: ["Doctor", "Nurse"].includes(role) ? "Visits" : "Care",
          tabBarIcon: ({ color }) => (
            <Icon name="calendar-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            toggleVoiceAgent();
          },
        }}
        options={{
          title: "Bloom AI",
          tabBarIcon: () => (
            <View
              style={{
                width: 52,
                height: 28,
                alignItems: "center",
                justifyContent: "flex-end",
                overflow: "visible",
              }}
            >
              {/* Top-only clipped container so bottom shadow never bleeds behind "Bloom AI" */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -42,
                  width: 96,
                  height: 44,
                  overflow: "hidden",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    marginTop: 8,
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    backgroundColor: "white",
                    borderWidth: 1.5,
                    borderColor: "#DCE7E0",
                    shadowColor: "#0F2A22",
                    shadowOffset: { width: 0, height: -2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 6,
                    elevation: 3,
                  }}
                />
              </View>
              {/* Seamless white bridge covering only the 1px tab bar top border */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -2,
                  width: 72,
                  height: 10,
                  backgroundColor: "white",
                }}
              />
              {/* Centered Bloom AI emblem */}
              <Image
                source={require("../../../assets/bloom-logo-v2.png")}
                style={{
                  position: "absolute",
                  top: -23,
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                }}
                resizeMode="cover"
              />
            </View>
          ),
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            color: theme.green,
            marginTop: 2,
            marginBottom: 2,
          },
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: "Records",
          tabBarIcon: ({ color }) => (
            <Icon name="folder-open-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: "Patients",
          href: role === "Doctor" ? undefined : null,
          tabBarIcon: ({ color }) => (
            <Icon name="people-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Icon name="person-outline" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
