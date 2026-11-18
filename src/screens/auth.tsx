import React, { useState } from "react";
import {
  Keyboard,
  Modal,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Redirect, router } from "expo-router";
import { AuthLayout } from "../auth-layout";
import {
  AUTH_ROLE_DETAILS,
  AuthBrandHeader,
  AuthFooter,
  AuthSignInShell,
  PortalRoleGrid,
  RoleChooserModal,
} from "../auth-chrome";
import { useClinic } from "../store";
import { cloudMode } from "../cloud-config";
import { GoogleLogin } from "./google-login";
import { doctors, nurses, Role } from "../clinic";
import {
  Avatar,
  Body,
  Button,
  Card,
  Chips,
  Field,
  Entrance,
  ErrorBanner,
  Icon,
  Label,
  OtpInput,
  Screen,
  SlideDownFade,
  Touch,
  styles,
  theme,
} from "../components";
import { WelcomeGate } from "../welcome";

export function StaffProfileSelector({
  kind,
  providerId,
  onSelect,
}: {
  kind: "Doctor" | "Nurse";
  providerId: string;
  onSelect: (id: string) => void;
}) {
  const list = kind === "Nurse" ? nurses : doctors;
  const fallbackId = kind === "Nurse" ? "n1" : "1";
  return (
    <SlideDownFade>
      <View
        style={{
          marginLeft: 14,
          paddingLeft: 12,
          borderLeftWidth: 2.5,
          borderLeftColor: theme.green,
          gap: 8,
          marginTop: 2,
          marginBottom: 4,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text
            style={{
              fontWeight: "700",
              fontSize: 13,
              color: theme.ink,
            }}
          >
            {kind === "Doctor" ? "Choose Doctor Profile" : "Choose Nurse Profile"}
          </Text>
          <Text style={{ fontSize: 11, color: theme.muted }}>
            {kind === "Doctor"
              ? "Visits and consultations are scoped to this physician."
              : "Home visit queues are scoped to this nurse."}
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          {list.map((p) => {
            const selected = p.id === (providerId || fallbackId);
            return (
              <Touch
                key={p.id}
                label={"Select " + p.name}
                selected={selected}
                onPress={() => onSelect(p.id)}
                style={{
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: selected ? "#E5F5EF" : "#FFFFFF",
                  borderWidth: 1.5,
                  borderColor: selected ? theme.green : "#E4EDE8",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Avatar providerId={p.id} size={36} />
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "700",
                        fontSize: 13,
                        color: selected ? theme.green : theme.ink,
                      }}
                    >
                      {p.name}
                    </Text>
                    <View
                      style={{
                        backgroundColor: "#F0F4F2",
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                        borderRadius: 5,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          color: theme.muted,
                          fontWeight: "600",
                        }}
                      >
                        ★ {p.rating}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.muted,
                      marginTop: 1,
                    }}
                  >
                    {p.specialty} · {p.experience} yrs exp
                  </Text>
                </View>
                {selected && (
                  <Icon
                    name="checkmark-circle"
                    size={18}
                    color={theme.green}
                  />
                )}
              </Touch>
            );
          })}
        </View>
      </View>
    </SlideDownFade>
  );
}

export default function AuthScreen() {
  return (
    <WelcomeGate>
      {cloudMode ? <GoogleLogin /> : <DemoAuthScreen />}
    </WelcomeGate>
  );
}

