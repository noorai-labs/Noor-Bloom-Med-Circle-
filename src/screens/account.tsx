import { cloudMode } from "../cloud-config";
import { doctors, nurses, providers } from "../provider-display";
import React, { useState } from "react";
import { Switch, View } from "react-native";
import { router } from "expo-router";
import { useClinic } from "../store";
import { Role, roles, visibleVisits } from "../clinic";
import {
  Avatar,
  Body,
  Button,
  Card,
  Chip,
  Chips,
  Confirm,
  Empty,
  Field,
  Hero,
  Icon,
  Screen,
  Section,
  styles,
  theme,
  Title,
  Touch,
} from "../components";
export function ProfileScreen() {
  const { state, dispatch, cloud, notify } = useClinic();
  const [logout, setLogout] = useState(false);
  const role = state.session?.role || "Patient";
  const professional = providers.find(
    (p) => p.id === state.session?.providerId,
  );
  function switchRole(next: string) {
    dispatch({
      type: "session",
      session: {
        identifier: state.session?.identifier || "demo@example.com",
        role: next as Role,
        providerId: next === "Nurse" ? "n1" : next === "Doctor" ? "1" : "",
      },
    });
    router.replace("/(tabs)");
  }
  return (
    <Screen title="Your space" subtitle="A little more personal." noGuard>
      {cloud && (
        <Card>
          <Title small>Cloud care space</Title>
          <Body muted>{cloud.status}</Body>
          {!!cloud.error && <Body>{cloud.error}</Body>}
          <Button
            title="Refresh cloud data"
            secondary
            onPress={() => void cloud.refresh()}
          />
          <Chips
            values={cloud.spaces.map(
              (s) => s.name + " · " + s.role + " · " + s.id.slice(-6),
            )}
            value={
              cloud.spaces
                .filter((s) => s.id === cloud.spaceId)
                .map(
                  (s) => s.name + " · " + s.role + " · " + s.id.slice(-6),
                )[0] || ""
            }
            onChange={(label) => {
              const space = cloud.spaces.find(
                (s) =>
                  s.name + " · " + s.role + " · " + s.id.slice(-6) === label,
              );
              if (space)
                void cloud
                  .select(space.id)
                  .catch(() =>
                    notify("Could not open this care space. Please try again."),
                  );
            }}
          />
        </Card>
      )}
      <Card>
        <View style={styles.row}>
          <Avatar providerId={professional?.id} size={70} />
          <View style={{ flex: 1 }}>
            <Title small>
              {professional?.name ||
                (role === "Doctor"
                  ? "Doctor workspace"
                  : role === "Nurse"
                    ? "Nurse workspace"
                    : state.profile.name)}
            </Title>
            <Body muted>
              {state.session?.identifier || "Local demo account"}
            </Body>
            <Chip title={role} />
          </View>
        </View>
        {role === "Patient" && (
          <Button
            title="Edit health profile"
            secondary
            icon="create-outline"
            onPress={() => router.push("/edit-profile")}
          />
        )}
      </Card>
      {cloud && (
        <Card>
          <Title small>Identity & professional verification</Title>
          <Body muted>
            Submit evidence, track manual review and respond to requests for
            corrections.
          </Body>
          <Button
            title="Open verification"
            icon="shield-checkmark-outline"
            onPress={() => router.push("/verification")}
          />
        </Card>
      )}
      {role === "Patient" && (
        <Card>
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <Icon name="people-outline" />
            </View>
            <View style={{ flex: 1 }}>
              <Title small>Keep your family close</Title>
              <Body muted>
                Let the family demo view your care updates and records.
              </Body>
            </View>
            <Switch
              accessibilityLabel="Family access consent"
              value={state.profile.consent}
              trackColor={{ false: "#D9E2E5", true: theme.green }}
              onValueChange={(consent) => {
                dispatch({
                  type: "profile",
                  profile: { ...state.profile, consent },
                });
              }}
            />
          </View>
          <Body muted>
            {state.profile.consent
              ? "Family access is enabled. You can revoke it at any time."
              : "Your family view is locked until you choose to enable it."}
          </Body>
        </Card>
      )}
      {!cloud && (
        <Card>
          <Section title="Explore another role" />
          <Body muted>
            Role switching shares the same local demo data so you can follow the
            whole care journey.
          </Body>
          <Chips values={roles} value={role} onChange={switchRole} />
          {["Doctor", "Nurse"].includes(role) && (
            <>
              <Body muted>Select your professional identity</Body>
              <Chips
                values={(role === "Doctor" ? doctors : nurses).map(
                  (p) => p.name,
                )}
                value={professional?.name || ""}
                onChange={(name) => {
                  const p = providers.find((item) => item.name === name)!;
                  dispatch({
                    type: "session",
                    session: { ...state.session!, providerId: p.id },
                  });
                  router.replace("/(tabs)");
                }}
              />
            </>
          )}
        </Card>
      )}
      <Card>
        <Button
          title="Activity inbox"
          secondary
          icon="notifications-outline"
          onPress={() => router.push("/inbox")}
        />
        <Button
          title="Help & support"
          secondary
          icon="chatbubble-ellipses-outline"
          onPress={() => router.push("/support")}
        />
        {role === "Admin" && (
          <Button
            title="Manage professionals"
            secondary
            icon="people-outline"
            onPress={() => router.push("/admin")}
          />
        )}
        <Button
          title="Sign out"
          secondary
          icon="log-out-outline"
          onPress={() => setLogout(true)}
        />
      </Card>
      <Body muted>
        {cloud
          ? "Email or Google sign-in and private cloud storage. Provider discovery will show verified profiles when connected. Assistant and emergency dispatch are not connected."
          : "Local prototype · No real authentication, cloud syncing, medical AI or emergency services. Keep real health information out of this demo."}
      </Body>
      <Confirm
        visible={logout}
        title="Leave your care space?"
        body={
          cloud
            ? "Your care data stays in your account. Sign back in with the same email or Google account to access it."
            : "Your demo visits, records and care updates stay saved on this device."
        }
        confirm="Sign out"
        onClose={() => setLogout(false)}
        onConfirm={() => {
          setLogout(false);
          if (cloud) {
            void cloud
              .signOut()
              .catch(() =>
                notify("Sign-out could not complete. Please try again."),
              );
            return;
          }
          dispatch({ type: "session", session: null });
        }}
      />
    </Screen>
  );
}
export function InboxScreen() {
  const { state, dispatch } = useClinic();
  const visibleIds = new Set(visibleVisits(state).map((v) => v.id));
  const items = state.activities.filter(
    (n) => !n.visitId || visibleIds.has(n.visitId),
  );
  return (
    <Screen
      title="Your care updates"
      subtitle="The little details that keep you connected."
      back
    >
      <Button
        title="Mark all as read"
        secondary
        onPress={() => dispatch({ type: "read" })}
      />
      {items.map((n) => (
        <Touch
          key={n.id}
          onPress={() => {
            dispatch({ type: "read", activityId: n.id });
            if (n.visitId)
              router.push({
                pathname: "/visit/[id]",
                params: { id: n.visitId },
              });
          }}
        >
          <Card style={{ backgroundColor: n.read ? "white" : "#EDF8F3" }}>
            <View style={styles.row}>
              <View style={styles.iconBox}>
                <Icon
                  name={
                    n.read
                      ? "checkmark-circle-outline"
                      : "notifications-outline"
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Title small>
                  {cloudMode && n.visitId ? "Appointment update" : n.title}
                </Title>
                <Body muted>
                  {new Date(n.date).toLocaleString("en-IN", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Body>
              </View>
              {!n.read && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.green,
                  }}
                />
              )}
            </View>
            <Body>
              {cloudMode && n.visitId
                ? (() => {
                    const visit = state.visits.find((v) => v.id === n.visitId);
                    return visit
                      ? visit.service +
                          " - " +
                          visit.date +
                          " " +
                          visit.time +
                          " - " +
                          visit.status
                      : "Open this appointment to view its details.";
                  })()
                : n.body}
            </Body>
          </Card>
        </Touch>
      ))}
      {!items.length && (
        <Empty
          title="All quiet for now"
          body="Bookings, care plans and support updates will appear here."
          icon="notifications-outline"
        />
      )}
    </Screen>
  );
}
export function SupportScreen() {
  const { state, dispatch } = useClinic();
  const [subject, setSubject] = useState("");
  return (
    <Screen title="Here to help" subtitle="Local demo support desk." back>
      <Card>
        <Title small>Tell us what needs attention</Title>
        <Field
          label="Support request"
          value={subject}
          onChange={setSubject}
          placeholder="Describe an issue in the demo"
          multiline
        />
        <Button
          title="Save support request"
          onPress={() => {
            if (dispatch({ type: "issue", subject })) setSubject("");
          }}
        />
        <Body muted>
          Saved locally for the admin demo. No message is sent to an external
          team.
        </Body>
      </Card>
      <Section title="Support requests" />
      {state.issues.map((i) => (
        <Card key={i.id}>
          <Title small>{i.subject}</Title>
          <Chip title={i.resolved ? "Resolved" : "Open"} />
          {state.session?.role === "Admin" && !i.resolved && (
            <Button
              title="Resolve issue"
              secondary
              onPress={() => dispatch({ type: "resolve", issueId: i.id })}
            />
          )}
        </Card>
      ))}
      {!state.issues.length && (
        <Empty
          title="Nothing to follow up"
          body="Your local support requests will appear here."
          icon="chatbubble-outline"
        />
      )}
    </Screen>
  );
}
export function AdminScreen() {
  const { state, dispatch } = useClinic();
  return (
    <Screen
      title="The people behind your care"
      subtitle="Local professional management."
      back
      allowed={["Admin"]}
    >
      <Hero
        eyebrow="CARE TEAM DIRECTORY"
        title="Good care starts\nwith good people."
        body="Approval controls whether a professional can receive new bookings. Existing appointments stay available."
      />
      {providers.map((p) => (
        <Card key={p.id}>
          <View style={styles.row}>
            <Avatar providerId={p.id} />
            <View style={{ flex: 1 }}>
              <Title small>{p.name}</Title>
              <Body muted>
                {p.specialty} · {p.experience} years
              </Body>
            </View>
            <Chip
              title={state.approved.includes(p.id) ? "Approved" : "Paused"}
            />
          </View>
          <Body muted>{p.skills}</Body>
          <Button
            title={
              state.approved.includes(p.id)
                ? "Pause new bookings"
                : "Approve new bookings"
            }
            secondary
            onPress={() => dispatch({ type: "approve", providerId: p.id })}
          />
        </Card>
      ))}
    </Screen>
  );
}
export function SosScreen() {
  if (cloudMode)
    return (
      <Screen title="Emergency support" back>
        <Card>
          <Title small>Emergency dispatch is not connected</Title>
          <Body>
            BLOOM MED cannot request an ambulance or notify emergency contacts.
            Contact local emergency services directly for urgent help.
          </Body>
        </Card>
      </Screen>
    );
  return <DemoSosScreen />;
}
function DemoSosScreen() {
  const { state, dispatch } = useClinic();
  const [confirm, setConfirm] = useState(false);
  return (
    <Screen title="Emergency support" back allowed={["Patient", "Family"]}>
      <Card
        style={{
          backgroundColor: "#FFF0F2",
          borderColor: "#F7D9DE",
          paddingVertical: 30,
          alignItems: "center",
        }}
      >
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: "#FBE0E5",
              width: 90,
              height: 90,
              borderRadius: 45,
            },
          ]}
        >
          <Icon name="shield-outline" size={40} color={theme.red} />
        </View>
        <Title>
          {state.sos ? "Demo SOS is active" : "Your safety comes first"}
        </Title>
        <Body>
          This is a simulation. No ambulance, contact, call or message will be
          triggered.
        </Body>
        <Chip title={state.sos ? "Simulation active" : "Simulation ready"} />
      </Card>
      <Card>
        <Section title="Your emergency contact" />
        <Body>{state.profile.contact || "No emergency contact entered"}</Body>
        <Body muted>
          Home address: {state.profile.address || "None entered"}
        </Body>
      </Card>
      {state.sos ? (
        <>
          <Card>
            {[
              "Demo alert created",
              "Simulated contact notified",
              "Simulated help request queued",
            ].map((text, i) => (
              <View key={text} style={styles.row}>
                <Icon name="checkmark-circle" color={theme.green} />
                <View style={{ flex: 1 }}>
                  <Title small>{text}</Title>
                  <Body muted>Step {i + 1} · Simulation only</Body>
                </View>
              </View>
            ))}
          </Card>
          <Button
            title="End SOS simulation"
            secondary
            onPress={() => dispatch({ type: "sos", active: false })}
          />
        </>
      ) : (
        <Button
          title="Start SOS simulation"
          danger
          onPress={() => setConfirm(true)}
        />
      )}
      <Confirm
        visible={confirm}
        title="Start the SOS demonstration?"
        body="You will see a simulated emergency workflow. No real-world action will occur."
        confirm="Activate demo SOS"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          dispatch({ type: "sos", active: true });
          setConfirm(false);
        }}
      />
    </Screen>
  );
}
