import React, { useEffect, useState } from "react";
import { Animated, Platform, Text, View } from "react-native";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { cloudMode, clerkKey, configurationError } from "../cloud-config";
import { CloudClinicProvider } from "../cloud-store";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClinicProvider, useClinic } from "../store";
import { MedicineReminderProvider } from "../medicine-reminders";
import { StartupLoader } from "../branding";
import { theme, useReducedMotion } from "../components";
export default function RootLayout() {
  if (configurationError)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 28,
          backgroundColor: theme.bg,
        }}
      >
        <Text style={{ fontSize: 24, color: theme.ink, marginBottom: 14 }}>
          Cloud setup required
        </Text>
        <Text style={{ color: theme.muted, lineHeight: 24 }}>
          {configurationError}
        </Text>
      </View>
    );
  if (cloudMode)
    return (
      <ClerkProvider publishableKey={clerkKey} tokenCache={tokenCache}>
        <CloudClinicProvider>
          <AppNavigation />
        </CloudClinicProvider>
      </ClerkProvider>
    );
  return (
    <ClinicProvider>
      <AppNavigation />
    </ClinicProvider>
  );
}
function AppNavigation() {
  const { ready } = useClinic();
  const [introFinished, setIntroFinished] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));
  const reduced = useReducedMotion();
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const timer = setTimeout(() => setIntroFinished(true), 1100);
    return () => clearTimeout(timer);
  }, []);
  const loading = !ready || !introFinished;
  useEffect(() => {
    if (loading) return;
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: reduced ? 0 : 240,
      useNativeDriver: Platform.OS !== "web",
    });
    fade.start(({ finished }) => {
      if (finished) setDismissed(true);
    });
    return () => fade.stop();
  }, [loading, opacity, reduced]);
  return (
    <MedicineReminderProvider>
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: { backgroundColor: theme.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="sos"
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
        </Stack>
        {!dismissed && (
          <Animated.View style={{ position: "absolute", inset: 0, opacity }}>
            <StartupLoader />
          </Animated.View>
        )}
      </View>
    </MedicineReminderProvider>
  );
}
