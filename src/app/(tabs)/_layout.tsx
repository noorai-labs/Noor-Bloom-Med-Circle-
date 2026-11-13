import { useLoginAudience } from "../../login-audience";
import { cloudMode } from "../../cloud-config";
import React from "react";
import { Redirect, Tabs } from "expo-router";
import { useClinic } from "../../store";
import { Icon, theme } from "../../components";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export default function TabLayout() {
  const { state, ready } = useClinic();
  const { audience, ready: audienceReady } = useLoginAudience();
  const insets = useSafeAreaInsets();
  if (!ready || (cloudMode && !audienceReady)) return null;
  if (!state.session) return <Redirect href="/sign-in" />;
  if (cloudMode && audience === "Doctor" && state.session.role !== "Doctor")
    return <Redirect href="/doctor-entry" />;
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
          height: 62 + Math.max(insets.bottom, 8),
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          marginBottom: 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 1 },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: state.session.role === "Doctor" ? "Dashboard" : "Home",
          tabBarIcon: ({ color }) => <Icon name="grid-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: ["Doctor", "Nurse"].includes(state.session.role)
            ? "Appointments"
            : "Care",
          tabBarIcon: ({ color }) => (
            <Icon name="calendar-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: "Records",
          href: state.session.role === "Doctor" ? null : undefined,
          tabBarIcon: ({ color }) => (
            <Icon name="folder-open-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: "Bloom AI",
          href: state.session.role === "Doctor" ? null : undefined,
          tabBarIcon: ({ color }) => (
            <Icon name="sparkles-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: "Patients",
          href: state.session.role === "Doctor" ? undefined : null,
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
