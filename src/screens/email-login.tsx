import { postLoginRoute } from "../login-routing";
import { useLoginAudience } from "../login-audience";
import React, { useEffect, useRef, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import {
  Body,
  Button,
  Card,
  Field,
  Icon,
  Screen,
  theme,
  Title,
  Entrance,
} from "../components";
import { BloomLogo } from "../branding";
import { useClinic } from "../store";
import {
  authError,
  EmailSetupError,
  EmailAccountNotFoundError,
  createEmailAccount,
  sendEmailCode,
  resendEmailCode,
  verifyEmailCode,
  type EmailAttempt,
} from "../email-auth";
export function EmailLogin({
  creatingAccount = false,
}: {
  creatingAccount?: boolean;
}) {
  const { audience } = useLoginAudience();
  const params = useLocalSearchParams<{ email?: string }>();
  const login = useSignIn();
  const signup = useSignUp();
  const { isSignedIn } = useAuth();
  const { state, cloud } = useClinic();
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : "",
  );
  const [accountMissing, setAccountMissing] = useState(false);
  const [code, setCode] = useState("");
  const [attempt, setAttempt] = useState<EmailAttempt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pendingSession, setPendingSession] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const inFlight = useRef(false);
  const resendAfter = useRef(0);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setCooldown(
          Math.max(0, Math.ceil((resendAfter.current - Date.now()) / 1000)),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const loaded = login.isLoaded && signup.isLoaded;
  async function run(action: "send" | "resend" | "verify") {
    if (inFlight.current || !login.isLoaded || !signup.isLoaded) return;
    if (action === "resend" && Date.now() < resendAfter.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (action === "send") {
        const next = creatingAccount
          ? await createEmailAccount(signup.signUp, email)
          : await sendEmailCode(login.signIn, signup.signUp, email);
        setEmail(email.trim());
        setAttempt(next);
        setCode("");
        setPendingSession("");
        setEmailConfirmed(false);
        Keyboard.dismiss();
      } else if (action === "resend" && attempt) {
        await resendEmailCode(login.signIn, signup.signUp, attempt);
        setCode("");
      } else if (action === "verify" && attempt) {
        const session =
          pendingSession ||
          (await verifyEmailCode(login.signIn, signup.signUp, attempt, code));
        setPendingSession(session);
        Keyboard.dismiss();
        await login.setActive({ session });
        setCode("");
      }
      if (action !== "verify") {
        resendAfter.current = Date.now() + 30000;
        setCooldown(30);
      }
    } catch (failure) {
      if (failure instanceof EmailAccountNotFoundError) setAccountMissing(true);
      if (failure instanceof EmailSetupError) {
        setEmailConfirmed(true);
        setCode("");
        Keyboard.dismiss();
      }
      setError(authError(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (state.session)
    return (
      <Redirect
        href={postLoginRoute(state.session, state.onboarded, audience)}
      />
    );
  return (
    <Screen noGuard maxWidth={480}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 16,
        }}
      >
        <BloomLogo size={44} />
        <Text
          style={{
            color: theme.ink,
            fontSize: 18,
            fontWeight: "800",
            letterSpacing: 1,
          }}
        >
          BLOOM MED
        </Text>
      </View>
      <Entrance>
        <Card style={{ borderRadius: 28, padding: 22, gap: 18 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 18,
                backgroundColor: theme.mint,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name={
                  emailConfirmed || pendingSession || isSignedIn
                    ? "checkmark-circle-outline"
                    : "mail-outline"
                }
                size={28}
              />
            </View>
            <Text
              style={{
                color: theme.green,
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 1.4,
              }}
            >
              {attempt
                ? "02 / CONFIRM"
                : creatingAccount
                  ? "01 / JOIN"
                  : "01 / EMAIL"}
            </Text>
          </View>
          <Title>
            {isSignedIn
              ? "Opening your care space"
              : attempt
                ? emailConfirmed
                  ? "Email confirmed"
                  : pendingSession
                    ? "Ready to continue"
                    : "Check your inbox"
                : accountMissing
                  ? "Account not found"
                  : creatingAccount
                    ? "Create your account"
                    : "Sign in with email"}
          </Title>
          {isSignedIn ? (
            <>
              <Body muted>
                {cloud?.error || "Connecting your account securely..."}
              </Body>
              {!!cloud?.error && (
                <>
                  <Button
                    title="Retry connection"
                    onPress={() => void cloud.refresh()}
                  />
                  <Button
                    title="Sign out"
                    secondary
                    onPress={() => {
                      void cloud.signOut().catch((e) => setError(authError(e)));
                    }}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <Body muted>
                {emailConfirmed
                  ? "Your code worked. Your account needs one more setup change before you can continue."
                  : pendingSession
                    ? "Your code is confirmed. Continue to open your care space."
                    : attempt
                      ? "Enter the six-digit code we sent to your inbox."
                      : accountMissing
                        ? "No BLOOM MED account was found for this email."
                        : creatingAccount
                          ? "Join BLOOM MED with your email. We will send a code to confirm it belongs to you."
                          : "We will email you a one-time sign-in code."}
              </Body>
              {!!attempt && (
                <View
                  style={{
                    backgroundColor: theme.mint,
                    borderRadius: 14,
                    padding: 12,
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <Icon name="mail-outline" size={17} />
                  <Text
                    style={{
                      color: theme.green,
                      fontSize: 14,
                      fontWeight: "600",
                      flexShrink: 1,
                    }}
                  >
                    {email}
                  </Text>
                </View>
              )}
              {!attempt ? (
                <>
                  <Field
                    label="Email address"
                    value={email}
                    onChange={(v) => {
                      setEmail(v);
                      setError("");
                      setAccountMissing(false);
                    }}
                    placeholder="you@example.com"
                    inputProps={{
                      editable: !busy,
                      autoCapitalize: "none",
                      autoCorrect: false,
                      keyboardType: "email-address",
                      autoComplete: "email",
                      returnKeyType: "go",
                      onSubmitEditing: () => void run("send"),
                    }}
                  />
                  {!accountMissing && (
                    <Button
                      title={
                        creatingAccount
                          ? "Create account and send code"
                          : "Send sign-in code"
                      }
                      icon="arrow-forward"
                      loading={busy}
                      disabled={!loaded || busy || !email.trim()}
                      onPress={() => void run("send")}
                    />
                  )}
                  {accountMissing && (
                    <Button
                      title="Create account"
                      icon="person-add-outline"
                      onPress={() =>
                        router.push({
                          pathname: "/email-sign-up",
                          params: { email: email.trim() },
                        })
                      }
                    />
                  )}
                  {!creatingAccount && !accountMissing && (
                    <Button
                      title="New here? Create an account"
                      secondary
                      disabled={busy}
                      onPress={() =>
                        router.push({
                          pathname: "/email-sign-up",
                          params: { email: email.trim() },
                        })
                      }
                    />
                  )}
                  {creatingAccount && (
                    <Body muted>
                      Already registered? Return to sign-in to receive your
                      login code.
                    </Body>
                  )}
                </>
              ) : emailConfirmed ? (
                <Button
                  title="Use Google instead"
                  icon="logo-google"
                  onPress={() => router.replace("/sign-in")}
                />
              ) : (
                <>
                  {!pendingSession && (
                    <Field
                      label="Email verification code"
                      value={code}
                      onChange={(v) => {
                        setCode(v.replace(/\D/g, "").slice(0, 6));
                        setError("");
                      }}
                      numeric
                      placeholder="6-digit code"
                      inputProps={{
                        editable: !busy,
                        maxLength: 6,
                        autoComplete: "one-time-code",
                        textContentType: "oneTimeCode",
                        returnKeyType: "go",
                        onSubmitEditing: () => void run("verify"),
                        autoFocus: true,
                        style: {
                          textAlign: "center",
                          letterSpacing: 7,
                          fontSize: 25,
                          fontWeight: "700",
                        },
                      }}
                    />
                  )}
                  <Button
                    title={
                      pendingSession
                        ? "Open my care space"
                        : "Verify and continue"
                    }
                    loading={busy}
                    disabled={
                      !loaded || busy || (!pendingSession && code.length !== 6)
                    }
                    onPress={() => void run("verify")}
                  />
                  {!pendingSession && (
                    <Button
                      title={
                        cooldown
                          ? "Resend code in " + cooldown + "s"
                          : "Resend code"
                      }
                      secondary
                      disabled={busy || cooldown > 0}
                      onPress={() => void run("resend")}
                    />
                  )}
                  <Button
                    title="Use a different email"
                    secondary
                    disabled={busy}
                    onPress={() => {
                      setAttempt(null);
                      setCode("");
                      setError("");
                      setPendingSession("");
                      setEmailConfirmed(false);
                    }}
                  />
                  <Body muted>
                    Check your spam folder too. Only use the most recent code.
                    Never share it with anyone.
                  </Body>
                </>
              )}
            </>
          )}
          {!!error && (
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color: theme.red,
                lineHeight: 22,
                backgroundColor: "#FCF0F2",
                padding: 12,
                borderRadius: 12,
              }}
            >
              {error}
            </Text>
          )}
        </Card>
      </Entrance>
      {!isSignedIn && (
        <Button
          title={
            creatingAccount
              ? "Already have an account? Sign in"
              : "Back to sign-in options"
          }
          secondary
          disabled={busy}
          onPress={() =>
            router.replace(creatingAccount ? "/email-sign-in" : "/sign-in")
          }
        />
      )}
      <View style={{ alignItems: "center", gap: 8, paddingVertical: 10 }}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Icon name="shield-checkmark-outline" size={15} />
          <Text style={{ color: theme.muted, fontSize: 12 }}>
            A secure sign-in to your care space
          </Text>
        </View>
        <Text style={{ color: theme.muted, fontSize: 11 }}>
          NoorAI Labs - Your care, connected.
        </Text>
      </View>
    </Screen>
  );
}
