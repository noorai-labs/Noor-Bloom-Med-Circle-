import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Text, View, useWindowDimensions } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useAuth, useClerk, useSSO } from "@clerk/expo";
import { Redirect } from "expo-router";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { BloomLogo } from "../branding";
import { useClinic } from "../store";
import {
  Body,
  Button,
  Card,
  Entrance,
  ErrorBanner,
  ErrorState,
  Field,
  Icon,
  OtpInput,
  SlideDownFade,
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
  const { isSignedIn } = useAuth();
  const { startSSOFlow } = useSSO();
  const clerk = useClerk();
  const { busy, error } = useAuthFlow();

  const [method, setMethod] = useState<"options" | "email" | "email_otp">("options");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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
        href={
          state.session.role === "Patient" && !state.onboarded
            ? "/onboarding"
            : "/(tabs)"
        }
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
    if (busy) return;
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

  async function handleSendEmailCode() {
    const cleanEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailSubmitting(true);
    setEmailError("");
    try {
      if (isSignUp) {
        await clerk.client.signUp.create({ emailAddress: cleanEmail });
        await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setMethod("email_otp");
      } else {
        try {
          const attempt = await clerk.client.signIn.create({ identifier: cleanEmail });
          const factor = attempt.supportedFirstFactors?.find(
            (f) => f.strategy === "email_code"
          );
          if (factor && "emailAddressId" in factor) {
            await clerk.client.signIn.prepareFirstFactor({
              strategy: "email_code",
              emailAddressId: factor.emailAddressId as string,
            });
          }
          setMethod("email_otp");
        } catch (err: unknown) {
          const clerkErr = err as { errors?: { code?: string; longMessage?: string; message?: string }[] };
          const code = clerkErr?.errors?.[0]?.code;
          if (code === "form_identifier_not_found") {
            await clerk.client.signUp.create({ emailAddress: cleanEmail });
            await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
            setIsSignUp(true);
            setMethod("email_otp");
          } else {
            throw err;
          }
        }
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { code?: string; longMessage?: string; message?: string }[] };
      const msg =
        clerkErr?.errors?.[0]?.longMessage ||
        clerkErr?.errors?.[0]?.message ||
        (err instanceof Error ? err.message : "Failed to send verification code.");
      setEmailError(msg);
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function handleVerifyEmailCode(targetCode?: string) {
    const cleanCode = (typeof targetCode === "string" ? targetCode : otpCode).trim();
    if (cleanCode.length < 6) {
      setEmailError("Enter the 6-digit verification code.");
      return;
    }
    setEmailSubmitting(true);
    setEmailError("");
    try {
      if (isSignUp) {
        const res = await clerk.client.signUp.attemptEmailAddressVerification({ code: cleanCode });
        if (res.status === "complete" && res.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId });
        } else {
          setEmailError("Verification incomplete. Please check code.");
        }
      } else {
        const res = await clerk.client.signIn.attemptFirstFactor({
          strategy: "email_code",
          code: cleanCode,
        });
        if (res.status === "complete" && res.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId });
        } else {
          setEmailError("Sign in incomplete. Please check code.");
        }
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { code?: string; longMessage?: string; message?: string }[] };
      const msg =
        clerkErr?.errors?.[0]?.longMessage ||
        clerkErr?.errors?.[0]?.message ||
        (err instanceof Error ? err.message : "Invalid verification code.");
      setEmailError(msg);
    } finally {
      setEmailSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginVertical: 4,
        }}
      >
        <BloomLogo size={42} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 19,
              fontWeight: "800",
              letterSpacing: 1.2,
              color: theme.ink,
            }}
          >
            BLOOM MED
          </Text>
          <Text style={{ fontSize: 11, color: theme.muted, fontWeight: "500" }}>
            A gentler way to care at home
          </Text>
        </View>
      </View>

      {method === "options" && height > 620 && (
        <GentleMotion>
          <View>
            <Image
              source={require("../../assets/care-welcome.png")}
              style={{
                width: "100%",
                height: Math.min(160, Math.max(110, height - 640)),
                borderRadius: 22,
              }}
              resizeMode="cover"
            />
            <View
              style={{
                position: "absolute",
                bottom: 12,
                left: 12,
                backgroundColor: "#FFFFFFF2",
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
              }}
            >
              <Icon name="heart-outline" size={16} />
              <Text
                style={{ color: theme.green, fontSize: 12, fontWeight: "700" }}
              >
                A little closer to care
              </Text>
            </View>
          </View>
        </GentleMotion>
      )}

      <Title>Care that stays with you.</Title>
      <Body muted>Care, records and support in one place.</Body>

      <Entrance>
        {isSignedIn ? (
          cloud?.error ? (
            <ErrorState
              title="Couldn’t connect to care space"
              message={
                cloud.error.includes("Failed to fetch") || cloud.error.includes("Network")
                  ? "Couldn’t reach the care server. Please check your internet connection and try again."
                  : cloud.error
              }
              onRetry={() => void cloud?.refresh()}
              retryLabel="Try again"
              secondaryAction="Open personal care space"
              onSecondaryPress={() => void cloud?.select("")}
            />
          ) : (
            <Card style={{ gap: 16 }}>
              <Title small>Connect your care space</Title>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 8,
                }}
              >
                <ActivityIndicator color={theme.green} size="small" />
                <Body muted style={{ flexShrink: 1 }}>
                  Connecting to your secure cloud care space…
                </Body>
              </View>
              <Button
                title="Open my personal care space"
                secondary
                icon="person-outline"
                onPress={() => void cloud?.select("")}
              />
              <Button
                title="Sign out"
                outline
                icon="log-out-outline"
                onPress={() => void cloud?.signOut()}
              />
            </Card>
          )
        ) : method === "email" ? (
          <Card style={{ borderRadius: 24, padding: 20, gap: 16 }}>
            <SlideDownFade>
              <View style={{ gap: 14 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 2,
                  }}
                >
                  <Touch
                    label="Back to options"
                    onPress={() => {
                      setMethod("options");
                      setEmailError("");
                    }}
                    style={{ padding: 4 }}
                  >
                    <Icon name="arrow-back" size={20} color={theme.ink} />
                  </Touch>
                  <Title small>
                    {isSignUp ? "Create your account" : "Continue with email"}
                  </Title>
                </View>

                <Body muted>
                  {isSignUp
                    ? "Enter your email address to set up your secure care space."
                    : "Enter your email address to receive a secure sign-in code."}
                </Body>

                <Field
                  label="Email address"
                  value={email}
                  onChange={(val) => {
                    setEmail(val);
                    setEmailError("");
                  }}
                  placeholder="you@example.com"
                  error={emailError}
                />

                <Button
                  title={
                    emailSubmitting
                      ? "Sending code…"
                      : "Send verification code"
                  }
                  icon="arrow-forward"
                  disabled={emailSubmitting}
                  loading={emailSubmitting}
                  onPress={handleSendEmailCode}
                />
              </View>
            </SlideDownFade>
          </Card>
        ) : method === "email_otp" ? (
          <Card style={{ borderRadius: 24, padding: 20, gap: 16 }}>
            <SlideDownFade>
              <View style={{ gap: 14 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 2,
                  }}
                >
                  <Touch
                    label="Back"
                    onPress={() => {
                      setMethod("email");
                      setEmailError("");
                    }}
                    style={{ padding: 4 }}
                  >
                    <Icon name="arrow-back" size={20} color={theme.ink} />
                  </Touch>
                  <Title small>Check your inbox</Title>
                </View>

                <Body muted>
                  We sent a 6-digit verification code to{" "}
                  <Text style={{ color: theme.ink, fontWeight: "700" }}>
                    {email}
                  </Text>
                  .
                </Body>

                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: theme.ink }}>
                    6-digit verification code
                  </Text>
                  <OtpInput
                    value={otpCode}
                    onChange={(val) => {
                      setOtpCode(val);
                      if (emailError) setEmailError("");
                    }}
                    onComplete={(val) => {
                      void handleVerifyEmailCode(val);
                    }}
                    error={emailError}
                    autoFocus
                  />
                </View>

                <Button
                  title={emailSubmitting ? "Verifying…" : "Verify & Continue"}
                  disabled={emailSubmitting || otpCode.length < 6}
                  loading={emailSubmitting}
                  onPress={() => void handleVerifyEmailCode(otpCode)}
                />

                <Touch
                  label="Resend code"
                  onPress={handleSendEmailCode}
                  style={{ alignSelf: "center", paddingVertical: 4 }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.green,
                      fontWeight: "600",
                    }}
                  >
                    {"Didn't get a code? Resend"}
                  </Text>
                </Touch>
              </View>
            </SlideDownFade>
          </Card>
        ) : (
          <Card style={{ borderRadius: 24, padding: 20, gap: 16 }}>
            <Title small>Welcome back</Title>
            {expoGo && (
              <Body muted>
                Google sign-in needs the installed BLOOM MED development app;
                Expo Go cannot complete this callback.
              </Body>
            )}

            <View style={{ gap: 12 }}>
              <Button
                title={busy ? "Opening Google…" : "Continue with Google"}
                icon="logo-google"
                disabled={busy}
                onPress={signIn}
              />
              <Button
                title="Continue with email"
                outline
                icon="mail-outline"
                disabled={busy}
                onPress={() => {
                  setMethod("email");
                  setIsSignUp(false);
                  setEmailError("");
                }}
              />
            </View>

            {!!error && (
              <ErrorBanner
                message={error}
                onDismiss={() => {
                  setAuthFlow({ busy: false, error: "" });
                }}
              />
            )}
          </Card>
        )}
      </Entrance>

      {!isSignedIn && method === "options" && (
        <View style={{ alignItems: "center", gap: 12, marginTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={{ fontSize: 13, color: theme.muted }}>
              New to BLOOM MED?
            </Text>
            <Touch
              label="Create account"
              onPress={() => {
                setMethod("email");
                setIsSignUp(true);
                setEmailError("");
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: theme.green,
                  fontWeight: "700",
                }}
              >
                Create account
              </Text>
            </Touch>
          </View>
          <Touch
            label="Need help signing in?"
            onPress={() => setHelpOpen(true)}
          >
            <Text style={{ fontSize: 13, color: theme.muted }}>
              Need help signing in?
            </Text>
          </Touch>
        </View>
      )}

      <View
        style={{
          alignItems: "center",
          gap: 4,
          marginTop: 14,
          marginBottom: 16,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="shield-checkmark-outline" size={15} color={theme.green} />
          <Text style={{ fontSize: 12, color: theme.muted }}>
            Your care, kept private.
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: theme.muted, fontWeight: "500" }}>
          NoorAI Labs
        </Text>
      </View>

      <Modal
        visible={helpOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000077",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Card>
            <Title small>Need help signing in?</Title>
            <Body muted>
              If you have trouble accessing your care space or haven&apos;t received
              your verification code, our support team is available 24/7.
            </Body>
            <View
              style={{
                backgroundColor: "#F2F7F5",
                padding: 14,
                borderRadius: 12,
                gap: 6,
              }}
            >
              <Text
                style={{ fontWeight: "700", color: theme.ink, fontSize: 13 }}
              >
                Care Coordinator Desk
              </Text>
              <Text style={{ fontSize: 13, color: theme.muted }}>
                Email: support@bloommed.in
              </Text>
              <Text style={{ fontSize: 13, color: theme.muted }}>
                Hours: 24/7 Priority Support
              </Text>
            </View>
            <Button title="Got it" onPress={() => setHelpOpen(false)} />
          </Card>
        </View>
      </Modal>
    </AuthLayout>
  );
}
