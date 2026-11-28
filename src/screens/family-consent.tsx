import React, { useCallback, useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useClinic } from "../store";
import { cloudMode } from "../cloud-config";
import { formatDate } from "../clinic";
import {
  Body,
  Button,
  Card,
  Chip,
  Confirm,
  Empty,
  Field,
  Icon,
  Screen,
  Section,
  Skeleton,
  styles,
  theme,
  Title,
  Touch,
} from "../components";
import {
  canFamilyAccessLink,
  FAMILY_REVOKE_POLICY,
  resolveLinkStatus,
  type FamilyLink,
} from "../family/policy";
import {
  clearFamilyCache,
  FamilyAccessDeniedError,
  familyApi,
} from "../family/family-api";

function StatusLabel(status: FamilyLink["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function useOptionalAuthToken() {
  const auth = cloudMode ? useAuth : null;
  const hook = auth ? auth() : null;
  return hook?.getToken;
}

export function FamilyConsentScreen() {
  const { state, dispatch, notify } = useClinic();
  const getToken = useOptionalAuthToken();
  const role = state.session?.role;
  const userEmail = state.session?.identifier || "";

  const [links, setLinks] = useState<FamilyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Family member request form
  const [patientEmail, setPatientEmail] = useState("");
  const [requestNotice, setRequestNotice] = useState("");
  const [requestError, setRequestError] = useState("");

  // Patient confirmation modal for revoking access
  const [revoking, setRevoking] = useState<FamilyLink | null>(null);

  const loadLinks = useCallback(async () => {
    if (!role || !["Patient", "Family"].includes(role)) return;
    setLoading(true);
    setLoadError("");
    setDenied(false);
    try {
      const token = getToken ? (await getToken()) ?? undefined : undefined;
      const list =
        role === "Patient"
          ? await familyApi.listForPatient(userEmail, token)
          : await familyApi.listForFamily(userEmail, token);
      setLinks(list);
    } catch (e) {
      if (e instanceof FamilyAccessDeniedError) {
        await clearFamilyCache(userEmail);
        setLinks([]);
        setDenied(true);
      } else {
        setLoadError(
          e instanceof Error
            ? e.message
            : "Could not load family links. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [role, userEmail, getToken]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (active) await loadLinks();
    })();
    return () => {
      active = false;
    };
  }, [loadLinks]);

  if (!state.session) return <Redirect href="/sign-in" />;

  if (!["Patient", "Family"].includes(role || "")) {
    return (
      <Screen title="Family & caregivers" back noGuard>
        <Empty
          title="Access is restricted"
          body="Family linking and consent settings are only available to Patient and Family accounts."
          icon="lock-closed-outline"
        />
      </Screen>
    );
  }

  const isPatient = role === "Patient";

  async function toggleMasterConsent(consent: boolean) {
    const ok = dispatch({
      type: "profile",
      profile: { ...state.profile, consent },
    });
    if (!ok) return;
    if (!consent) {
      await clearFamilyCache();
    }
    notify(
      consent
        ? "Family access restored for active links."
        : "All family access is now paused.",
    );
  }

  async function handleSendRequest() {
    setRequestError("");
    setRequestNotice("");
    setBusy(true);
    try {
      const token = getToken ? (await getToken()) ?? undefined : undefined;
      const result = await familyApi.sendRequest(userEmail, patientEmail, token);
      setPatientEmail("");
      setRequestNotice(result.message);
      dispatch({
        type: "issue",
        subject: "Access: New family request",
      });
      await loadLinks();
    } catch (e) {
      if (e instanceof FamilyAccessDeniedError) {
        await clearFamilyCache(userEmail);
        setDenied(true);
      } else {
        setRequestError(
          e instanceof Error ? e.message : "Could not send request.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept(link: FamilyLink) {
    setBusy(true);
    try {
      const token = getToken ? (await getToken()) ?? undefined : undefined;
      await familyApi.accept(link.id, token);
      notify("Family access approved.");
      await loadLinks();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not approve request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline(link: FamilyLink) {
    setBusy(true);
    try {
      const token = getToken ? (await getToken()) ?? undefined : undefined;
      await familyApi.decline(link.id, token);
      await clearFamilyCache(link.familyEmail);
      dispatch({
        type: "issue",
        subject: "Access: Access removed",
      });
      notify("Family request declined.");
      await loadLinks();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not decline request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(link: FamilyLink) {
    if (FAMILY_REVOKE_POLICY !== "patient_can_revoke") return;
    setBusy(true);
    try {
      const token = getToken ? (await getToken()) ?? undefined : undefined;
      await familyApi.revoke(link.id, token);
      await clearFamilyCache(link.familyEmail);
      dispatch({
        type: "issue",
        subject: "Access: Access removed",
      });
      notify("Family member access removed.");
      await loadLinks();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not remove access.");
    } finally {
      setBusy(false);
    }
  }

  const pendingLinks = links.filter(
    (l) => resolveLinkStatus(l) === "pending",
  );
  const activeLinks = links.filter(
    (l) => resolveLinkStatus(l) === "active",
  );
  const accessibleLinks = links.filter((l) =>
    canFamilyAccessLink(l, state.profile.consent),
  );

  return (
    <Screen
      title="Family & caregivers"
      subtitle={
        isPatient
          ? "Manage consent and linked family caregivers."
          : "Connect to help manage your loved one's care."
      }
      back
      noGuard
    >
      {denied ? (
        <Empty
          title="Access is restricted"
          body="You do not have permission to view this patient's records. Ask the patient to approve your request or enable family consent."
          icon="lock-closed-outline"
          action="Retry"
          onPress={() => void loadLinks()}
        />
      ) : (
        <>
          {/* CONSENT STATUS BANNER */}
          <Card
            style={{
              gap: 12,
              backgroundColor: state.profile.consent ? "#F0FDF4" : "#FFFBEB",
              borderColor: state.profile.consent ? "#86EFAC" : "#FDE68A",
            }}
          >
            <View style={styles.row}>
              <View
                style={[
                  styles.iconBox,
                  {
                    backgroundColor: state.profile.consent
                      ? "#DCFCE7"
                      : "#FEF3C7",
                  },
                ]}
              >
                <Icon
                  name={
                    state.profile.consent
                      ? "shield-checkmark"
                      : "lock-closed-outline"
                  }
                  color={state.profile.consent ? "#16A34A" : "#D97706"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Title small>
                  {state.profile.consent
                    ? "Keep your family close: ON"
                    : "Keep your family close: OFF"}
                </Title>
                <Body muted style={{ fontSize: 13 }}>
                  {isPatient
                    ? state.profile.consent
                      ? "Active family caregivers can view your records and help manage appointments, medicines, and SOS."
                      : "All family access is paused without deleting your active links."
                    : state.profile.consent
                      ? "You can help manage appointments, medicines, SOS, and view shared records."
                      : "Patient has paused family access. Care management and records are locked."}
                </Body>
              </View>
              {isPatient && (
                <Switch
                  accessibilityLabel="Keep your family close consent switch"
                  value={state.profile.consent}
                  trackColor={{ false: "#D9E2E5", true: theme.green }}
                  onValueChange={(val) => void toggleMasterConsent(val)}
                />
              )}
            </View>
          </Card>

          {loading ? (
            <View style={{ gap: 12 }}>
              {[0, 1].map((idx) => (
                <Card key={idx} style={{ gap: 10 }}>
                  <Skeleton width="60%" height={16} />
                  <Skeleton width="85%" height={12} />
                  <Skeleton width="45%" height={36} borderRadius={18} />
                </Card>
              ))}
            </View>
          ) : loadError ? (
            <Empty
              title="Couldn't load family links"
              body={loadError}
              icon="cloud-offline-outline"
              action="Retry"
              onPress={() => void loadLinks()}
            />
          ) : isPatient ? (
            <>
              {/* PATIENT: PENDING REQUESTS WITH PLAIN-LANGUAGE CONSENT */}
              <Section title="Pending requests" />
              {pendingLinks.length === 0 ? (
                <Card>
                  <Body muted>No pending family requests.</Body>
                </Card>
              ) : (
                pendingLinks.map((link) => (
                  <Card key={link.id} style={{ gap: 12 }}>
                    <View
                      style={[styles.row, { justifyContent: "space-between" }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Title small>{link.familyLabel}</Title>
                        <Body muted style={{ fontSize: 12 }}>
                          Requested {formatDate(link.createdAt.slice(0, 10))} ·
                          Expires {formatDate(link.expiresAt.slice(0, 10))}
                        </Body>
                      </View>
                      <Chip title="Pending" />
                    </View>
                    <View
                      style={{
                        backgroundColor: "#F8FAFC",
                        borderRadius: 12,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                      }}
                    >
                      <Body style={{ fontSize: 13 }}>
                        Accepting lets this family caregiver view all of your
                        health records and help manage your appointments,
                        medicine reminders, and SOS alerts. They cannot alter or
                        delete your uploaded clinical records, and you can remove
                        their access at any time.
                      </Body>
                    </View>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Accept"
                          disabled={busy}
                          onPress={() => void handleAccept(link)}
                          style={{ minHeight: 44 }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Decline"
                          secondary
                          disabled={busy}
                          onPress={() => void handleDecline(link)}
                          style={{ minHeight: 44 }}
                        />
                      </View>
                    </View>
                  </Card>
                ))
              )}

              {/* PATIENT: ACTIVE MEMBERS */}
              <Section title="Active family & caregivers" />
              {activeLinks.length === 0 ? (
                <Empty
                  title="No active family members"
                  body="When a family caregiver requests access and you accept, they will appear here."
                  icon="people-outline"
                />
              ) : (
                activeLinks.map((link) => (
                  <Card key={link.id} style={{ gap: 10 }}>
                    <View
                      style={[styles.row, { justifyContent: "space-between" }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Title small>{link.familyLabel}</Title>
                        <Body muted style={{ fontSize: 12 }}>
                          Caregiver · Manage appointments, medicines & view records
                        </Body>
                      </View>
                      <Chip
                        title={state.profile.consent ? "Active" : "Paused"}
                      />
                    </View>
                    {FAMILY_REVOKE_POLICY === "patient_can_revoke" && (
                      <Button
                        title="Remove access"
                        secondary
                        disabled={busy}
                        onPress={() => setRevoking(link)}
                        style={{ minHeight: 44 }}
                      />
                    )}
                  </Card>
                ))
              )}
            </>
          ) : (
            <>
              {/* FAMILY MEMBER: LINK TO A PATIENT */}
              <Section title="Link to a patient" />
              <Card style={{ gap: 12 }}>
                <Body muted style={{ fontSize: 13 }}>
                  Enter the patient&apos;s email address to send a read-only
                  care link request. Access stays pending until they approve.
                </Body>
                <Field
                  label="Patient email"
                  value={patientEmail}
                  onChange={(val) => {
                    setPatientEmail(val);
                    setRequestError("");
                  }}
                  placeholder="patient@example.com"
                  error={requestError}
                  inputProps={{
                    autoCapitalize: "none",
                    autoCorrect: false,
                    keyboardType: "email-address",
                  }}
                />
                {!!requestNotice && (
                  <View
                    style={{
                      backgroundColor: "#F0FDF4",
                      borderColor: "#86EFAC",
                      borderWidth: 1,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.green,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {requestNotice}
                    </Text>
                  </View>
                )}
                <Button
                  title="Send link request"
                  icon="link-outline"
                  disabled={busy}
                  loading={busy}
                  onPress={() => void handleSendRequest()}
                  style={{ minHeight: 44 }}
                />
              </Card>

              {/* FAMILY MEMBER: LINKED PATIENTS */}
              <Section title="Linked patients" />
              {links.length === 0 ? (
                <Empty
                  title="No linked patients yet"
                  body="Send a link request above. Once the patient approves, their records will appear below."
                  icon="people-outline"
                />
              ) : (
                links.map((link) => {
                  const status = resolveLinkStatus(link);
                  return (
                    <Card key={link.id} style={{ gap: 8 }}>
                      <View
                        style={[
                          styles.row,
                          { justifyContent: "space-between" },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Title small>{link.patientLabel}</Title>
                          <Body muted style={{ fontSize: 12 }}>
                            Scope: Manage care & view all records
                          </Body>
                        </View>
                        <Chip title={StatusLabel(status)} />
                      </View>
                    </Card>
                  );
                })
              )}

              {/* FAMILY MEMBER: READ-ONLY PATIENT RECORDS (ACTIVE LINKS ONLY) */}
              {accessibleLinks.length > 0 && (
                <>
                  <Section title="Shared patient records (read-only)" />
                  {state.records.length === 0 ? (
                    <Empty
                      title="No records available"
                      body="When the patient uploads lab reports or prescriptions, you can view them here in read-only mode."
                      icon="folder-open-outline"
                    />
                  ) : (
                    state.records.map((r) => (
                      <Touch
                        key={r.id}
                        label={`View ${r.name} (read-only)`}
                        onPress={() =>
                          router.push({
                            pathname: "/record/[id]",
                            params: { id: r.id },
                          })
                        }
                        style={{ minHeight: 44 }}
                      >
                        <Card>
                          <View style={styles.row}>
                            <View
                              style={[
                                styles.iconBox,
                                { backgroundColor: theme.blue },
                              ]}
                            >
                              <Icon name="document-text-outline" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Title small>{r.name}</Title>
                              <Body muted>
                                {r.category} · {formatDate(r.date)} · Read-only
                              </Body>
                            </View>
                            <Icon name="chevron-forward" size={18} />
                          </View>
                        </Card>
                      </Touch>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      <Confirm
        visible={!!revoking}
        title="Remove family access?"
        body={`${revoking?.familyLabel || "This person"} will immediately lose read-only access to all of your health records, appointments, and care updates.`}
        confirm="Remove access"
        danger
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          const target = revoking;
          setRevoking(null);
          if (target) void handleRevoke(target);
        }}
      />
    </Screen>
  );
}
