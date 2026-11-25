import React, { useState, useSyncExternalStore } from "react";
import {
  Image,
  ImageSourcePropType,
  Modal,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { BloomLogo } from "./branding";
import { brand, Role, roles } from "./clinic";
import {
  Body,
  Button,
  Card,
  Entrance,
  ErrorBanner,
  Icon,
  IconName,
  Label,
  Touch,
  styles,
  theme,
} from "./components";

export const AUTH_ROLE_DETAILS: Record<
  Role,
  {
    title: string;
    description: string;
    portalTitle: string;
    portalSubtitle: string;
    caption: string;
    emailLabel: string;
    defaultEmail: string;
    icon: IconName;
    badgeColor: string;
    iconColor: string;
  }
> = {
  Patient: {
    title: "Patient",
    description: "Book home visits, track daily medicines & view health records",
    portalTitle: "Your care starts here",
    portalSubtitle: "Sign in to explore your personalized home care space.",
    caption: "Home visits, daily meds & records",
    emailLabel: "Email or mobile number",
    defaultEmail: "patient@bloommed.in",
    icon: "person-outline",
    badgeColor: "#E5F5EF",
    iconColor: "#17674E",
  },
  Doctor: {
    title: "Doctor",
    description: "Conduct consultations, prescribe meds & review records",
    portalTitle: "Doctor Clinical Portal",
    portalSubtitle:
      "Doctor workspace - Professional approval and patient assignment required.",
    caption: "Clinical portal, consults & prescriptions",
    emailLabel: "Doctor email",
    defaultEmail: "doctor@bloommed.in",
    icon: "medkit-outline",
    badgeColor: "#EBF1F7",
    iconColor: "#225674",
  },
  Nurse: {
    title: "Home Nurse",
    description: "Manage assigned home visits, task checklists & nursing notes",
    portalTitle: "Home Nurse Portal",
    portalSubtitle:
      "Manage assigned home visits, patient checklists & notes.",
    caption: "Home Nurse role active",
    emailLabel: "Nurse email",
    defaultEmail: "nurse@bloommed.in",
    icon: "fitness-outline",
    badgeColor: "#E6F4F1",
    iconColor: "#1A6F68",
  },
  Family: {
    title: "Family Caregiver",
    description: "Follow loved one's appointments & care with patient consent",
    portalTitle: "Family Caregiver Portal",
    portalSubtitle:
      "Follow your loved one's visits, medicines, and care updates with consent.",
    caption: "Family Caregiver role active",
    emailLabel: "Family caregiver email",
    defaultEmail: "family@bloommed.in",
    icon: "people-outline",
    badgeColor: "#FFF4E8",
    iconColor: "#A65A18",
  },
  Admin: {
    title: "Clinic Admin",
    description: "Review provider credentials, approvals & support issues",
    portalTitle: "Clinic Admin Portal",
    portalSubtitle:
      "Review provider credentials, approvals, and clinic support requests.",
    caption: "Clinic Admin role active",
    emailLabel: "Clinic admin email",
    defaultEmail: "admin@bloommed.in",
    icon: "shield-checkmark-outline",
    badgeColor: "#EDEBF7",
    iconColor: "#4B3D8A",
  },
};

export const PORTAL_SIGNUP_ROWS: [Role, Role][] = [
  ["Doctor", "Nurse"],
  ["Family", "Admin"],
];

let portalRoleState: Role = "Patient";
const portalRoleListeners = new Set<() => void>();

export function setPortalRole(next: Role) {
  if (portalRoleState === next) return;
  portalRoleState = next;
  portalRoleListeners.forEach((listener) => listener());
}

export function usePortalRole(): Role {
  return useSyncExternalStore(
    (listener) => {
      portalRoleListeners.add(listener);
      return () => {
        portalRoleListeners.delete(listener);
      };
    },
    () => portalRoleState,
    () => portalRoleState,
  );
}

const ROLE_HERO_CONFIG: Record<
  Role,
  {
    image: ImageSourcePropType;
    alt: string;
    headline: string;
    subtitle: string;
  }
> = {
  Patient: {
    image: require("../assets/care-welcome.png"),
    alt: "A care professional supporting a loved one at home",
    headline: "Care that fits into your life.",
    subtitle: "Thoughtful care, right at home.",
  },
  Doctor: {
    image: require("../assets/doctor-login-care-v1.png"),
    alt: "A doctor speaking with a patient in a consultation",
    headline: "Care starts with you.",
    subtitle:
      "Appointments, patient records and consultations in one workspace.",
  },
  Nurse: {
    image: require("../assets/nurse-login-care-v1.jpg"),
    alt: "A home nurse checking a patient's blood pressure comfortably at home",
    headline: "Compassionate care at home.",
    subtitle:
      "Assigned home visits, vitals checklists and nursing notes in one place.",
  },
  Family: {
    image: require("../assets/family-login-care-v1.jpg"),
    alt: "Family members smiling and supporting their elderly mother at home",
    headline: "Stay close to every care moment.",
    subtitle:
      "Follow appointments, medicines and updates with patient consent.",
  },
  Admin: {
    image: require("../assets/admin-login-care-v1.jpg"),
    alt: "A clinic operations coordinator managing care schedules at a sunlit desk",
    headline: "Keep every care team connected.",
    subtitle: "Review credentials, manage approvals and support operations.",
  },
};

export function AuthBrandHeader() {
  return (
    <View
      style={[
        styles.row,
        { gap: 10, marginVertical: 2, alignItems: "center" },
      ]}
    >
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
  );
}

export function AuthHeroSection({
  role,
  showImage = true,
  height,
}: {
  role: Role;
  showImage?: boolean;
  height: number;
}) {
  const hero = ROLE_HERO_CONFIG[role];
  return (
    <>
      {showImage && height > 650 && (
        <Image
          key={role}
          source={hero.image}
          accessibilityLabel={hero.alt}
          style={{
            width: "100%",
            height: Math.min(156, Math.max(108, height - 650)),
            borderRadius: 22,
          }}
          resizeMode="cover"
        />
      )}
      {height > 600 && (
        <View style={{ gap: 4 }}>
          <Text
            style={{
              fontSize: height < 700 ? 22 : 26,
              lineHeight: height < 700 ? 28 : 32,
              color: theme.ink,
              fontWeight: "800",
            }}
          >
            {hero.headline}
          </Text>
          <Body muted>{hero.subtitle}</Body>
        </View>
      )}
    </>
  );
}

export function RolePerspectiveSwitch({
  value,
  onChange,
  caption,
  rightActionLabel,
  onRightAction,
  disabled,
}: {
  value: Role;
  onChange: (role: "Patient" | "Doctor") => void;
  caption: string;
  rightActionLabel?: string;
  onRightAction?: () => void;
  disabled?: boolean;
}) {
  const isPatient = value === "Patient";
  const isDoctor = value === "Doctor";

  return (
    <View style={{ gap: 8 }}>
      <Label>Select care perspective</Label>
      <View
        style={{
          flexDirection: "row",
          gap: 6,
          backgroundColor: "#EEF4F1",
          padding: 4,
          borderRadius: 16,
          width: "100%",
        }}
      >
        <View style={{ flex: 1 }}>
          <Touch
            label="Patient perspective"
            selected={isPatient}
            disabled={disabled}
            onPress={() => onChange("Patient")}
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: isPatient ? "white" : "transparent",
              borderWidth: isPatient ? 1 : 0,
              borderColor: isPatient ? "#DCEAE2" : "transparent",
              shadowColor: isPatient ? "#000" : "transparent",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isPatient ? 0.08 : 0,
              shadowRadius: 3,
              elevation: isPatient ? 2 : 0,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: isPatient ? "#E5F5EF" : "#E2EBE6",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name="person-outline"
                size={16}
                color={isPatient ? theme.green : theme.muted}
              />
            </View>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: isPatient ? theme.ink : theme.muted,
              }}
            >
              Patient
            </Text>
          </Touch>
        </View>

        <View style={{ flex: 1 }}>
          <Touch
            label="Doctor perspective"
            selected={isDoctor}
            disabled={disabled}
            onPress={() => onChange("Doctor")}
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: isDoctor ? "white" : "transparent",
              borderWidth: isDoctor ? 1 : 0,
              borderColor: isDoctor ? "#DCEAE2" : "transparent",
              shadowColor: isDoctor ? "#000" : "transparent",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDoctor ? 0.08 : 0,
              shadowRadius: 3,
              elevation: isDoctor ? 2 : 0,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: isDoctor ? "#EBF1F7" : "#E2EBE6",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name="medkit-outline"
                size={16}
                color={isDoctor ? "#225674" : theme.muted}
              />
            </View>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: isDoctor ? theme.ink : theme.muted,
              }}
            >
              Doctor
            </Text>
          </Touch>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 2,
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 12, color: theme.muted, flexShrink: 1 }}>
          {caption}
        </Text>
        {!!rightActionLabel && !!onRightAction && (
          <Touch
            label="More roles"
            disabled={disabled}
            onPress={onRightAction}
            style={{ paddingVertical: 2, paddingHorizontal: 4 }}
          >
            <Text
              style={{
                fontSize: 12,
                color: theme.green,
                fontWeight: "700",
              }}
            >
              {rightActionLabel}
            </Text>
          </Touch>
        )}
      </View>
    </View>
  );
}

