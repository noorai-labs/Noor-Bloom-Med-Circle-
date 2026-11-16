import React, { useState } from "react";
import {
  Image,
  Keyboard,
  Modal,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Redirect, router } from "expo-router";
import { AuthLayout } from "../auth-layout";
import { useClinic } from "../store";
import { BloomLogo } from "../branding";
import { cloudMode } from "../cloud-config";
import { GoogleLogin } from "./google-login";
import { brand, doctors, nurses, Role, roles } from "../clinic";
import {
  Avatar,
  Body,
  Button,
  Card,
  Chips,
  Field,
  Entrance,
  Icon,
  IconName,
  Label,
  Screen,
  SlideDownFade,
  Touch,
  styles,
  theme,
  useKeyboardOpen,
} from "../components";
import { WelcomeGate } from "../welcome";

const ROLE_DETAILS: Record<
  Role,
  {
    title: string;
    description: string;
    icon: IconName;
    badgeColor: string;
    iconColor: string;
  }
> = {
  Patient: {
    title: "Patient",
    description: "Book home visits, track daily medicines & view health records",
    icon: "person-outline",
    badgeColor: "#E5F5EF",
    iconColor: "#17674E",
  },
  Doctor: {
    title: "Doctor",
    description: "Conduct consultations, prescribe meds & review records",
    icon: "medkit-outline",
    badgeColor: "#EBF1F7",
    iconColor: "#225674",
  },
  Nurse: {
    title: "Home Nurse",
    description: "Manage assigned home visits, task checklists & nursing notes",
    icon: "fitness-outline",
    badgeColor: "#E6F4F1",
    iconColor: "#1A6F68",
  },
  Family: {
    title: "Family Caregiver",
    description: "Follow loved one's appointments & care with patient consent",
    icon: "people-outline",
    badgeColor: "#FFF4E8",
    iconColor: "#A65A18",
  },
  Admin: {
    title: "Clinic Admin",
    description: "Review provider credentials, approvals & support issues",
    icon: "shield-checkmark-outline",
    badgeColor: "#EDEBF7",
    iconColor: "#4B3D8A",
  },
};
export default function AuthScreen() {
  return (
    <WelcomeGate>
      {cloudMode ? <GoogleLogin /> : <DemoAuthScreen />}
    </WelcomeGate>
  );
}
function DemoAuthScreen() {
  const { state, dispatch } = useClinic();
  const [step, setStep] = useState<"login" | "otp">("login");
  const [role, setRole] = useState<Role>("Patient");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [providerId, setProviderId] = useState("1");
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const keyboardOpen = useKeyboardOpen();
  const { height } = useWindowDimensions();
  const isTyping = keyboardOpen || fieldFocused;

  function continueLogin() {
    const clean = identifier.trim();
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
  const staff = role === "Nurse" ? nurses : doctors;
  const activeStaff = staff.find((p) => p.id === providerId) || staff[0];

  return (
    <AuthLayout>
      <View style={[styles.row, { gap: 10, marginVertical: 4, alignItems: "center" }]}>
        <BloomLogo size={42} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.ink,
              fontSize: 19,
              fontWeight: "800",
              letterSpacing: 1.2,
            }}
          >
            {brand.name}
          </Text>
          <Text style={{ fontSize: 11, color: theme.muted, fontWeight: "500" }}>
            {brand.tagline}
          </Text>
        </View>
      </View>

      {step === "login" && !isTyping && height > 670 && (
        <Image
          source={require("../../assets/care-welcome.png")}
          accessibilityLabel="A care professional supporting a loved one at home"
          style={{
            width: "100%",
            height: Math.min(160, Math.max(110, height - 640)),
            borderRadius: 22,
          }}
          resizeMode="cover"
        />
      )}

      {step === "login" && !isTyping && height > 620 && (
        <View style={{ gap: 4 }}>
          <Text
            style={{
              fontSize: height < 700 ? 22 : 26,
              lineHeight: height < 700 ? 28 : 32,
              color: theme.ink,
              fontWeight: "800",
            }}
          >
            Care that fits into your life.
          </Text>
          <Body muted>Thoughtful care, right at home.</Body>
        </View>
      )}

      <Entrance key={step}>
        <Card
          style={{
            borderRadius: 24,
            padding: 20,
            gap: 16,
          }}
        >
          <View style={{ gap: 4 }}>
            <Text style={[styles.title, { fontSize: 20, lineHeight: 26 }]}>
              {step === "login"
                ? role === "Doctor"
                  ? "Doctor Clinical Portal"
                  : "Your care starts here"
                : "Verify your identity"}
            </Text>
            <Body muted>
              {step === "login"
                ? role === "Doctor"
                  ? "Access patient consultations, care plans, and prescribed medicines."
                  : "Sign in to explore your personalized home care space."
                : `Enter the 6-digit verification code sent to ${identifier || "your account"}.`}
            </Body>
          </View>

          {step === "login" ? (
            <>
              {/* Clean Role Selector Card */}
              <View style={{ gap: 6 }}>
                <Label>Signing in as</Label>
                <Touch
                  label="Change care role"
                  onPress={() => setChoosing(true)}
                  style={{
                    padding: 12,
                    backgroundColor: "#F7FAF8",
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: "#DCEAE2",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: ROLE_DETAILS[role].badgeColor,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      name={ROLE_DETAILS[role].icon}
                      color={ROLE_DETAILS[role].iconColor}
                      size={20}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontWeight: "700",
                        fontSize: 15,
                        color: theme.ink,
                      }}
                    >
                      {role === "Doctor" ? activeStaff.name : ROLE_DETAILS[role].title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.muted,
                        marginTop: 1,
                      }}
                    >
                      {role === "Doctor"
                        ? `${activeStaff.specialty} · Clinical Portal`
                        : role === "Nurse"
                          ? `${activeStaff.name} · ${activeStaff.specialty}`
                          : ROLE_DETAILS[role].description}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: "white",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#DCEAE2",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.green,
                        fontWeight: "700",
                      }}
                    >
                      Switch
                    </Text>
                    <Icon name="chevron-forward" size={13} color={theme.green} />
                  </View>
                </Touch>
              </View>

              <Field
                label={
                  role === "Doctor"
                    ? "Doctor email or staff ID"
                    : "Email or mobile number"
                }
                value={identifier}
                onChange={(value) => {
                  setIdentifier(value);
                  setError("");
                }}
                placeholder={
                  role === "Doctor"
                    ? "dr.aisha@bloommed.in"
                    : "you@example.com"
                }
                error={error}
                inputProps={{
                  autoCapitalize: "none",
                  autoCorrect: false,
                  keyboardType: "email-address",
                  autoComplete: "email",
                  returnKeyType: "go",
                  onSubmitEditing: continueLogin,
                  onFocus: () => setFieldFocused(true),
                  onBlur: () => setFieldFocused(false),
                }}
              />
              <Button
                title={
                  role === "Doctor"
                    ? "Continue as Doctor"
                    : "Continue"
                }
                icon="arrow-forward"
                onPress={continueLogin}
              />
            </>
          ) : (
            <>
              {/* OTP Context Banner */}
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
                    backgroundColor: ROLE_DETAILS[role].badgeColor,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    name={ROLE_DETAILS[role].icon}
                    size={18}
                    color={ROLE_DETAILS[role].iconColor}
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
                    Signing in as {ROLE_DETAILS[role].title}
                  </Text>
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 13,
                      color: theme.ink,
                    }}
                    numberOfLines={1}
                  >
                    {["Doctor", "Nurse"].includes(role)
                      ? `${activeStaff.name} · ${identifier}`
                      : identifier}
                  </Text>
                </View>
              </View>

              <Field
                label="Verification code"
                value={code}
                onChange={(value) => {
                  setCode(value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                placeholder="123456"
                numeric
                error={error}
                inputProps={{
                  maxLength: 6,
                  autoComplete: "one-time-code",
                  textContentType: "oneTimeCode",
                  autoCorrect: false,
                  autoCapitalize: "none",
                  onFocus: () => setFieldFocused(true),
                  onBlur: () => setFieldFocused(false),
                }}
              />

              <Touch
                label="Auto-fill demo verification code"
                onPress={() => {
                  setCode("123456");
                  setError("");
                }}
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: "#E5F5EF",
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="key-outline" size={14} color={theme.green} />
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.green,
                    fontWeight: "700",
                  }}
                >
                  Fill demo OTP (123456)
                </Text>
              </Touch>

              <Button
                title={
                  role === "Doctor"
                    ? "Enter Doctor Portal"
                    : "Enter my care space"
                }
                onPress={() => {
                  if (code !== "123456")
                    return setError("Enter demo code 123456.");
                  if (
                    dispatch({
                      type: "session",
                      session: {
                        role,
                        providerId: ["Doctor", "Nurse"].includes(role)
                          ? providerId
                          : "",
                        identifier,
                      },
                    })
                  ) {
                    Keyboard.dismiss();
                  }
                }}
              />
              <Button
                title="Change login details"
                secondary
                onPress={() => {
                  setError("");
                  setStep("login");
                }}
              />
            </>
          )}
        </Card>
      </Entrance>

      <View
        style={{
          gap: 6,
          alignItems: "center",
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <View
          style={[styles.row, { justifyContent: "center", flexWrap: "wrap", gap: 6 }]}
        >
          <Icon name="shield-checkmark-outline" size={15} color={theme.muted} />
          <Body muted>Local demo · Fictional data only</Body>
        </View>
        <Text
          style={{
            color: theme.muted,
            textAlign: "center",
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          {brand.company} · {brand.tagline}
        </Text>
      </View>

      <Modal
        visible={choosing}
        transparent
        animationType="fade"
        onRequestClose={() => setChoosing(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#162C3585",
            justifyContent: "center",
            alignItems: "center",
            padding: height > 700 ? 20 : 14,
          }}
        >
          <Card
            style={{
              width: "100%",
              maxWidth: 500,
              maxHeight: height > 700 ? "88%" : "94%",
              padding: height > 700 ? 20 : 16,
              gap: 14,
              borderRadius: 24,
              backgroundColor: "white",
            }}
          >
            {/* Modal Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.cardTitle, { fontSize: 20 }]}>
                  Choose your care role
                </Text>
                <Text style={{ fontSize: 13, color: theme.muted, marginTop: 2 }}>
                  Experience BLOOM MED from any perspective.
                </Text>
              </View>
              <Touch
                label="Close role selector"
                onPress={() => setChoosing(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "#F0F4F2",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" size={18} color={theme.ink} />
              </Touch>
            </View>

            {/* Scrollable Role & Professional List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 14, paddingBottom: 6 }}
            >
              {/* Role Cards List with Inline Provider Dropdowns */}
              <View style={{ gap: 10 }}>
                {roles.map((r) => {
                  const details = ROLE_DETAILS[r];
                  const isSelected = role === r;
                  return (
                    <View key={r} style={{ gap: 8 }}>
                      <Touch
                        label={"Select " + details.title}
                        selected={isSelected}
                        onPress={() => {
                          setRole(r);
                          if (r === "Nurse") setProviderId("n1");
                          else if (r === "Doctor") setProviderId("1");
                        }}
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          backgroundColor: isSelected ? "#F3F9F6" : "#FAFCFB",
                          borderWidth: 1.5,
                          borderColor: isSelected ? theme.green : "#E4EDE8",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <View
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 21,
                            backgroundColor: details.badgeColor,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon
                            name={details.icon}
                            size={20}
                            color={details.iconColor}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontWeight: "700",
                              fontSize: 15,
                              color: isSelected ? theme.green : theme.ink,
                            }}
                          >
                            {details.title}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: theme.muted,
                              marginTop: 2,
                              lineHeight: 16,
                            }}
                          >
                            {details.description}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: isSelected ? theme.green : "#CAD7CF",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isSelected ? theme.green : "transparent",
                          }}
                        >
                          {isSelected && (
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: "white",
                              }}
                            />
                          )}
                        </View>
                      </Touch>

                      {/* Doctor Profiles Dropdown directly below Doctor card */}
                      {r === "Doctor" && isSelected && (
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
                                Choose Doctor Profile
                              </Text>
                              <Text style={{ fontSize: 11, color: theme.muted }}>
                                Visits and consultations are scoped to this physician.
                              </Text>
                            </View>
                            <View style={{ gap: 6 }}>
                              {doctors.map((p) => {
                                const isDocSelected = p.id === (providerId || "1");
                                return (
                                  <Touch
                                    key={p.id}
                                    label={"Select " + p.name}
                                    selected={isDocSelected}
                                    onPress={() => setProviderId(p.id)}
                                    style={{
                                      padding: 10,
                                      borderRadius: 12,
                                      backgroundColor: isDocSelected ? "#E5F5EF" : "#FFFFFF",
                                      borderWidth: 1.5,
                                      borderColor: isDocSelected ? theme.green : "#E4EDE8",
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
                                            color: isDocSelected ? theme.green : theme.ink,
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
                                    {isDocSelected && (
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
                      )}

                      {/* Nurse Profiles Dropdown directly below Nurse card */}
                      {r === "Nurse" && isSelected && (
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
                                Choose Nurse Profile
                              </Text>
                              <Text style={{ fontSize: 11, color: theme.muted }}>
                                Home visit queues are scoped to this nurse.
                              </Text>
                            </View>
                            <View style={{ gap: 6 }}>
                              {nurses.map((p) => {
                                const isNurseSelected = p.id === (providerId || "n1");
                                return (
                                  <Touch
                                    key={p.id}
                                    label={"Select " + p.name}
                                    selected={isNurseSelected}
                                    onPress={() => setProviderId(p.id)}
                                    style={{
                                      padding: 10,
                                      borderRadius: 12,
                                      backgroundColor: isNurseSelected ? "#E5F5EF" : "#FFFFFF",
                                      borderWidth: 1.5,
                                      borderColor: isNurseSelected ? theme.green : "#E4EDE8",
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
                                            color: isNurseSelected ? theme.green : theme.ink,
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
                                    {isNurseSelected && (
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
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <Button
              title={`Continue as ${ROLE_DETAILS[role].title}`}
              icon="arrow-forward"
              onPress={() => setChoosing(false)}
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
