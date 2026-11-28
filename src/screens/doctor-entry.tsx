import { doctorDashboardId } from "../care-space-ids";
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useClinic } from "../store";
import { setLoginAudience, useLoginAudience } from "../login-audience";
import { BloomLogo } from "../branding";
import {
  Body,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Icon,
  Label,
  Screen,
  Skeleton,
  styles,
  theme,
  Title,
  Touch,
} from "../components";
import type { VerificationSnapshot } from "../verification-types";
import {
  clearSelectedOrganization,
  clearWorkspaceRequests,
  fetchOrganizations,
  type Organization,
  saveSelectedOrganization,
  getSelectedOrganization,
} from "../organizations";

function OrgFilterRow({
  items,
  value,
  onChange,
}: {
  items: { label: string; flex?: number }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map((item) => {
        const active = value === item.label;
        return (
          <Touch
            key={item.label}
            label={item.label}
            selected={active}
            onPress={() => onChange(item.label)}
            style={{
              flex: item.flex ?? 1,
              paddingVertical: 9,
              paddingHorizontal: 6,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? theme.green : "white",
              borderWidth: 1,
              borderColor: active ? theme.green : theme.border,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11.5,
                fontWeight: "600",
                color: active ? "white" : theme.ink,
                textAlign: "center",
              }}
            >
              {item.label}
            </Text>
          </Touch>
        );
      })}
    </View>
  );
}

