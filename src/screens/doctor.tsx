import { providers } from "../provider-display";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useClinic } from "../store";
import { BloomLogo } from "../branding";
import { dayKey, formatDate, visibleVisits, Visit } from "../clinic";
import {
  Body,
  Button,
  Card,
  Chip,
  Chips,
  Empty,
  Entrance,
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
  fetchWorkspaces,
  getSelectedOrganization,
  getWorkspaceJoinRequests,
  submitWorkspaceJoinRequest,
  withdrawWorkspaceJoinRequest,
  type OrganizationWorkspace,
  type WorkspaceJoinRequest,
  type Organization,
} from "../organizations";

const openVisit = (id: string) =>
  router.push({ pathname: "/visit/[id]", params: { id } });
export function DoctorVisitCard({ visit }: { visit: Visit }) {
  const { state } = useClinic();
  const online = visit.service === "Online Consultation";
  return (
    <Card style={{ borderRadius: 24, padding: 20 }}>
      <View
        style={[
          styles.row,
          { justifyContent: "space-between", flexWrap: "wrap" },
        ]}
      >
        <View style={[styles.iconBox, { backgroundColor: theme.mint }]}>
          <Icon name="person-outline" />
        </View>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Title small>{state.profile.name || "Patient"}</Title>
          <Body muted>
            {formatDate(visit.date)} · {visit.time}
          </Body>
        </View>
        <Chip title={visit.status} />
      </View>
      <View style={styles.row}>
        <Icon
          name={online ? "videocam-outline" : "location-outline"}
          size={18}
        />
        <Body muted>{visit.service}</Body>
      </View>
      <Body>{visit.reason}</Body>
      <Button
        title={
          visit.status === "Requested"
            ? "Review care request"
            : "Open appointment"
        }
        secondary
        onPress={() => openVisit(visit.id)}
      />
      {online && ["Confirmed", "In Progress"].includes(visit.status) && (
        <Button
          title="Join consultation"
          icon="videocam-outline"
          onPress={() =>
            router.push({
              pathname: "/consultation-call",
              params: { visitId: visit.id },
            })
          }
        />
      )}
    </Card>
  );
}