export function PortalRoleGrid({
  role,
  onSelect,
  disabled,
  availableRoles = roles,
}: {
  availableRoles?: Role[];
  role: Role;
  onSelect: (next: Role) => void;
  disabled?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState(0);
  const singleColumn = availableWidth / fontScale < 340;
  return (
    <View
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      style={{ gap: 10 }}
    >
      <Label>Select your role</Label>
      <View style={{ gap: 8 }}>
        {PORTAL_SIGNUP_ROWS.map((row, rowIndex) => (
          <View
            key={rowIndex}
            style={{ flexDirection: singleColumn ? "column" : "row", gap: 8 }}
          >
            {row
              .filter((r) => availableRoles.includes(r))
              .map((r) => {
                const details = AUTH_ROLE_DETAILS[r];
                const active = role === r;
                return (
                  <View key={r} style={{ flex: 1 }}>
                    <Touch
                      label={`Select ${details.title}`}
                      selected={active}
                      disabled={disabled}
                      onPress={() => onSelect(r)}
                      style={{
                        width: "100%",
                        minHeight: 54,
                        paddingVertical: 10,
                        paddingHorizontal: 10,
                        borderRadius: 15,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        backgroundColor: active ? "#F2FAF7" : "#FAFCFB",
                        borderWidth: active ? 1.5 : 1,
                        borderColor: active ? theme.green : "#E2ECE7",
                        shadowColor: active ? theme.green : "transparent",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: active ? 0.08 : 0,
                        shadowRadius: 3,
                        elevation: active ? 1 : 0,
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          backgroundColor: active
                            ? details.badgeColor
                            : "#ECF1EF",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon
                          name={details.icon}
                          size={15}
                          color={active ? details.iconColor : theme.muted}
                        />
                      </View>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 13,
                          lineHeight: 16,
                          fontWeight: active ? "700" : "600",
                          color: active ? theme.ink : theme.muted,
                        }}
                      >
                        {details.title}
                      </Text>
                    </Touch>
                  </View>
                );
              })}
          </View>
        ))}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          backgroundColor: "#F4F8F6",
          paddingVertical: 8,
          paddingHorizontal: 11,
          borderRadius: 12,
        }}
      >
        <Icon
          name={AUTH_ROLE_DETAILS[role].icon}
          size={14}
          color={AUTH_ROLE_DETAILS[role].iconColor}
        />
        <Text
          style={{
            flex: 1,
            fontSize: 12,
            lineHeight: 17,
            color: theme.muted,
          }}
        >
          {AUTH_ROLE_DETAILS[role].description}
        </Text>
      </View>
    </View>
  );
}