export default function DoctorEntry() {
  const params = useLocalSearchParams<{ step?: string }>();
  const { state, cloud, notify } = useClinic();
  const { audience, ready } = useLoginAudience();
  const client = useRef(cloud?.verification);
  const directory = useRef(cloud?.directory);
  useEffect(() => {
    directory.current = cloud?.directory;
    client.current = cloud?.verification;
  }, [cloud]);

  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<VerificationSnapshot | null>(
    null,
  );
  const [verificationLoading, setVerificationLoading] = useState(!!cloud?.verification);
  const [verificationError, setVerificationError] = useState("");
  const [verificationTicket, setVerificationTicket] = useState(0);
  const [step, setStep] = useState<"setup" | "org-search">(
    params.step === "org-search" ? "org-search" : "setup",
  );
  const [prevParamStep, setPrevParamStep] = useState(params.step);
  if (params.step !== prevParamStep) {
    setPrevParamStep(params.step);
    if (params.step === "org-search") {
      setStep("org-search");
    }
  }
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [filterType, setFilterType] = useState("All");
  const [filterCity, setFilterCity] = useState("All");

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState("");
  const [orgRetryTicket, setOrgRetryTicket] = useState(0);

  useEffect(() => {
    let active = true;
    void getSelectedOrganization().then((saved) => {
      if (active && saved) {
        setSelectedOrg(saved);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (step !== "org-search") return;
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setOrgLoading(true);
      setOrgError("");
      try {
        const result: Organization[] = directory.current
          ? (await directory.current.organizations(debouncedQuery)).map((org) => ({
              ...org, city: "", state: "", type: "Clinic System",
              licenseNumber: "", verified: true, departments: [],
              description: "", badge: org.code || org.name.slice(0, 2),
            }))
          : await fetchOrganizations(debouncedQuery, filterType, filterCity);
        if (active) setOrgs(result);
      } catch (e) {
        if (active) {
          setOrgs([]);
          setOrgError(
            e instanceof Error
              ? e.message
              : "Couldn't load organizations. Please try again.",
          );
        }
      } finally {
        if (active) setOrgLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [step, debouncedQuery, filterType, filterCity, orgRetryTicket]);

  useEffect(() => {
    if (!client.current) return;
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setVerificationLoading(true);
      setVerificationError("");
      try {
        const value = await client.current!.request<VerificationSnapshot>("");
        if (active) setVerification(value);
      } catch (e) {
        if (active) {
          setVerificationError(
            e instanceof Error
              ? e.message
              : "Couldn't load verification status. Please try again.",
          );
        }
      } finally {
        if (active) setVerificationLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [state.session?.identifier, verificationTicket]);

  if (!ready) return null;
  if (!state.session) return <Redirect href="/sign-in" />;
  if (state.session.role === "Doctor" || audience === "Patient")
    return <Redirect href="/(tabs)" />;

  const application = verification?.applications.find(
    (item) => item.kind === "Doctor",
  );
  const spaces = cloud?.spaces.filter((space) => space.role === "Doctor") || [];

  const isApproved = application?.status === "Approved";
  const isSubmitted = application?.status === "Submitted";
  const isNeedsInfo =
    application?.status === "Needs information" ||
    application?.status === "Rejected";

  const dashboardId = doctorDashboardId(state.session.identifier);
  const dashboard = spaces.find((space) => space.id === dashboardId);
  const assigned = spaces.filter((space) => space.id !== dashboardId);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectOrg(org: Organization) {
    setSelectedOrg(org);
    await saveSelectedOrganization(org);
  }

  async function handleContinueToUpload(org: Organization) {
    setSelectedOrg(org);
    await saveSelectedOrganization(org);
    router.push({
      pathname: "/verification",
      params: {
        kind: "Doctor",
        orgId: org.id,
        orgName: org.name,
      },
    });
  }

  // Dedicated Step: Organization Search & Selection (new or editable applicant)
  if ((!application || isNeedsInfo) && step === "org-search") {
    return (
      <Screen title="Select your organization" noGuard>
        <Touch
          label="Back to doctor setup"
          onPress={() => setStep("setup")}
          style={[styles.row, { alignSelf: "flex-start", paddingVertical: 4 }]}
        >
          <Icon name="arrow-back" size={18} color={theme.green} />
          <Text style={{ color: theme.green, fontWeight: "700", fontSize: 14 }}>
            Back to doctor setup
          </Text>
        </Touch>

        <Card style={{ gap: 10 }}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: theme.mint }]}>
              <Icon name="business-outline" />
            </View>
            <View style={{ flex: 1 }}>
              <Title small>Find your hospital or clinic</Title>
              <Body muted style={{ fontSize: 13 }}>
                Verification is reviewed against the organization you belong to.
              </Body>
            </View>
          </View>

          <Field
            label="Search organization"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={cloud ? "Search by organization name or code" : "Search by hospital, clinic name or city..."}
          />

          {!cloud && <>
          <View style={{ gap: 6 }}>
            <Label>TYPE</Label>
            <OrgFilterRow
              items={[
                { label: "All", flex: 0.55 },
                { label: "Clinic System", flex: 1 },
                { label: "Hospital Network", flex: 1.2 },
                { label: "Medical Center", flex: 1.05 },
              ]}
              value={filterType}
              onChange={setFilterType}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Label>CITY</Label>
            <OrgFilterRow
              items={[
                { label: "All", flex: 0.6 },
                { label: "Bengaluru", flex: 1 },
                { label: "New Delhi", flex: 1 },
              ]}
              value={filterCity}
              onChange={setFilterCity}
            />
          </View>
          </>}
        </Card>

        {!orgLoading && !orgError && (
          <Text
            style={{
              fontSize: 12,
              fontWeight: "800",
              color: theme.muted,
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}
          >
            Organizations ({orgs.length})
          </Text>
        )}

        {orgLoading && (
          <View style={{ gap: 10 }}>
            {[0, 1, 2].map((idx) => (
              <Card key={idx} style={{ gap: 10 }}>
                <View style={styles.row}>
                  <Skeleton width={38} height={38} borderRadius={19} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width="65%" height={15} />
                    <Skeleton width="45%" height={12} />
                  </View>
                </View>
                <Skeleton width="90%" height={12} />
              </Card>
            ))}
          </View>
        )}

        {!orgLoading && !!orgError && (
          <Empty
            title="Couldn't load organizations"
            body={orgError}
            icon="cloud-offline-outline"
            action="Retry"
            onPress={() => setOrgRetryTicket((t) => t + 1)}
          />
        )}

        {!orgLoading &&
          !orgError &&
          orgs.map((org) => {
            const isSelected = selectedOrg?.id === org.id;
            return (
              <Touch
                key={org.id}
                label={"Select " + org.name}
                onPress={() => void handleSelectOrg(org)}
              >
                <Card
                  style={{
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? theme.green : theme.border,
                    backgroundColor: isSelected ? "#F0FDF4" : "white",
                    gap: 10,
                  }}
                >
                  <View style={[styles.row, { justifyContent: "space-between" }]}>
                    <View style={styles.row}>
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          backgroundColor: isSelected ? theme.green : theme.mint,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: isSelected ? "white" : theme.green,
                            fontWeight: "800",
                            fontSize: 13,
                          }}
                        >
                          {org.badge}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Title small>{org.name}</Title>
                        <Body muted style={{ fontSize: 12 }}>
                          {cloud ? org.badge : `${org.city}, ${org.state} · ${org.type}`}
                        </Body>
                      </View>
                    </View>
                    {isSelected && (
                      <View
                        style={[
                          styles.iconBox,
                          {
                            backgroundColor: theme.green,
                            width: 26,
                            height: 26,
                            borderRadius: 13,
                          },
                        ]}
                      >
                        <Icon name="checkmark" color="white" size={16} />
                      </View>
                    )}
                  </View>

                  <Body style={{ fontSize: 12 }}>{org.description}</Body>

                  <View style={[styles.row, { flexWrap: "wrap", gap: 6 }]}>
                    {org.departments.slice(0, 3).map((dep) => (
                      <Chip key={dep} title={dep} />
                    ))}
                  </View>
                </Card>
              </Touch>
            );
          })}

        {!orgLoading && !orgError && orgs.length === 0 && (
          <Empty
            title="No organizations found"
            body="Try adjusting your search query, organization type, or city filter."
            icon="business-outline"
          />
        )}

        {selectedOrg && (
          <Card
            style={{
              gap: 10,
              backgroundColor: "#F7FAF8",
              borderColor: theme.green,
            }}
          >
            <Title small>Selected: {selectedOrg.name}</Title>
            <Body muted style={{ fontSize: 12 }}>
              {cloud ? selectedOrg.badge : `${selectedOrg.city}, ${selectedOrg.state} · License: ${selectedOrg.licenseNumber}`}
            </Body>
            <Button
              title="Continue to verification documents"
              icon="document-text-outline"
              disabled={busy}
              onPress={() => void handleContinueToUpload(selectedOrg)}
            />
          </Card>
        )}
      </Screen>
    );
  }

  return (
    <Screen title="Your doctor account" noGuard>
      <View
        style={{
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
        }}
      >
        <BloomLogo size={52} />
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: theme.green,
            letterSpacing: 1.2,
          }}
        >
          MED BLOOM
        </Text>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: theme.ink,
            textAlign: "center",
            lineHeight: 30,
          }}
        >
          Welcome to your doctor workspace
        </Text>
        <Body
          muted
          style={{ textAlign: "center", fontSize: 13, lineHeight: 18 }}
        >
          Doctor access is managed separately from patient access. Professional approval opens Doctor Home.
          Patient workspaces are assigned separately.
        </Body>
      </View>

      {/* LOADING / ERROR BANNER FOR VERIFICATION */}
      {verificationLoading && !verification && (
        <Card style={{ gap: 10 }}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="90%" height={12} />
          <Skeleton width="45%" height={36} borderRadius={18} />
        </Card>
      )}

      {!!verificationError && (
        <Empty
          title="Couldn't load application status"
          body={verificationError}
          icon="cloud-offline-outline"
          action="Retry"
          onPress={() => setVerificationTicket((t) => t + 1)}
        />
      )}

      {/* STATE 1: ALREADY APPROVED */}
      {isApproved && (
        <Card
          style={{
            gap: 14,
            backgroundColor: "#F0FDF4",
            borderColor: "#86EFAC",
          }}
        >
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: "#DCFCE7" }]}>
              <Icon name="checkmark-circle" color="#16A34A" />
            </View>
            <View style={{ flex: 1 }}>
              <Title small>Professional verification approved</Title>
              <Body muted style={{ fontSize: 13 }}>
                Your credentials have been verified. You can now open Doctor Home
                and browse or join organization workspaces.
              </Body>
            </View>
          </View>
          <Button
            title="Open Doctor Home"
            icon="arrow-forward"
            disabled={!dashboard || busy}
            onPress={() => void run(async () => {
              if (dashboard && cloud) await cloud.select(dashboard.id);
              router.push("/(tabs)");
            })}
          />
        </Card>
      )}

      {/* STATE 2: ALREADY SUBMITTED (WAIT FOR REVIEW) */}
      {isSubmitted && (
        <Card
          style={{
            gap: 14,
            backgroundColor: "#F8FAFC",
            borderColor: "#E2E8F0",
          }}
        >
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: "#E0F2FE" }]}>
              <Icon name="time-outline" color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Title small>Application under review</Title>
              <Body muted style={{ fontSize: 13 }}>
                Your application has been submitted and is awaiting review by the
                organization administrators.
              </Body>
            </View>
          </View>

          <View
            style={{
              backgroundColor: "white",
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              gap: 6,
            }}
          >
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={{ fontWeight: "700", color: theme.ink }}>
                {application?.details?.organizationName ||
                  selectedOrg?.name ||
                  "Healthcare Network"}
              </Text>
              <Chip title="Under Review" />
            </View>
            <Body muted style={{ fontSize: 12 }}>
              Council: {application?.details?.authority || "Medical Council"} ·
              Reg: {application?.details?.registrationNumber || "Pending"}
            </Body>
            {application?.details?.specialty ? (
              <Body muted style={{ fontSize: 12 }}>
                Specialty: {application.details.specialty}
              </Body>
            ) : null}
            <Body muted style={{ fontSize: 12 }}>
              Submitted {application?.documents?.length || 0} verification
              document(s)
              {application?.submittedAt
                ? ` · ${new Date(application.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                : ""}
            </Body>
          </View>

          <Button
            title="View doctor application"
            onPress={() =>
              router.push({
                pathname: "/verification",
                params: { kind: "Doctor" },
              })
            }
          />

          <Button
            title={busy ? "Checking..." : "Refresh verification status"}
            secondary
            disabled={busy}
            loading={busy}
            onPress={() =>
              void run(async () => {
                await cloud?.refresh();
                if (cloud)
                  setVerification(
                    await cloud.verification.request<VerificationSnapshot>(""),
                  );
              })
            }
          />
        </Card>
      )}

      {/* STATE 3: NEEDS INFORMATION / REJECTED */}
      {isNeedsInfo && (
        <Card
          style={{
            gap: 14,
            backgroundColor: "#FFFBEB",
            borderColor: "#FDE68A",
          }}
        >
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: "#FEF3C7" }]}>
              <Icon name="alert-circle" color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Title small>More information needed</Title>
              <Body muted style={{ fontSize: 13 }}>
                The reviewing administrator requested additional documentation or
                clarification before approval.
              </Body>
            </View>
          </View>

          {application?.reason ? (
            <View
              style={{
                backgroundColor: "white",
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#FDE68A",
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "700", color: "#B45309" }}
              >
                Reviewer feedback:
              </Text>
              <Text style={{ fontSize: 13, color: theme.ink, marginTop: 4 }}>
                {application.reason}
              </Text>
            </View>
          ) : null}

          <Button
            title="Update verification documents"
            icon="document-text-outline"
            onPress={() =>
              router.push({
                pathname: "/verification",
                params: { kind: "Doctor" },
              })
            }
          />
        </Card>
      )}

      {/* STATE 4: NEW APPLICANT SETUP CARD */}
      {!application && (
        <Card style={{ gap: 14 }}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: theme.mint }]}>
              <Icon name="document-text-outline" />
            </View>
            <View style={{ flex: 1 }}>
              <Title small>Professional verification</Title>
              <Body muted style={{ fontSize: 13 }}>
                Select your organization first, then submit your registration and
                supporting documents for manual review.
              </Body>
            </View>
          </View>
          {selectedOrg && (
            <Body muted style={{ fontSize: 12 }}>
              Selected organization: {selectedOrg.name}
            </Body>
          )}
          <Button
            title="Apply as a doctor"
            disabled={busy}
            onPress={() => setStep("org-search")}
          />
        </Card>
      )}

      {/* ASSIGNED WORKSPACES */}
      <Card style={{ gap: 14 }}>
        <View style={styles.row}>
          <View style={[styles.iconBox, { backgroundColor: theme.mint }]}>
            <Icon name="people-outline" />
          </View>
          <View style={{ flex: 1 }}>
            <Title small>Assigned patient workspaces</Title>
            <Body muted style={{ fontSize: 13 }}>
              {assigned.length
                ? `${assigned.length} patient care space(s) assigned.`
                : "No doctor care space assigned yet."}
            </Body>
          </View>
        </View>

        {assigned.length > 0 &&
          assigned.map((space) => (
            <Button
              key={space.id}
              title={"Open " + space.name}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await cloud!.select(space.id);
                })
              }
            />
          ))}

        <Button
          title={busy ? "Checking..." : "Refresh doctor access"}
          secondary
          disabled={busy}
          loading={busy}
          onPress={() =>
            void run(async () => {
              await cloud?.refresh();
              if (cloud)
                setVerification(
                  await cloud.verification.request<VerificationSnapshot>(""),
                );
            })
          }
        />
      </Card>

      <View style={{ gap: 12, marginTop: 4 }}>
        <Button
          title="Continue as a patient instead"
          secondary
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await setLoginAudience("Patient");
              router.replace(state.onboarded ? "/(tabs)" : "/onboarding");
            })
          }
        />

        <Touch
          label="Sign out"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await clearSelectedOrganization();
              await clearWorkspaceRequests();
              await cloud?.signOut();
              router.replace("/sign-in");
            })
          }
          style={{ paddingVertical: 10, alignItems: "center" }}
        >
          <Text
            style={{
              color: theme.muted,
              fontSize: 14,
              fontWeight: "700",
              textAlign: "center",
            }}
          >
            Sign out
          </Text>
        </Touch>
      </View>
    </Screen>
  );
}
