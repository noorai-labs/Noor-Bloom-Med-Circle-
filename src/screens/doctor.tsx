import { providers } from "../provider-display";
import React, { useState } from "react";
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
  styles,
  theme,
  Title,
  Touch,
} from "../components";

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
  const visits = visibleVisits(state);
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
  return (
    <Screen allowed={["Doctor"]}>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <View style={styles.row}>
          <BloomLogo size={36} />
          <Text
            style={{ fontWeight: "800", color: theme.ink, letterSpacing: 1 }}
          >
            BLOOM MED
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
        <Card style={{ backgroundColor: "#EDF5F0" }}>
          <View style={styles.row}>
            <Icon name="people-outline" />
            <View style={{ flex: 1 }}>
              <Title small>Current patient</Title>
              <Body>{state.profile.name || "Your assigned care space"}</Body>
            </View>
          </View>
          <Button
            title="View assigned patients"
            secondary
            onPress={() => router.push("/(tabs)/patients")}
          />
        </Card>
      </Entrance>
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
      <Card>
        <Button
          title="Review permitted records"
          icon="folder-open-outline"
          secondary
          onPress={() => router.push("/(tabs)/records")}
        />
        <Button
          title="Professional verification"
          icon="shield-checkmark-outline"
          secondary
          onPress={() => router.push("/verification")}
        />
        {cloud && (
          <Button
            title="Refresh care workspace"
            secondary
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
