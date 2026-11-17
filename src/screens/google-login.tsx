import { postLoginRoute } from "../login-routing";
import {
  LoginAudience,
  setLoginAudience,
  useLoginAudience,
} from "../login-audience";
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  Platform,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useAuth, useSSO } from "@clerk/expo";
import { Redirect, router } from "expo-router";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { BloomLogo } from "../branding";
import { useClinic } from "../store";
import {
  Body,
  Chips,
  Button,
  Card,
  Entrance,
  Icon,
  theme,
  Title,
  Touch,
} from "../components";
import { setAuthFlow, useAuthFlow } from "../auth-flow";
import { GentleMotion } from "../welcome";
import { AuthLayout } from "../auth-layout";
WebBrowser.maybeCompleteAuthSession();
export function GoogleLogin() {
  const { height } = useWindowDimensions();
  const { state, cloud } = useClinic();
  const { isSignedIn, isLoaded } = useAuth();
  const { startSSOFlow } = useSSO();
  const { busy, error } = useAuthFlow();
  const { audience, ready: audienceReady } = useLoginAudience();
  const [help, setHelp] = useState(false);
  const expoGo =
    Platform.OS !== "web" &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
  if (state.session)
    return (
      <Redirect
        href={postLoginRoute(state.session, state.onboarded, audience)}
      />
    );
  async function signIn() {
    if (expoGo) {
      setAuthFlow({
        busy: false,
        error: "Google sign-in requires the installed BLOOM MED APK.",
      });
      return;
    }
    if (busy || !isLoaded) return;
    setAuthFlow({ busy: true, error: "" });
    let failureMessage = "";
    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: "bloommed",
        path: "sso-callback",
      });
      if (__DEV__) console.info("[Google sign-in] callback:", redirectUrl);
      const result = await startSSOFlow({
        strategy: "oauth_google",
        oidcPrompt: "select_account",
        redirectUrl,
      });
      if (__DEV__)
        console.info("[Google sign-in] result", {
          browser: result.authSessionResult?.type,
          sessionCreated: !!result.createdSessionId,
          signInStatus: result.signIn?.status,
          signUpStatus: result.signUp?.status,
          missingFields: result.signUp?.missingFields,
        });
      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
      } else {
        const missing = result.signUp?.missingFields?.join(", ");
        failureMessage =
          result.authSessionResult?.type === "cancel" ||
          result.authSessionResult?.type === "dismiss"
            ? "Google sign-in closed before creating a session. Please try again."
            : missing
              ? "Google sign-up needs: " +
                missing +
                ". Review required fields in Clerk."
              : "Google did not create a session (" +
                (result.signIn?.status ||
                  result.signUp?.status ||
                  "callback incomplete") +
                "). Ensure bloommed://sso-callback is saved in this Clerk development instance's mobile SSO allowlist.";
      }
    } catch (failure) {
      const details = failure as {
        errors?: { code?: string; longMessage?: string; message?: string }[];
      };
      const first = details.errors?.[0];
      if (__DEV__)
        console.warn("[Google sign-in] error code:", first?.code || "unknown");
      failureMessage =
        first?.longMessage ||
        first?.message ||
        (failure instanceof Error
          ? failure.message
          : "Google sign-in could not complete.");
    } finally {
      setAuthFlow({ busy: false, error: failureMessage });
    }
  }
  return (
    <AuthLayout>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 4,
        }}
      >
        <BloomLogo />
        <Text
          style={{
            fontSize: 18,
            fontWeight: "800",
            letterSpacing: 1.4,
            color: theme.ink,
          }}
        >
          BLOOM MED
        </Text>
      </View>
      {!isSignedIn && (
        <Chips
          values={["Patient", "Doctor"]}
          value={audience}
          onChange={(value) => {
            const next = value as LoginAudience;
            void setLoginAudience(next).catch(() => {});
          }}
        />
      )}
      {audience === "Doctor" && !isSignedIn && (
        <Body muted>
          Doctor workspace - Professional approval and patient assignment
          required.
        </Body>
      )}
      {height > 650 && !error && !isSignedIn && (
        <GentleMotion>
          <View>
            <Image
              source={
                audience === "Doctor"
                  ? require("../../assets/doctor-login-care-v1.png")
                  : require("../../assets/care-welcome.png")
              }
              style={{
                width: "100%",
                height: Math.min(220, Math.max(132, height * 0.25)),
                borderRadius: 24,
              }}
              resizeMode="cover"
            />
          </View>
        </GentleMotion>
      )}
      {!isSignedIn && (
        <View style={{ gap: 6, paddingVertical: 4 }}>
          <Text
            style={{
              fontSize: 28,
              lineHeight: 34,
              fontWeight: "700",
              letterSpacing: -0.8,
              color: theme.ink,
            }}
          >
            {audience === "Doctor"
              ? "Care starts with you."
              : "Care that stays with you."}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: theme.muted }}>
            {audience === "Doctor"
              ? "Appointments, patient records and consultations in one workspace."
              : "Care, records and support in one place."}
          </Text>
        </View>
      )}
      <Entrance>
        <Card style={{ padding: 18, borderRadius: 24, gap: 14 }}>
          <Title small>
            {isSignedIn ? "Connect your care space" : "Welcome back"}
          </Title>
          {!isSignedIn ? (
            <View style={{ gap: 12 }}>
              <Button
                title={busy ? "Opening Google..." : "Continue with Google"}
                icon="logo-google"
                disabled={busy || !isLoaded || !audienceReady}
                onPress={signIn}
              />
              <Touch
                label="Continue with email"
                disabled={busy || !isLoaded || !audienceReady}
                onPress={() => router.push("/email-sign-in")}
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 16,
                  paddingVertical: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                }}
              >
                <Icon name="mail-outline" size={19} color={theme.ink} />
                <Text
                  style={{ color: theme.ink, fontSize: 15, fontWeight: "600" }}
                >
                  Continue with email
                </Text>
              </Touch>
            </View>
          ) : (
            <>
              <Body muted>
                {cloud?.error || "Loading your cloud care space..."}
              </Body>
              <Button
                title="Retry connection"
                onPress={() => void cloud?.refresh()}
              />
              <Button
                title="Open my personal care space"
                secondary
                onPress={() => void cloud?.select("")}
              />
              <Button
                title="Sign out"
                secondary
                onPress={() => {
                  void cloud?.signOut().catch((failure) =>
                    setAuthFlow({
                      busy: false,
                      error:
                        failure instanceof Error
                          ? failure.message
                          : "Could not sign out. Try again.",
                    }),
                  );
                }}
              />
            </>
          )}
          {!!error && (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: theme.red, lineHeight: 20 }}
            >
              {error}
            </Text>
          )}
        </Card>
      </Entrance>
      {!isSignedIn && (
        <View style={{ alignItems: "center", gap: 4 }}>
          <Touch
            label="Create a BLOOM MED account"
            disabled={busy || !isLoaded || !audienceReady}
            onPress={() => router.push("/email-sign-up")}
            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
          >
            <Text style={{ fontSize: 13, color: theme.muted }}>
              New to BLOOM MED?{" "}
              <Text style={{ color: theme.green, fontWeight: "700" }}>
                Create account
              </Text>
            </Text>
          </Touch>
          <Touch
            label="Sign-in help"
            onPress={() => setHelp(true)}
            style={{ paddingVertical: 8, paddingHorizontal: 16 }}
          >
            <Text style={{ fontSize: 12, color: theme.muted }}>
              Need help signing in?
            </Text>
          </Touch>
        </View>
      )}
      <Modal
        visible={help}
        transparent
        animationType="fade"
        onRequestClose={() => setHelp(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#162C3580",
            padding: 24,
            justifyContent: "center",
          }}
        >
          <Card style={{ maxHeight: "85%" }}>
            <ScrollView>
              <View style={{ gap: 14 }}>
                <Title small>Get back to your care space</Title>
                <Body>
                  Use the same Google account you originally used with BLOOM
                  MED. A different account opens a separate care space.
                </Body>
                <Body muted>
                  Your Google password and account recovery are managed by
                  Google. BLOOM MED never asks you to share your password or
                  recovery codes.
                </Body>
                <Button
                  title="Recover my Google account"
                  onPress={() => {
                    void WebBrowser.openBrowserAsync(
                      "https://accounts.google.com/signin/recovery",
                    ).catch(() =>
                      setAuthFlow({
                        busy: false,
                        error:
                          "Could not open Google recovery. Visit accounts.google.com/signin/recovery in your browser.",
                      }),
                    );
                  }}
                />
                <Body muted>
                  If Google sign-in succeeds but your care space does not load,
                  use Retry connection. If you see a required-field error,
                  contact BLOOM MED support with the error text; do not send
                  identity documents or passwords.
                </Body>
              </View>
            </ScrollView>
            <Button
              title="Back to login"
              secondary
              onPress={() => setHelp(false)}
            />
          </Card>
        </View>
      </Modal>
      <View style={{ alignItems: "center", gap: 6, paddingTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Icon name="shield-checkmark-outline" size={13} />
          <Text style={{ fontSize: 11, color: theme.muted }}>
            Your care, kept private.
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: theme.muted }}>NoorAI Labs</Text>
      </View>
    </AuthLayout>
  );
}
