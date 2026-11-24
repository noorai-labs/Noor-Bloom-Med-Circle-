import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Text, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Role } from "../clinic";
import { postLoginRoute } from "../login-routing";
import { setLoginAudience, useLoginAudience } from "../login-audience";
import { AuthLayout } from "../auth-layout";
import {
  AUTH_ROLE_DETAILS,
  AuthBrandHeader,
  AuthFooter,
  PortalRoleGrid,
  setPortalRole,
  usePortalRole,
} from "../auth-chrome";
import {
  Body,
  Button,
  Card,
  Entrance,
  ErrorBanner,
  Field,
  Icon,
  Label,
  OtpInput,
  Touch,
  styles,
  theme,
} from "../components";
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
  const { audience, ready: audienceReady } = useLoginAudience();
  const portalRole = usePortalRole();
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
    if (!audienceReady) return;
    if (portalRole !== audience) setPortalRole(audience);
  }, [audience, audienceReady, portalRole]);

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
  const displayRole: Role = audience;
  const details = AUTH_ROLE_DETAILS[displayRole];

  function selectRole(next: Role) {
    if (!cloud?.spaces.some((space) => space.role === next)) return;
    setPortalRole(next);
    void setLoginAudience(next).catch(() => {});
    setError("");
  }

  async function run(
    action: "send" | "resend" | "verify",
    overrideCode?: string,
  ) {
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
        const activeCode = overrideCode ?? code;
        const session =
          pendingSession ||
          (await verifyEmailCode(
            login.signIn,
            signup.signUp,
            attempt,
            activeCode,
          ));
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

  if (state.session) {
    if (!audienceReady) return null;
    return (
      <Redirect
        href={postLoginRoute(state.session, state.onboarded, audience)}
      />
    );
  }

  function handleBack() {
    if (busy) return;
    if (attempt) {
      setAttempt(null);
      setCode("");
      setError("");
      setPendingSession("");
      setEmailConfirmed(false);
      return;
    }
    router.replace("/sign-in");
  }

  return (
    <AuthLayout>
      <AuthBrandHeader />
      <Entrance key={attempt ? "otp" : creatingAccount ? "signup" : "signin"}>
        <Card style={{ borderRadius: 24, padding: 20, gap: 16 }}>
          <View style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              {!isSignedIn && (
                <Touch
                  label="Go back"
                  disabled={busy}
                  onPress={handleBack}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: "#EEF4F1",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="arrow-back" size={18} color={theme.ink} />
                </Touch>
              )}
              <Text
                style={[
                  styles.title,
                  { fontSize: 20, lineHeight: 26, flexShrink: 1 },
                ]}
              >
                {isSignedIn
                  ? "Opening your care space"
                  : attempt
                    ? emailConfirmed
                      ? "Email confirmed"
                      : pendingSession
                        ? "Ready to continue"
                        : "Verify your identity"
                    : accountMissing
                      ? "Account not found"
                      : creatingAccount
                        ? "Create your account"
                        : "Continue with email"}
              </Text>
            </View>
            {!isSignedIn && (
              <Body muted>
                {emailConfirmed
                  ? "Your code worked. Your account needs one more setup change before you can continue."
                  : pendingSession
                    ? "Your code is confirmed. Continue to open your care space."
                    : attempt
                      ? `Enter the 6-digit verification code sent to ${email}.`
                      : accountMissing
                        ? "No BLOOM MED account was found for this email."
                        : creatingAccount
                          ? displayRole !== "Patient"
                            ? "Choose your role and enter your email for a 6-digit verification code."
                            : "Join BLOOM MED with your email to get a 6-digit verification code."
                          : "We will email you a one-time 6-digit sign-in code."}
              </Body>
            )}
          </View>

          {!!error && (
            <ErrorBanner message={error} onDismiss={() => setError("")} />
          )}

          {isSignedIn ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 6,
                }}
              >
                {!cloud?.error && (
                  <ActivityIndicator color={theme.green} size="small" />
                )}
                <Body muted style={{ flexShrink: 1 }}>
                  {cloud?.error || "Connecting your account securely…"}
                </Body>
              </View>
              {!!cloud?.error && (
                <>
                  <Button
                    title="Retry connection"
                    onPress={() => void cloud.refresh()}
                  />
                  <Button
                    title="Sign out"
                    outline
                    icon="log-out-outline"
                    onPress={() => {
                      void cloud.signOut().catch((e) => setError(authError(e)));
                    }}
                  />
                </>
              )}
            </>
          ) : !attempt ? (
            <>
              {creatingAccount &&
                displayRole !== "Patient" &&
                !!cloud?.spaces.some((space) => space.role !== "Patient") && (
                  <PortalRoleGrid
                    role={displayRole}
                    availableRoles={
                      cloud?.spaces.map((space) => space.role) || []
                    }
                    disabled={busy}
                    onSelect={selectRole}
                  />
                )}

              <Field
                label="Email address"
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  setError("");
                  setAccountMissing(false);
                }}
                placeholder={details.defaultEmail}
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
                      ? `Create ${details.title} account`
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
            </>
          ) : emailConfirmed ? (
            <Button
              title="Use Google instead"
              icon="logo-google"
              onPress={() => router.replace("/sign-in")}
            />
          ) : (
            <>
              <View
                style={{
                  padding: 12,
                  backgroundColor: "#F4F8F6",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#D8EAE0",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: details.badgeColor,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    name={details.icon}
                    size={18}
                    color={details.iconColor}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.muted,
                      textTransform: "uppercase",
                      fontWeight: "700",
                      letterSpacing: 0.5,
                    }}
                  >
                    {creatingAccount ? "Creating" : "Signing in as"}{" "}
                    {details.title}
                  </Text>
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 13,
                      color: theme.ink,
                    }}
                    numberOfLines={1}
                  >
                    {email}
                  </Text>
                </View>
                <Touch
                  label="Use a different email"
                  disabled={busy}
                  onPress={handleBack}
                  style={{
                    backgroundColor: "white",
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#D8EAE0",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: theme.green,
                    }}
                  >
                    Change
                  </Text>
                </Touch>
              </View>

              {!pendingSession && (
                <View style={{ gap: 8 }}>
                  <Label>6-digit verification code</Label>
                  <OtpInput
                    editable={!busy}
                    value={code}
                    onChange={(v) => {
                      if (inFlight.current) return;
                      setCode(v);
                      setError("");
                    }}
                    onComplete={(val) => {
                      void run("verify", val);
                    }}
                    error={error}
                    autoFocus
                  />
                </View>
              )}

              <Button
                title={
                  pendingSession
                    ? "Open my care space"
                    : "Verify and continue"
                }
                icon="arrow-forward"
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

              <Body muted>
                Check your spam folder too. Only use the most recent code. Never
                share it with anyone.
              </Body>
            </>
          )}
        </Card>
      </Entrance>

      {!isSignedIn && !attempt && (
        <View style={{ alignItems: "center", gap: 4 }}>
          <Touch
            label={
              creatingAccount
                ? "Sign in with an existing account"
                : "Create a BLOOM MED account"
            }
            disabled={busy}
            onPress={() =>
              router.replace({
                pathname: creatingAccount ? "/email-sign-in" : "/email-sign-up",
                params: email.trim() ? { email: email.trim() } : undefined,
              })
            }
            style={{ paddingVertical: 8, paddingHorizontal: 14 }}
          >
            <Text style={{ fontSize: 13, color: theme.muted }}>
              {creatingAccount
                ? "Already have an account? "
                : "New to BLOOM MED? "}
              <Text style={{ color: theme.green, fontWeight: "700" }}>
                {creatingAccount ? "Sign in" : "Create account"}
              </Text>
            </Text>
          </Touch>
        </View>
      )}

      <AuthFooter note="Your care, kept private." />
    </AuthLayout>
  );
}