export function DoctorHome() {
  const { state, cloud, notify } = useClinic();
  const hasAssignedWorkspace =
    !cloud ||
    state.session?.role === "Doctor" ||
    cloud.spaces.some((s) => s.role === "Doctor");
  const visits = hasAssignedWorkspace ? visibleVisits(state) : [];
  const today = visits.filter(
    (v) => v.date === dayKey() && v.status !== "Cancelled",
  );
  const active = visits.filter(
    (v) => !["Completed", "Cancelled"].includes(v.status),
  );
  const next = active.find((v) => v.date >= dayKey());
  const professional = providers.find(
    (p) => p.id === state.session?.providerId,
  );

  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [workspaces, setWorkspaces] = useState<OrganizationWorkspace[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState("");
  const [wsRetryTicket, setWsRetryTicket] = useState(0);

  const [joinRequests, setJoinRequests] = useState<WorkspaceJoinRequest[]>([]);
  const [reqStale, setReqStale] = useState(false);
  const [requestingId, setRequestingId] = useState("");
  const [withdrawingId, setWithdrawingId] = useState("");
  const [requestError, setRequestError] = useState("");

  const doctorUserId = state.session?.identifier || "doc-current";
  const doctorName = state.profile?.name || "Doctor";

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(workspaceQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [workspaceQuery]);

  async function loadRequests() {
    try {
      const reqs = await getWorkspaceJoinRequests(doctorUserId);
      setJoinRequests(reqs);
      setReqStale(false);
    } catch {
      setReqStale(true);
    }
  }

  useEffect(() => {
    let isCurrent = true;
    void (async () => {
      await Promise.resolve();
      if (!isCurrent) return;
      const org = await getSelectedOrganization();
      if (isCurrent && org) setSelectedOrg(org);
      try {
        const reqs = await getWorkspaceJoinRequests(doctorUserId);
        if (isCurrent) {
          setJoinRequests(reqs);
          setReqStale(false);
        }
      } catch {
        if (isCurrent) setReqStale(true);
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [doctorUserId]);

  useEffect(() => {
    let isCurrent = true;
    void (async () => {
      await Promise.resolve();
      if (!isCurrent) return;
      setWsLoading(true);
      setWsError("");
      try {
        const list = await fetchWorkspaces(selectedOrg?.id, debouncedQuery);
        if (isCurrent) setWorkspaces(list);
      } catch (e) {
        if (isCurrent) {
          setWorkspaces([]);
          setWsError(
            e instanceof Error
              ? e.message
              : "Couldn't load workspaces. Please try again.",
          );
        }
      } finally {
        if (isCurrent) setWsLoading(false);
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [selectedOrg?.id, debouncedQuery, wsRetryTicket]);

  async function handleJoinRequest(ws: OrganizationWorkspace) {
    if (requestingId) return;
    setRequestingId(ws.id);
    setRequestError("");
    try {
      const created = await submitWorkspaceJoinRequest(
        doctorUserId,
        doctorName,
        ws,
        selectedOrg?.name || "MedBloom Clinic Network",
      );
      setJoinRequests((prev) => [
        created,
        ...prev.filter((r) => r.workspaceId !== ws.id),
      ]);
      notify(`Join request sent for ${ws.name}`);
    } catch (e) {
      setRequestError(
        e instanceof Error
          ? e.message
          : "Could not submit join request. Please try again.",
      );
    } finally {
      setRequestingId("");
    }
  }

  async function handleWithdraw(reqId: string) {
    if (withdrawingId) return;
    setWithdrawingId(reqId);
    try {
      const updated = await withdrawWorkspaceJoinRequest(doctorUserId, reqId);
      setJoinRequests(updated);
      notify("Workspace request withdrawn.");
    } catch {
      notify("Could not withdraw request. Please try again.");
    } finally {
      setWithdrawingId("");
    }
  }

  return (
    <Screen allowed={["Doctor", "Patient"]}>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <View style={styles.row}>
          <BloomLogo size={36} />
          <Text
            style={{ fontWeight: "800", color: theme.ink, letterSpacing: 1 }}
          >
            MedBloom
          </Text>
        </View>
        <Touch
          label="Activity inbox"
          style={styles.iconButton}
          onPress={() => router.push("/inbox")}
        >
          <Icon name="notifications-outline" />
        </Touch>
      </View>
      <Entrance>
        <View style={{ gap: 8 }}>
          <Body muted>YOUR DOCTOR WORKSPACE</Body>
          <Title>
            {professional?.name
              ? "Welcome, " + professional.name
              : "Welcome, doctor"}
          </Title>
          <Body muted>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Body>
        </View>

        {!hasAssignedWorkspace && (
          <Card
            style={{
              backgroundColor: "#F0FDF4",
              borderColor: "#86EFAC",
              gap: 10,
            }}
          >
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: "#DCFCE7" }]}>
                <Icon name="business-outline" color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Title small>Approved doctor account</Title>
                <Body muted style={{ fontSize: 13 }}>
                  {selectedOrg?.name || "MedBloom"} · Verified
                </Body>
              </View>
            </View>
            <Body style={{ fontSize: 13 }}>
              No patient workspace is assigned yet. Find an organization
              workspace below and request to join.
            </Body>
          </Card>
        )}

        <View style={[styles.row, { alignItems: "stretch" }]}>
          <Card style={{ flex: 1, backgroundColor: theme.mint }}>
            <Icon name="calendar-outline" />
            <Title>{today.length}</Title>
            <Body>Visits today</Body>
          </Card>
          <Card style={{ flex: 1 }}>
            <Icon name="videocam-outline" />
            <Title>
              {today.filter((v) => v.service === "Online Consultation").length}
            </Title>
            <Body>Online today</Body>
          </Card>
        </View>

        <Card style={{ backgroundColor: "#EDF5F0", gap: 12 }}>
          <View style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: theme.mint }]}>
              <Icon name="people-outline" />
            </View>
            <View style={{ flex: 1 }}>
              <Title small>Current patient</Title>
              <Body muted>
                {hasAssignedWorkspace && state.profile.name
                  ? state.profile.name
                  : "No patient workspace assigned yet"}
              </Body>
            </View>
          </View>
          <Button
            title="View assigned patients"
            disabled={!hasAssignedWorkspace}
            onPress={() => router.push("/(tabs)/patients")}
          />
        </Card>
      </Entrance>

      {/* MY WORKSPACE REQUESTS STATUS */}
      <Section
        title="My requests"
        action="Refresh"
        onPress={() => {
          void loadRequests();
          if (cloud) void cloud.refresh().catch(() => setReqStale(true));
        }}
      />
      {reqStale && (
        <Body muted style={{ fontSize: 12 }}>
          Could not reach the server. Showing last known request status.
        </Body>
      )}
      {joinRequests.length === 0 ? (
        <Card>
          <Body muted>
            No workspace requests yet. Search below to request access to a
            workspace.
          </Body>
        </Card>
      ) : (
        joinRequests.map((req) => (
          <Card key={req.id} style={{ gap: 8 }}>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <View style={{ flex: 1 }}>
                <Title small>{req.workspaceName}</Title>
                <Body muted style={{ fontSize: 12 }}>
                  {req.status === "Pending"
                    ? `Waiting for admin approval · Sent ${formatDate(req.requestedAt.slice(0, 10))}`
                    : req.status === "Approved"
                      ? "You've joined this workspace"
                      : req.reason || "Request declined by organization admin"}
                </Body>
              </View>
              <Chip title={req.status} />
            </View>
            {req.status === "Pending" && (
              <Button
                title="Withdraw request"
                secondary
                loading={withdrawingId === req.id}
                disabled={withdrawingId === req.id}
                onPress={() => void handleWithdraw(req.id)}
              />
            )}
          </Card>
        ))
      )}

      {/* BROWSE ORGANIZATION WORKSPACES BY NAME */}
      <Section
        title="Find a workspace"
        action={selectedOrg ? selectedOrg.badge : undefined}
      />
      <Card style={{ gap: 12 }}>
        <Body muted style={{ fontSize: 13 }}>
          Browse organization workspaces by name and request to join. Patient
          records remain hidden until an admin approves your request.
        </Body>

        <Field
          label="Search workspaces"
          value={workspaceQuery}
          onChange={setWorkspaceQuery}
          placeholder="Search by workspace name, department or specialty..."
        />

        {!!requestError && (
          <View
            style={{
              backgroundColor: "#FEF2F2",
              borderColor: "#FECACA",
              borderWidth: 1,
              borderRadius: 12,
              padding: 10,
              gap: 8,
            }}
          >
            <Text style={{ color: "#DC2626", fontSize: 13, fontWeight: "600" }}>
              {requestError}
            </Text>
          </View>
        )}

        {wsLoading && (
          <View style={{ gap: 10 }}>
            {[0, 1].map((idx) => (
              <Card key={idx} style={{ gap: 8 }}>
                <Skeleton width="65%" height={15} />
                <Skeleton width="45%" height={12} />
                <Skeleton width="90%" height={12} />
              </Card>
            ))}
          </View>
        )}

        {!wsLoading && !!wsError && (
          <Empty
            title="Couldn't load workspaces"
            body={wsError}
            icon="cloud-offline-outline"
            action="Retry"
            onPress={() => setWsRetryTicket((t) => t + 1)}
          />
        )}

        {!wsLoading &&
          !wsError &&
          workspaces.map((ws) => {
            const req = joinRequests.find((r) => r.workspaceId === ws.id);
            const isPending = req?.status === "Pending";
            const isApproved = req?.status === "Approved";
            const isDeclined = req?.status === "Declined";
            return (
              <Card
                key={ws.id}
                style={{
                  backgroundColor: isApproved ? "#F0FDF4" : "white",
                  borderColor: isApproved ? theme.green : theme.border,
                  gap: 8,
                }}
              >
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <View style={{ flex: 1 }}>
                    <Title small>{ws.name}</Title>
                    <Body muted style={{ fontSize: 12 }}>
                      {ws.department} · {ws.specialty}
                    </Body>
                  </View>
                  <Chip
                    title={
                      isApproved
                        ? "Joined"
                        : isPending
                          ? "Pending"
                          : isDeclined
                            ? "Declined"
                            : "Join"
                    }
                  />
                </View>

                <Body style={{ fontSize: 12 }}>{ws.description}</Body>

                {isDeclined && req?.reason ? (
                  <Body muted style={{ fontSize: 12 }}>
                    Reason: {req.reason}
                  </Body>
                ) : null}

                {isApproved ? (
                  <Button
                    title="Open assigned workspace"
                    icon="enter-outline"
                    disabled={!hasAssignedWorkspace}
                    onPress={() => router.push("/(tabs)/patients")}
                  />
                ) : isPending ? (
                  <Button
                    title="Pending"
                    secondary
                    disabled
                    onPress={() => {}}
                  />
                ) : (
                  <Button
                    title={isDeclined ? "Request again" : "Request to join"}
                    icon="add-circle-outline"
                    disabled={requestingId === ws.id}
                    loading={requestingId === ws.id}
                    onPress={() => void handleJoinRequest(ws)}
                  />
                )}
              </Card>
            );
          })}

        {!wsLoading && !wsError && workspaces.length === 0 && (
          <Empty
            title="No workspaces found, try a different name"
            body="Try searching for another department or specialty."
            icon="search-outline"
          />
        )}
      </Card>

      <Section
        title="Next consultation"
        action="See all"
        onPress={() => router.push("/(tabs)/appointments")}
      />
      {next ? (
        <DoctorVisitCard visit={next} />
      ) : (
        <Empty
          title="No upcoming consultations"
          body="New appointments for this patient will appear here when assigned to you."
          icon="calendar-outline"
        />
      )}
      <Section title="Care tools" />
      <Card style={{ gap: 10 }}>
        {!hasAssignedWorkspace && (
          <Body muted style={{ fontSize: 12 }}>
            Record review and workspace refresh unlock once an admin assigns or
            approves your patient workspace.
          </Body>
        )}
        <Button
          title="Review permitted records"
          icon="folder-open-outline"
          secondary
          disabled={!hasAssignedWorkspace}
          onPress={() => router.push("/(tabs)/records")}
        />
        <Button
          title="Professional verification"
          icon="shield-checkmark-outline"
          secondary
          onPress={() => router.push("/verification")}
        />
        <Button
          title="Doctor availability"
          icon="time-outline"
          secondary
          onPress={() => router.push("/doctor-availability")}
        />
        {cloud && (
          <Button
            title="Refresh care workspace"
            secondary
            disabled={!hasAssignedWorkspace}
            onPress={() =>
              void cloud
                .refresh()
                .catch(() => notify("Could not refresh. Please try again."))
            }
          />
        )}
      </Card>
      <Body muted>
        Appointment counts refer to the selected patient care space. Online
        calls require approved identities and an assigned appointment.
      </Body>
    </Screen>
  );
}

export function DoctorAppointments() {
  const { state } = useClinic();
  const [filter, setFilter] = useState("Today");
  const [search, setSearch] = useState("");
  const visits = visibleVisits(state).filter((v) => {
    const match =
      filter === "Today"
        ? v.date === dayKey() && v.status !== "Cancelled"
        : filter === "Upcoming"
          ? v.date >= dayKey() && !["Completed", "Cancelled"].includes(v.status)
          : filter === "All" || v.status === filter;
    return (
      match &&
      (state.profile.name + " " + v.reason + " " + v.service)
        .toLowerCase()
        .includes(search.toLowerCase().trim())
    );
  });
  return (
    <Screen
      title="Your appointments"
      subtitle="Prepare, consult and follow up."
      allowed={["Doctor"]}
    >
      <Chips
        values={["Today", "Upcoming", "Requested", "Completed", "All"]}
        value={filter}
        onChange={setFilter}
      />
      <Field
        label="Search appointments"
        value={search}
        onChange={setSearch}
        placeholder="Patient, reason or visit type"
      />
      {visits.map((v) => (
        <DoctorVisitCard key={v.id} visit={v} />
      ))}
      {!visits.length && (
        <Empty
          title="No appointments here"
          body="Try another filter or select a different assigned patient."
          icon="calendar-outline"
        />
      )}
      <Button
        title="Choose assigned patient"
        secondary
        onPress={() => router.push("/(tabs)/patients")}
      />
    </Screen>
  );
}

export function DoctorPatients() {
  const { state, cloud, notify } = useClinic();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const spaces = cloud
    ? cloud.spaces.filter((s) => s.role === "Doctor")
    : [
        {
          id: "demo",
          name: state.profile.name,
          role: "Doctor",
          providerId: state.session?.providerId,
        },
      ];
  async function select(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (cloud && cloud.spaceId !== id) await cloud.select(id);
      router.push("/(tabs)/appointments");
    } catch {
      notify("Unable to open that patient care space. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="Assigned patients"
      subtitle="Open a care space to review its appointments and permitted records."
      allowed={["Doctor"]}
    >
      <Field
        label="Find a care space"
        value={search}
        onChange={setSearch}
        placeholder="Search assigned patient spaces"
      />
      {spaces
        .filter((s) =>
          s.name.toLowerCase().includes(search.toLowerCase().trim()),
        )
        .map((s) => (
          <Card key={s.id}>
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: theme.mint }]}>
                <Icon name="person-outline" />
              </View>
              <View style={{ flex: 1 }}>
                <Title small>{s.name}</Title>
                <Body muted>
                  {s.id === cloud?.spaceId || !cloud
                    ? "Current care space"
                    : "Assigned care space"}
                </Body>
              </View>
            </View>
            <Button
              title={busy ? "Opening..." : "Open patient workspace"}
              disabled={busy}
              onPress={() => void select(s.id)}
            />
          </Card>
        ))}
      {!spaces.length && (
        <Empty
          title="No patients assigned"
          body="Your care administrator must assign patient access before you can open their workspace."
          icon="lock-closed-outline"
        />
      )}
      <Body muted>
        Only backend-assigned spaces are listed. Record access remains subject
        to patient permissions.
      </Body>
    </Screen>
  );
}
