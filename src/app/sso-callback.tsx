import { postLoginRoute } from "../login-routing";
import { useLoginAudience } from "../login-audience";
import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/expo";
import { Redirect, router } from "expo-router";
import { Text, View } from "react-native";
import { useClinic } from "../store";
import { useAuthFlow } from "../auth-flow";
import { AuthLayout } from "../auth-layout";
import { BloomLogo } from "../branding";
import { Body, Button, theme } from "../components";

export default function Callback() {
  const { audience } = useLoginAudience();
  const { isSignedIn } = useAuth();
  const { state, ready, cloud } = useClinic();
  const flow = useAuthFlow();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 30000);
    return () => clearTimeout(timer);
  }, []);
  if (state.session)
    return (
      <Redirect
        href={postLoginRoute(state.session, state.onboarded, audience)}
      />
    );
  if (!flow.busy && !isSignedIn && flow.error)
    return <Redirect href="/sign-in" />;
  return (
    <AuthLayout>
      <View style={{ alignItems: "center", gap: 16 }}>
        <BloomLogo size={72} />
        <Text style={{ color: theme.ink, fontSize: 24, fontWeight: "700" }}>
          {isSignedIn ? "Opening your care space" : "Completing Google sign-in"}
        </Text>
        <Body muted>
          {cloud?.error ||
            (timedOut
              ? "The callback has not completed. Check that bloommed://sso-callback is allowlisted in your Clerk development instance."
              : "Please wait while we finish connecting your account.")}
        </Body>
      </View>
      {isSignedIn && ready && !!cloud?.error && (
        <Button
          title="Retry care connection"
          onPress={() => void cloud.refresh()}
        />
      )}
      {timedOut && (
        <Button
          title="Back to sign-in"
          secondary
          onPress={() => router.replace("/sign-in")}
        />
      )}
    </AuthLayout>
  );
}
