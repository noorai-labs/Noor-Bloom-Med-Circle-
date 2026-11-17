import { providers, providerFor } from "../provider-display";
import { DoctorHome } from "./doctor";
import React from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useClinic } from "../store";
import { BloomLogo } from "../branding";
import { canRead, dayKey, formatDate, visibleVisits } from "../clinic";
import {
  Avatar,
  Body,
  Button,
  Card,
  Chip,
  Empty,
  Hero,
  Icon,
  IconName,
  Screen,
  Section,
  styles,
  theme,
  Title,
  Touch,
} from "../components";
export function VisitCard({
  visit,
}: {
  visit: ReturnType<typeof visibleVisits>[number];
}) {
  const p = providerFor(visit);
  return (
    <Touch
      label={"Open visit with " + p.name}
      onPress={() =>
        router.push({ pathname: "/visit/[id]", params: { id: visit.id } })
      }
    >
      <Card>
        <View style={styles.row}>
          <Avatar providerId={p.id} />
          <View style={{ flex: 1 }}>
            <Title small>{p.name}</Title>
            <Body muted>{p.specialty}</Body>
          </View>
          <Icon name="chevron-forward" size={18} />
        </View>
        <View style={styles.divider} />
        <View
          style={[
            styles.row,
            { justifyContent: "space-between", flexWrap: "wrap" },
          ]}
        >
          <View style={styles.row}>
            <Icon name="calendar-outline" size={16} />
            <Body>
              {formatDate(visit.date)} · {visit.time}
            </Body>
          </View>
          <Chip title={visit.status} />
        </View>
        <Body muted>
          {visit.service}
          {visit.frequency !== "One visit" ? " · " + visit.frequency : ""}
        </Body>
      </Card>
    </Touch>
  );
}
export default function HomeScreen() {
  const { state } = useClinic();
  return state.session?.role === "Doctor" ? (
    <DoctorHome />
  ) : (
    <GeneralHomeScreen />
  );
}
function GeneralHomeScreen() {
  const { state } = useClinic();
  const role = state.session?.role || "Patient";
  const personal = ["Patient", "Family"].includes(role);
  const visits = visibleVisits(state);
  const next = visits.find(
    (v) => !["Completed", "Cancelled"].includes(v.status),
  );
  const meds = state.medicines.filter((m) => m.active);
  const taken = meds.filter((m) => m.logs[dayKey()] === "Taken").length;
  const unread = state.activities.filter((n) => !n.read).length;
  const provider = providers.find((p) => p.id === state.session?.providerId);
  return (
    <Screen noGuard>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <View style={styles.row}>
          <BloomLogo size={40} />
          <View>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "800",
                letterSpacing: 1.4,
                color: theme.ink,
              }}
            >
              BLOOM MED
            </Text>
            <Text style={{ fontSize: 10, color: theme.muted }}>
              Your care, connected
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <Touch
            label="Activity inbox"
            onPress={() => router.push("/inbox")}
            style={styles.iconButton}
          >
            <Icon name="notifications-outline" color={theme.ink} />
            {unread > 0 && (
              <View
                style={{
                  width: 7,
                  height: 7,
                  backgroundColor: theme.red,
                  borderRadius: 4,
                  position: "absolute",
                  top: 9,
                  right: 9,
                }}
              />
            )}
          </Touch>
          {personal && (
            <Touch
              label="Emergency SOS"
              onPress={() => router.push("/sos")}
              style={[
                styles.iconButton,
                { backgroundColor: "#FDEEF1", borderColor: "#FDEEF1" },
              ]}
            >
              <Icon name="shield-outline" color={theme.red} />
            </Touch>
          )}
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.green,
              fontWeight: "600",
              fontSize: 12,
              marginBottom: 5,
            }}
          >
            {role} care space
          </Text>
          <Title>
            {personal
              ? canRead(state)
                ? "Hi, " + state.profile.name.split(" ")[0] + " ☀"
                : "Welcome back"
              : provider
                ? "Welcome, " + provider.name.split(" ")[1]
                : "Care at a glance"}
          </Title>
          <Body muted>
            {personal
              ? "Let’s make today a little healthier."
              : "Everything you need for a thoughtful visit."}
          </Body>
        </View>
        <Avatar providerId={provider?.id} />
      </View>
      {!canRead(state) ? (
        <Empty
          title="A little consent goes a long way"
          body="The patient can enable family access in their Profile. Switch roles to demonstrate consent."
          icon="lock-closed-outline"
          action="Open profile"
          onPress={() => router.push("/(tabs)/profile")}
        />
      ) : (
        <>
          {personal ? (
            <>
              <Hero
                eyebrow="CARE THAT COMES TO YOU"
                title={"Better care.\nRight at home."}
                body="Find a doctor who listens. Get the support you need, where you feel most comfortable."
                button="Find your doctor"
                onPress={() =>
                  router.push({
                    pathname: "/discover",
                    params: { kind: "doctor" },
                  })
                }
              />
              <Section title="What do you need today?" />
              <View style={styles.wrap}>
                {(
                  [
                    {
                      title: "Doctor visit",
                      sub: "Expert care",
                      icon: "medkit-outline",
                      color: theme.mint,
                      href: "doctor",
                    },
                    {
                      title: "Home nursing",
                      sub: "A helping hand",
                      icon: "heart-outline",
                      color: "#FFF0E6",
                      href: "nurse",
                    },
                    {
                      title: "Medicines",
                      sub: "Your daily routine",
                      icon: "medical-outline",
                      color: theme.lilac,
                      href: "medicines",
                    },
                    {
                      title: "Ask Bloom",
                      sub: "Care companion",
                      icon: "sparkles-outline",
                      color: theme.blue,
                      href: "assistant",
                    },
                  ] as {
                    title: string;
                    sub: string;
                    icon: IconName;
                    color: string;
                    href: string;
                  }[]
                ).map((a) => (
                  <View key={a.title} style={{ width: "48%", flexGrow: 1 }}>
                    <Touch
                      onPress={() =>
                        a.href === "doctor" || a.href === "nurse"
                          ? router.push({
                              pathname: "/discover",
                              params: { kind: a.href },
                            })
                          : a.href === "medicines"
                            ? router.push("/medicines")
                            : router.push("/(tabs)/assistant")
                      }
                    >
                      <Card style={{ padding: 18 }}>
                        <View
                          style={[styles.iconBox, { backgroundColor: a.color }]}
                        >
                          <Icon name={a.icon} />
                        </View>
                        <View>
                          <Title small>{a.title}</Title>
                          <Body muted>{a.sub}</Body>
                        </View>
                      </Card>
                    </Touch>
                  </View>
                ))}
              </View>
              <Section
                title="Your next care moment"
                action="See all"
                onPress={() => router.push("/(tabs)/appointments")}
              />
              {next ? (
                <VisitCard visit={next} />
              ) : (
                <Empty
                  title="Your calendar is clear"
                  body="Book care whenever you need it."
                  action="Find care"
                  onPress={() => router.push("/discover")}
                />
              )}
              <Card>
                <View style={styles.row}>
                  <View
                    style={[styles.iconBox, { backgroundColor: theme.lilac }]}
                  >
                    <Icon name="medical-outline" color="#7C66B2" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Title small>Small steps, better days</Title>
                    <Body muted>
                      {taken} of {meds.length} medicines taken today
                    </Body>
                  </View>
                </View>
                <View
                  style={{
                    height: 7,
                    borderRadius: 5,
                    backgroundColor: theme.border,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: ((meds.length ? (taken / meds.length) * 100 : 0) +
                        "%") as "100%",
                      backgroundColor: theme.green,
                      borderRadius: 5,
                    }}
                  />
                </View>
                <Button
                  title="Open my medicines"
                  secondary
                  onPress={() => router.push("/medicines")}
                />
              </Card>
              <Section
                title="Your health folder"
                action="View records"
                onPress={() => router.push("/(tabs)/records")}
              />
              {state.records.slice(0, 2).map((r) => (
                <Touch
                  key={r.id}
                  onPress={() =>
                    router.push({
                      pathname: "/record/[id]",
                      params: { id: r.id },
                    })
                  }
                >
                  <Card>
                    <View style={styles.row}>
                      <View
                        style={[
                          styles.iconBox,
                          { backgroundColor: theme.blue },
                        ]}
                      >
                        <Icon name="document-text-outline" color="#557EB9" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Title small>{r.name}</Title>
                        <Body muted>
                          {r.category} · {formatDate(r.date)}
                        </Body>
                      </View>
                      <Icon name="chevron-forward" size={16} />
                    </View>
                  </Card>
                </Touch>
              ))}
            </>
          ) : role === "Admin" ? (
            <>
              <Hero
                eyebrow="PLATFORM OVERVIEW"
                title="Care, working together."
                body="Manage the local demo’s professionals, appointments and support requests."
              />
              <View style={styles.wrap}>
                {[
                  ["Visits", state.visits.length],
                  [
                    "Completed",
                    state.visits.filter((v) => v.status === "Completed").length,
                  ],
                  ["Professionals", state.approved.length],
                  [
                    "Open issues",
                    state.issues.filter((i) => !i.resolved).length,
                  ],
                ].map(([label, value]) => (
                  <View
                    key={String(label)}
                    style={[styles.stat, { minWidth: "45%" }]}
                  >
                    <Body muted>{label}</Body>
                    <Title>{value}</Title>
                  </View>
                ))}
              </View>
              <Button
                title="Manage professionals"
                onPress={() => router.push("/admin")}
              />
              <Section title="Recent care requests" />
              {visits.slice(-4).map((v) => (
                <VisitCard key={v.id} visit={v} />
              ))}
            </>
          ) : (
            <>
              <Hero
                eyebrow={
                  role === "Doctor"
                    ? "PREPARED FOR EVERY VISIT"
                    : "COMPASSION IN EVERY TASK"
                }
                title={
                  role === "Doctor"
                    ? "Your patients.\nYour care, connected."
                    : "A thoughtful visit\nstarts with you."
                }
                body={
                  role === "Doctor"
                    ? "Review records, complete your consultation and send a care plan in one place."
                    : "Accept a care request, work through the checklist and share a visit summary."
                }
                button="Open my visits"
                onPress={() => router.push("/(tabs)/appointments")}
              />
              <View style={styles.row}>
                {[
                  [
                    "Upcoming",
                    visits.filter((v) =>
                      ["Confirmed", "Requested"].includes(v.status),
                    ).length,
                  ],
                  [
                    "In progress",
                    visits.filter((v) => v.status === "In Progress").length,
                  ],
                  [
                    "Completed",
                    visits.filter((v) => v.status === "Completed").length,
                  ],
                ].map(([label, value]) => (
                  <View key={String(label)} style={styles.stat}>
                    <Body muted>{label}</Body>
                    <Title>{value}</Title>
                  </View>
                ))}
              </View>
              <Section title="Your care queue" />
              {visits
                .filter((v) => !["Completed", "Cancelled"].includes(v.status))
                .map((v) => (
                  <VisitCard key={v.id} visit={v} />
                ))}
              {!visits.some(
                (v) => !["Completed", "Cancelled"].includes(v.status),
              ) && (
                <Empty
                  title="A calm moment"
                  body="New patient bookings for this professional will appear here."
                  icon="calendar-outline"
                />
              )}
            </>
          )}
        </>
      )}
      <Body muted>
        {state.session?.identifier.startsWith("user_")
          ? "Private cloud care space"
          : "Local functional demo · All care data is fictional."}
      </Body>
    </Screen>
  );
}
