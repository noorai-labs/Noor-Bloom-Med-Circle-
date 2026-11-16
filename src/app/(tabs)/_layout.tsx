import React from "react";
import { useWindowDimensions } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useClinic } from "../../store";
import { Icon, theme } from "../../components";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export default function TabLayout() {
  const { state, ready } = useClinic();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (!ready) return null;
  if (!state.session) return <Redirect href="/sign-in" />;

  const isSmallScreen = height < 680;
  const bottomPadding = insets.bottom > 0 ? insets.bottom : isSmallScreen ? 4 : 6;
  const barHeight =
    insets.bottom > 0
      ? (isSmallScreen ? 58 : 62) + insets.bottom
      : isSmallScreen
        ? 64
        : 68;

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
          title: ["Doctor", "Nurse"].includes(state.session.role)
            ? "Visits"
            : "Care",
          tabBarIcon: ({ color }) => (
            <Icon name="calendar-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: "Bloom AI",
          tabBarIcon: ({ color }) => (
            <Icon name="sparkles-outline" color={color} />
          ),
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