function DemoAuthScreen() {
  const { state, dispatch } = useClinic();
  const [step, setStep] = useState<"options" | "email" | "otp">("options");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [role, setRole] = useState<Role>("Patient");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [providerId, setProviderId] = useState("1");
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { height } = useWindowDimensions();

  function selectRole(next: Role) {
    setRole(next);
    if (next === "Nurse") setProviderId("n1");
    else if (next === "Doctor") setProviderId(doctors[0]?.id || "1");
    setError("");
  }

  function continueWithGoogle() {
    setError("");
    Keyboard.dismiss();
    dispatch({
      type: "session",
      session: {
        role,
        providerId: ["Doctor", "Nurse"].includes(role) ? providerId : "",
        identifier: identifier.trim() || AUTH_ROLE_DETAILS[role].defaultEmail,
      },
    });
  }

  function handleLoginSubmit(targetCode: string) {
    if (targetCode !== "123456") {
      setError("Enter demo code 123456.");
      return;
    }
    setError("");
    Keyboard.dismiss();
    const finalIdentifier =
      identifier.trim() || AUTH_ROLE_DETAILS[role].defaultEmail;
    dispatch({
      type: "session",
      session: {
        role,
        providerId: ["Doctor", "Nurse"].includes(role) ? providerId : "",
        identifier: finalIdentifier,
      },
    });
  }

  function continueLogin() {
    const clean = identifier.trim();
    if (!clean) {
      setIdentifier(AUTH_ROLE_DETAILS[role].defaultEmail);
      setError("");
      Keyboard.dismiss();
      setStep("otp");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(clean) && !/^\+?\d[\d\s-]{8,14}$/.test(clean)) {
      setError("Enter a valid email or mobile number.");
      return;
    }
    setIdentifier(clean);
    setError("");
    Keyboard.dismiss();
    setStep("otp");
  }

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

  const details = AUTH_ROLE_DETAILS[role];

  return (
    <AuthLayout>
      {step === "options" ? (
        <AuthSignInShell
          role={role}
          height={height}
          error={error}
          onDismissError={() => setError("")}
          onRoleChange={selectRole}
          onOpenMoreRoles={() => setChoosing(true)}
          googleTitle="Enter demo"
          onGooglePress={continueWithGoogle}
          onEmailPress={() => {
            setCreatingAccount(false);
            setError("");
            setStep("email");
          }}
          onCreateAccountPress={() => {
            setCreatingAccount(true);
            setError("");
            setStep("email");
          }}
          onHelpPress={() => setHelpOpen(true)}
          footerNote="Local demo · Fictional data only"
        >
          {(role === "Doctor" || role === "Nurse") && (
            <StaffProfileSelector
              kind={role}
              providerId={providerId}
              onSelect={setProviderId}
            />
          )}
        </AuthSignInShell>
      ) : (
        <>
          <AuthBrandHeader />
          <Entrance key={step}>
            <Card style={{ borderRadius: 24, padding: 20, gap: 16 }}>
              <View style={{ gap: 6 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Touch
                    label="Go back"
                    onPress={() => {
                      setError("");
                      setStep(step === "otp" ? "email" : "options");
                    }}
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
                  <Text
                    style={[
                      styles.title,
                      { fontSize: 20, lineHeight: 26, flexShrink: 1 },
                    ]}
                  >
                    {step === "email"
                      ? creatingAccount
                        ? "Create your account"
                        : "Continue with email"
                      : "Verify your identity"}
                  </Text>
                </View>
                <Body muted>
                  {step === "email"
                    ? `${creatingAccount ? (role !== "Patient" ? "Choose your role and enter" : "Join the demo with") : "Enter"} your email or mobile number. No email or SMS code will arrive. On the next screen, enter 123456 or use the demo autofill button.`
                    : `Demo for ${identifier || "your account"}: no email or SMS code will arrive. Enter 123456 or use the demo autofill button.`}
                </Body>
              </View>

              {!!error && (
                <ErrorBanner
                  message={error}
                  onDismiss={() => setError("")}
                />
              )}

              {step === "email" ? (
                <>
                  {creatingAccount && role !== "Patient" && (
                    <PortalRoleGrid role={role} onSelect={selectRole} />
                  )}

                  {(role === "Doctor" || role === "Nurse") && (
                    <StaffProfileSelector
                      kind={role}
                      providerId={providerId}
                      onSelect={setProviderId}
                    />
                  )}
                  <Field
                    label={details.emailLabel}
                    value={identifier}
                    onChange={(value) => {
                      setIdentifier(value);
                      setError("");
                    }}
                    placeholder={details.defaultEmail}
                    error={error}
                    inputProps={{
                      autoCapitalize: "none",
                      autoCorrect: false,
                      keyboardType: "email-address",
                      autoComplete: "email",
                      returnKeyType: "go",
                      onSubmitEditing: continueLogin,
                    }}
                  />

                  <Button
                    title={
                      creatingAccount
                        ? `Create ${details.title} account`
                        : `Continue as ${details.title}`
                    }
                    icon="arrow-forward"
                    onPress={continueLogin}
                  />
                </>
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
                        Signing in as {details.title}
                      </Text>
                      <Text
                        style={{
                          fontWeight: "700",
                          fontSize: 13,
                          color: theme.ink,
                        }}
                        numberOfLines={1}
                      >
                        {identifier || details.defaultEmail}
                      </Text>
                    </View>
                    <Touch
                      label="Change role or account"
                      onPress={() => {
                        setError("");
                        setStep("email");
                      }}
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

                  <View style={{ gap: 8 }}>
                    <Label>6-digit verification code</Label>
                    <OtpInput
                      value={code}
                      onChange={(value) => {
                        setCode(value);
                        setError("");
                      }}
                      onComplete={(val) => {
                        handleLoginSubmit(val);
                      }}
                      error={error}
                      autoFocus
                    />
                  </View>

                  <Touch
                    label="Auto-fill demo verification code"
                    onPress={() => {
                      setCode("123456");
                      setError("");
                      handleLoginSubmit("123456");
                    }}
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: "#E5F5EF",
                      borderRadius: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Icon name="key-outline" size={15} color={theme.green} />
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.green,
                        fontWeight: "700",
                      }}
                    >
                      Fill demo OTP (123456) & enter
                    </Text>
                  </Touch>

                  <Button
                    title={
                      role === "Doctor"
                        ? "Enter Doctor Portal"
                        : role === "Nurse"
                          ? "Enter Nurse Portal"
                          : "Enter my care space"
                    }
                    icon="arrow-forward"
                    disabled={code.length < 6}
                    onPress={() => handleLoginSubmit(code)}
                  />

                  <Button
                    title="Change login details"
                    secondary
                    onPress={() => {
                      setError("");
                      setStep("email");
                    }}
                  />
                </>
              )}
            </Card>
          </Entrance>

          {step === "email" && (
            <View style={{ alignItems: "center", gap: 4 }}>
              <Touch
                label={
                  creatingAccount
                    ? "Sign in with an existing account"
                    : "Create a BLOOM MED account"
                }
                onPress={() => {
                  setCreatingAccount(!creatingAccount);
                  setError("");
                }}
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

          <AuthFooter note="Local demo · Fictional data only" />
        </>
      )}

      <RoleChooserModal
        visible={choosing}
        role={role}
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
                <Text style={[styles.title, { fontSize: 19, lineHeight: 25 }]}>
                  Get back to your care space
                </Text>
                <Body>
                  In local demo mode, choose Patient or Doctor (or tap Other
                  roles) and continue with Google or email using demo code
                  123456.
                </Body>
                <Body muted>
                  In cloud mode, use the same Google account or verified email
                  address you originally used with BLOOM MED.
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

export function ProfileForm({ onboarding = false }: { onboarding?: boolean }) {
  const { state, dispatch, notify } = useClinic();
  const [profile, setProfile] = useState(state.profile);
  const set = (key: keyof typeof profile, value: string | boolean) =>
    setProfile((p) => ({ ...p, [key]: value }));
  return (
    <Screen
      title={onboarding ? "Make yourself at home" : "Edit your health profile"}
      subtitle="A little context helps your care team."
      back={!onboarding}
      allowed={["Patient"]}
    >
      <Card>
        <View style={styles.row}>
          <Avatar />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Your personal details</Text>
            <Body muted>Use fictional details in this demo.</Body>
          </View>
        </View>
        {(["name", "age", "contact", "address"] as const).map((key) => (
          <Field
            key={key}
            label={
              {
                name: "Full name",
                age: "Age",
                contact: "Emergency contact",
                address: "Home visit address",
              }[key]
            }
            value={profile[key]}
            numeric={key === "age"}
            onChange={(v) => set(key, v)}
          />
        ))}
        <Label>Gender</Label>
        <Chips
          values={["Female", "Male", "Other", "Prefer not to say"]}
          value={profile.gender}
          onChange={(v) => set("gender", v)}
        />
        <Label>Preferred language</Label>
        <Chips
          values={["English", "Hindi", "Malayalam"]}
          value={profile.language}
          onChange={(v) => set("language", v)}
        />
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Your health context</Text>
        {(["conditions", "allergies", "medicines", "notes"] as const).map(
          (key) => (
            <Field
              key={key}
              label={
                {
                  conditions: "Conditions",
                  allergies: "Allergies",
                  medicines: "Current medicines",
                  notes: "Care notes",
                }[key]
              }
              value={profile[key]}
              onChange={(v) => set(key, v)}
              multiline={key === "notes"}
            />
          ),
        )}
      </Card>
      <Button
        title={onboarding ? "Let’s begin" : "Save profile"}
        icon="checkmark"
        onPress={() => {
          if (dispatch({ type: "profile", profile, onboarding })) {
            notify("Your profile is saved.");
            router.replace("/(tabs)");
          }
        }}
      />
      <Body muted>
        Language preference is saved; the demo interface is in English.
      </Body>
    </Screen>
  );
}
