import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { isRunningInExpoGo } from "expo";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useAuth, useSSO } from "@clerk/expo";
import { Link, Redirect, router } from "expo-router";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Role } from "../clinic";
import { useClinic } from "../store";
import {
  Body,
  Button,
  Card,
  Entrance,
  ErrorBanner,
  ErrorState,
  theme,
  Title,
} from "../components";
import { setAuthFlow, useAuthFlow } from "../auth-flow";
import { AuthLayout } from "../auth-layout";
import {
  AuthBrandHeader,
  AuthFooter,
  AuthSignInShell,
  RoleChooserModal,
  setPortalRole,
  usePortalRole,
} from "../auth-chrome";
import { setLoginAudience, useLoginAudience } from "../login-audience";
import { postLoginRoute } from "../login-routing";

WebBrowser.maybeCompleteAuthSession();
const GOOGLE_RECOVERY_URL = "https://accounts.google.com/signin/recovery";

export function GoogleLogin() {
  const { height } = useWindowDimensions();
  const { state, cloud } = useClinic();
  const { isSignedIn, isLoaded } = useAuth();
  const { startSSOFlow } = useSSO();
  const { busy, error } = useAuthFlow();
  const { audience, ready: audienceReady } = useLoginAudience();
  const portalRole = usePortalRole();
  const [choosing, setChoosing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const expoGo =
    Platform.OS !== "web" &&
    (isRunningInExpoGo() ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

  useEffect(() => {
    if (!audienceReady) return;
    if (audience === "Patient" && portalRole !== "Patient") {
      setPortalRole("Patient");
    } else if (audience === "Doctor" && portalRole === "Patient") {
      setPortalRole("Doctor");
    }
  }, [audience, audienceReady, portalRole]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  if (state.session) {
    if (!audienceReady) return null;
    return (
      <Redirect
        href={postLoginRoute(state.session, state.onboarded, audience)}
      />
    );
  }

  function selectRole(next: Role) {
    setPortalRole(next);
    void setLoginAudience(next === "Patient" ? "Patient" : "Doctor").catch(
      () => {},
    );
  }

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

  function handleSignOut() {
    void cloud?.signOut().catch((failure) =>
      setAuthFlow({
        busy: false,
        error:
          failure instanceof Error
            ? failure.message
            : "Could not sign out. Try again.",
      }),
    );
  }

  const displayRole: Role =
    audience === "Patient"
      ? "Patient"
      : portalRole === "Patient"
        ? "Doctor"
        : portalRole;

  return (
    <AuthLayout>
      {isSignedIn ? (
        <>
          <AuthBrandHeader />
          <Entrance>
            {cloud?.error ? (
              <Card style={{ borderRadius: 24, padding: 20, gap: 16 }}>
                <ErrorState
                  title="Couldn’t connect to care space"
                  message={
                    cloud.error.includes("Failed to fetch") ||
                    cloud.error.includes("Network")
                      ? "Couldn’t reach the care server. Please check your internet connection and try again."
                      : cloud.error
                  }
                  onRetry={() => void cloud?.refresh()}
                  retryLabel="Retry connection"
                  secondaryAction="Open my personal care space"
                  onSecondaryPress={() => void cloud?.select("")}
                />
                <Button
                  title="Sign out"
                  outline
                  icon="log-out-outline"
                  onPress={handleSignOut}
                />
                {!!error && (
                  <ErrorBanner
                    message={error}
                    onDismiss={() => setAuthFlow({ busy: false, error: "" })}
                  />
                )}
              </Card>
            ) : (
              <Card style={{ borderRadius: 24, padding: 20, gap: 16 }}>
                <Title small>Connect your care space</Title>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 6,
                  }}
                >
                  <ActivityIndicator color={theme.green} size="small" />
                  <Body muted style={{ flexShrink: 1 }}>
                    Loading your cloud care space…
                  </Body>
                </View>
                <Button
                  title="Retry connection"
                  onPress={() => void cloud?.refresh()}
                />
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
                  onPress={handleSignOut}
                />
                {!!error && (
                  <ErrorBanner
                    message={error}
                    onDismiss={() => setAuthFlow({ busy: false, error: "" })}
                  />
                )}
              </Card>
            )}
          </Entrance>
          <AuthFooter note="Your care, kept private." />
        </>
      ) : (
        <AuthSignInShell
          role={displayRole}
          height={height}
          busy={busy}
          actionsDisabled={!isLoaded || !audienceReady}
          googleTitle={busy ? "Opening Google…" : "Continue with Google"}
          notice={
            expoGo
              ? "Google sign-in needs the installed BLOOM MED development app; Expo Go cannot complete this callback."
              : undefined
          }
          error={error}
          onDismissError={() => setAuthFlow({ busy: false, error: "" })}
          onRoleChange={selectRole}
          onOpenMoreRoles={() => setChoosing(true)}
          onGooglePress={signIn}
          onEmailPress={() => router.push("/email-sign-in")}
          onCreateAccountPress={() => router.push("/email-sign-up")}
          onHelpPress={() => setHelpOpen(true)}
          footerNote="Your care, kept private."
        />
      )}

      <RoleChooserModal
        visible={choosing}
        role={displayRole}
        onSelect={selectRole}
        onClose={() => setChoosing(false)}
      />

      <Modal
        visible={helpOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#162C3580",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Card style={{ maxHeight: "85%", borderRadius: 24, padding: 20 }}>
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
                {Platform.OS === "web" ? (
                  <View style={{ gap: 8 }}>
                    <Link
                      href={GOOGLE_RECOVERY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        backgroundColor: theme.green,
                        borderRadius: 16,
                        paddingVertical: 14,
                        paddingHorizontal: 18,
                        textAlign: "center",
                        color: "white",
                        fontSize: 15,
                        fontWeight: "700",
                      }}
                    >
                      Recover my Google account
                    </Link>
                    <Text
                      selectable
                      style={{
                        fontSize: 12,
                        color: theme.muted,
                        textAlign: "center",
                      }}
                    >
                      Or open directly: accounts.google.com/signin/recovery
                    </Text>
                  </View>
                ) : (
                  <Button
                    title="Recover my Google account"
                    onPress={() => {
                      void WebBrowser.openBrowserAsync(
                        GOOGLE_RECOVERY_URL,
                      ).catch(() =>
                        setAuthFlow({
                          busy: false,
                          error:
                            "Could not open Google recovery. Visit accounts.google.com/signin/recovery in your browser.",
                        }),
                      );
                    }}
                  />
                )}
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
              onPress={() => setHelpOpen(false)}
            />
          </Card>
        </View>
      </Modal>
    </AuthLayout>
  );
}