export function RoleChooserModal({
  visible,
  role,
  onSelect,
  onClose,
  availableRoles = roles,
}: {
  availableRoles?: Role[];
  visible: boolean;
  role: Role;
  onSelect: (next: Role) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#162C3585",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 28,
            padding: 20,
            maxHeight: "88%",
            maxWidth: 460,
            width: "100%",
            alignSelf: "center",
            gap: 16,
          }}
        >
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
                Experience MedBloom from any perspective.
              </Text>
            </View>
            <Touch
              label="Close role selector"
              onPress={onClose}
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

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 6 }}
          >
            {availableRoles
              .filter((r) => r !== "Patient")
              .map((r) => {
                const details = AUTH_ROLE_DETAILS[r];
                const isSelected = role === r;
                return (
                  <Touch
                    key={r}
                    label={"Select " + details.title}
                    selected={isSelected}
                    onPress={() => onSelect(r)}
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
                        backgroundColor: isSelected
                          ? theme.green
                          : "transparent",
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
                );
              })}
          </ScrollView>

          <Button
            title={`Continue as ${AUTH_ROLE_DETAILS[role].title}`}
            icon="arrow-forward"
            onPress={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

/** Shared sign-in landing UI rendered identically in both Local and Cloud modes. */
export function AuthSignInShell({
  role,
  height,
  busy,
  actionsDisabled,
  googleTitle = "Continue with Google",
  notice,
  error,
  onDismissError,
  onRoleChange,
  onOpenMoreRoles,
  onGooglePress,
  onEmailPress,
  onCreateAccountPress,
  onHelpPress,
  footerNote,
  children,
}: {
  children?: React.ReactNode;
  role: Role;
  height: number;
  busy?: boolean;
  actionsDisabled?: boolean;
  googleTitle?: string;
  notice?: string;
  error?: string;
  onDismissError?: () => void;
  onRoleChange: (next: "Patient" | "Doctor") => void;
  onOpenMoreRoles: () => void;
  onGooglePress: () => void;
  onEmailPress: () => void;
  onCreateAccountPress: () => void;
  onHelpPress: () => void;
  footerNote: string;
}) {
  const details = AUTH_ROLE_DETAILS[role];
  const disabled = Boolean(busy || actionsDisabled);

  return (
    <>
      <AuthBrandHeader />
      <AuthHeroSection role={role} showImage={!error} height={height} />
      <Entrance>
        <Card style={{ borderRadius: 24, padding: 20, gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Text style={[styles.title, { fontSize: 20, lineHeight: 26 }]}>
              {details.portalTitle}
            </Text>
            <Body muted>{details.portalSubtitle}</Body>
          </View>

          <RolePerspectiveSwitch
            value={role}
            disabled={busy}
            onChange={onRoleChange}
            caption={details.caption}
            rightActionLabel={
              role === "Patient"
                ? undefined
                : role === "Doctor"
                  ? "Other roles ▾"
                  : "Switch role ▾"
            }
            onRightAction={role === "Patient" ? undefined : onOpenMoreRoles}
          />

          {children}
          {!!notice && <Body muted>{notice}</Body>}

          <View style={{ gap: 12 }}>
            <Button
              title={googleTitle}
              icon="logo-google"
              disabled={disabled}
              onPress={onGooglePress}
            />
            <Button
              title="Continue with email"
              outline
              icon="mail-outline"
              disabled={disabled}
              onPress={onEmailPress}
            />
          </View>

          {!!error && (
            <ErrorBanner message={error} onDismiss={onDismissError} />
          )}
        </Card>
      </Entrance>

      <View style={{ alignItems: "center", gap: 4 }}>
        <Touch
          label="Create a MedBloom account"
          disabled={disabled}
          onPress={onCreateAccountPress}
          style={{ paddingVertical: 8, paddingHorizontal: 14 }}
        >
          <Text style={{ fontSize: 13, color: theme.muted }}>
            New to MedBloom?{" "}
            <Text style={{ color: theme.green, fontWeight: "700" }}>
              Create account
            </Text>
          </Text>
        </Touch>
        <Touch
          label="Sign-in help"
          onPress={onHelpPress}
          style={{ paddingVertical: 6, paddingHorizontal: 16 }}
        >
          <Text style={{ fontSize: 12, color: theme.muted }}>
            Need help signing in?
          </Text>
        </Touch>
      </View>

      <AuthFooter note={footerNote} />
    </>
  );
}

export function AuthFooter({ note }: { note: string }) {
  return (
    <View
      style={{
        gap: 6,
        alignItems: "center",
        paddingTop: 6,
        paddingBottom: 8,
      }}
    >
      <View
        style={[
          styles.row,
          { justifyContent: "center", flexWrap: "wrap", gap: 6 },
        ]}
      >
        <Icon name="shield-checkmark-outline" size={15} color={theme.muted} />
        <Body muted>{note}</Body>
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
  );
}
