import { cloudMode } from "../cloud-config";
import { doctors, nurses, providers, providerFor } from "../provider-display";
import { DoctorAppointments } from "./doctor";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useClinic } from "../store";
import {
  formatDate,
  nextDays,
  nursing,
  terminal,
  times,
  visibleVisits,
} from "../clinic";
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
  Icon,
  Label,
  Screen,
  Section,
  styles,
  theme,
  Title,
  Touch,
} from "../components";
import { VisitCard } from "./home";
export function DiscoverScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { state } = useClinic();
  const [mode, setMode] = useState(
    kind === "nurse" ? "Home nursing" : "Doctors",
  );
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const list = (mode === "Doctors" ? doctors : nurses).filter(
    (p) =>
      state.approved.includes(p.id) &&
      (specialty === "All" || p.specialty === specialty) &&
      (p.name + " " + p.specialty + " " + p.skills)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Screen
      title="Find your kind of care"
      subtitle="A little closer to feeling better."
      back
      allowed={["Patient", "Family"]}
    >
      <Chips
        values={["Doctors", "Home nursing"]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          setSpecialty("All");
        }}
      />
      <Field
        label="Search professionals"
        value={search}
        onChange={setSearch}
        placeholder="Name, specialty or care skill"
      />
      {mode === "Doctors" && (
        <Chips
          values={["All", ...doctors.map((p) => p.specialty)]}
          value={specialty}
          onChange={setSpecialty}
        />
      )}
      <Body muted>
        {cloudMode
          ? "Only verified professionals will appear here."
          : list.length + " professionals available in this demo"}
      </Body>
      {list.map((p) => (
        <Touch
          key={p.id}
          label={"View " + p.name}
          onPress={() =>
            router.push({
              pathname: "/professional/[id]",
              params: { id: p.id },
            })
          }
        >
          <Card>
            <View style={styles.row}>
              <Avatar providerId={p.id} size={64} />
              <View style={{ flex: 1 }}>
                <Title small>{p.name}</Title>
                <Body muted>{p.specialty}</Body>
                <Text style={{ color: "#A18142", fontSize: 12, marginTop: 4 }}>
                  ★ {p.rating} · {p.experience} years experience
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} />
            </View>
            <Body muted>{p.skills}</Body>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Chip title="Available for home care" />
              <Text style={{ color: theme.ink, fontWeight: "700" }}>
                ₹{p.fee}
                <Text style={{ color: theme.muted, fontWeight: "400" }}>
                  {" "}
                  / visit
                </Text>
              </Text>
            </View>
          </Card>
        </Touch>
      ))}
      {list.length === 0 && (
        <Empty
          title="No matches yet"
          body="Try another name, skill or specialty."
          icon="search-outline"
        />
      )}
    </Screen>
  );
}
export function ProfessionalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = providers.find((item) => item.id === id);
  const { state } = useClinic();
  if (!p)
    return (
      <Screen back title="Professional">
        <Empty
          title="Profile not found"
          body="Choose a professional from Find care."
        />
      </Screen>
    );
  return (
    <Screen
      back
      title="Meet your care professional"
      allowed={["Patient", "Family"]}
    >
      <Card style={{ alignItems: "center", paddingVertical: 30 }}>
        <Avatar providerId={p.id} size={90} />
        <Title>{p.name}</Title>
        <Body muted>{p.specialty}</Body>
        <View style={styles.row}>
          <Chip title={"★ " + p.rating} />
          <Chip title={p.experience + " years of care"} />
        </View>
        <Body>{p.about}</Body>
      </Card>
      <Card>
        <Section title="Thoughtful care, your way" />
        <Body>{p.skills}</Body>
        <View style={styles.row}>
          <Icon name="home-outline" />
          <Body>
            Home visits{" "}
            {nursing(p.id)
              ? "and personalized care support"
              : "and online consultations"}
          </Body>
        </View>
        <View style={styles.row}>
          <Icon name="time-outline" />
          <Body>Morning and afternoon appointment slots</Body>
        </View>
        <View style={styles.row}>
          <Icon name="shield-checkmark-outline" />
          <Body>Approved professional in this local demo</Body>
        </View>
      </Card>
      <Card>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <View>
            <Label>DEMO VISIT ESTIMATE</Label>
            <Title>₹{p.fee}</Title>
          </View>
          <Chip title="No payment required" />
        </View>
        <Button
          title="Choose a care moment"
          disabled={!state.approved.includes(p.id)}
          onPress={() =>
            router.push({ pathname: "/booking", params: { providerId: p.id } })
          }
          icon="arrow-forward"
        />
      </Card>
    </Screen>
  );
}
export function DateTime({
  providerId,
  date,
  setDate,
  time,
  setTime,
  ignoreId,
}: {
  providerId: string;
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  ignoreId?: string;
}) {
  const { state } = useClinic();
  return (
    <>
      <Label>CHOOSE A DAY</Label>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 9, paddingVertical: 4 }}
      >
        {nextDays().map((d) => {
          const obj = new Date(d + "T12:00:00");
          return (
            <Touch
              key={d}
              label={formatDate(d)}
              selected={date === d}
              onPress={() => {
                setDate(d);
                setTime("");
              }}
              style={{
                width: 66,
                borderRadius: 17,
                paddingVertical: 14,
                alignItems: "center",
                gap: 7,
                backgroundColor: date === d ? theme.green : "white",
                borderWidth: 1,
                borderColor: date === d ? theme.green : theme.border,
              }}
            >
              <Text
                style={{
                  color: date === d ? "#CDEFE5" : theme.muted,
                  fontSize: 11,
                }}
              >
                {obj.toLocaleDateString("en-IN", { weekday: "short" })}
              </Text>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: date === d ? "white" : theme.ink,
                }}
              >
                {obj.getDate()}
              </Text>
              <Text
                style={{
                  color: date === d ? "#CDEFE5" : theme.muted,
                  fontSize: 10,
                }}
              >
                {obj.toLocaleDateString("en-IN", { month: "short" })}
              </Text>
            </Touch>
          );
        })}
      </ScrollView>
      <Label>CHOOSE A TIME</Label>
      <View style={styles.wrap}>
        {times.map((t) => {
          const busy = state.visits.some(
            (v) =>
              v.id !== ignoreId &&
              v.providerId === providerId &&
              v.date === date &&
              v.time === t &&
              !terminal(v),
          );
          return (
            <Touch
              key={t}
              disabled={busy}
              label={t + (busy ? " · Booked" : "")}
              selected={time === t}
              onPress={() => setTime(t)}
              style={[
                styles.chip,
                { backgroundColor: time === t ? theme.green : theme.mint },
              ]}
            >
              <Text
                style={{
                  color: time === t ? "white" : theme.green,
                  fontWeight: "600",
                  fontSize: 12,
                }}
              >
                {t}
                {busy ? " · Booked" : ""}
              </Text>
            </Touch>
          );
        })}
      </View>
    </>
  );
}
export function BookingScreen() {
  const params = useLocalSearchParams<{ providerId: string; date?: string }>();
  const { state, dispatch, notify } = useClinic();
  const p = providers.find((v) => v.id === params.providerId);
  const [step, setStep] = useState(0);
  const [service, setService] = useState(
    nursing(params.providerId || "") ? "Home nursing" : "Home Visit",
  );
  const [frequency, setFrequency] = useState("One visit");
  const [date, setDate] = useState(
    nextDays().includes(params.date || "") ? params.date! : nextDays()[0],
  );
  const [time, setTime] = useState("");
  const [address, setAddress] = useState(state.profile.address);
  const [reason, setReason] = useState("");
  if (!p)
    return (
      <Screen title="Book care" back>
        <Empty
          title="Choose a professional first"
          body="Browse care to find your preferred professional."
          action="Find care"
          onPress={() => router.replace("/discover")}
        />
      </Screen>
    );
  if (step === 3) {
    const visit = state.visits.at(-1)!;
    return (
      <Screen title="A little peace of mind" allowed={["Patient", "Family"]}>
        <Card style={{ alignItems: "center", paddingVertical: 35 }}>
          <View
            style={[
              styles.iconBox,
              { width: 90, height: 90, borderRadius: 45 },
            ]}
          >
            <Icon name="checkmark" size={44} />
          </View>
          <Title>
            {visit.status === "Requested"
              ? "Your request is in."
              : "You’re all booked."}
          </Title>
          <Body muted>
            {visit.status === "Requested"
              ? "Your care professional can confirm this request from their care queue."
              : "Your care professional will see this in their visit calendar."}
          </Body>
          <Avatar providerId={p.id} />
          <Title small>{p.name}</Title>
          <Body>
            {formatDate(date)} · {time}
          </Body>
          <Chip title={visit.status} />
          <Button
            title="View appointment details"
            onPress={() =>
              router.replace({
                pathname: "/visit/[id]",
                params: { id: visit.id },
              })
            }
          />
          <Button
            title="Back to my care space"
            secondary
            onPress={() => router.replace("/(tabs)")}
          />
        </Card>
      </Screen>
    );
  }
  return (
    <Screen
      title="Make time for your health"
      subtitle={"With " + p.name}
      back
      allowed={["Patient", "Family"]}
    >
      <View style={styles.row}>
        {["Your care", "When & where", "Review"].map((label, i) => (
          <View key={label} style={{ flex: 1, gap: 7 }}>
            <View
              style={{
                height: 4,
                borderRadius: 4,
                backgroundColor: step >= i ? theme.green : theme.border,
              }}
            />
            <Text
              style={{
                color: step >= i ? theme.green : theme.muted,
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {i + 1}. {label}
            </Text>
          </View>
        ))}
      </View>
      <Card>
        <View style={styles.row}>
          <Avatar providerId={p.id} />
          <View style={{ flex: 1 }}>
            <Title small>{p.name}</Title>
            <Body muted>
              {p.specialty} · ₹{p.fee} / visit
            </Body>
          </View>
        </View>
      </Card>
      {step === 0 ? (
        <Card>
          <Title small>How can we care for you?</Title>
          <Chips
            values={
              nursing(p.id)
                ? ["Home nursing", "Elder care", "Post-operative care"]
                : ["Home Visit", "Online Consultation"]
            }
            value={service}
            onChange={setService}
          />
          {nursing(p.id) && (
            <>
              <Label>Visit duration / frequency</Label>
              <Chips
                values={[
                  "One visit",
                  "2 hours",
                  "Daily · 1 week",
                  "Daily · 1 month",
                ]}
                value={frequency}
                onChange={setFrequency}
              />
            </>
          )}
          <Field
            label="Reason for this visit"
            value={reason}
            onChange={setReason}
            placeholder="Tell your care team what you need help with"
            multiline
          />
          <Button
            title="Choose date & time"
            onPress={() =>
              reason.trim()
                ? setStep(1)
                : notify("Add a reason so your care team can prepare.")
            }
          />
        </Card>
      ) : step === 1 ? (
        <Card>
          <DateTime
            providerId={p.id}
            date={date}
            setDate={setDate}
            time={time}
            setTime={setTime}
          />
          {service !== "Online Consultation" && (
            <Field
              label="Home visit address"
              value={address}
              onChange={setAddress}
              multiline
            />
          )}
          <Button
            title="Review appointment"
            disabled={
              !time || (service !== "Online Consultation" && !address.trim())
            }
            onPress={() => setStep(2)}
          />
          <Button
            title="Back to care options"
            secondary
            onPress={() => setStep(0)}
          />
        </Card>
      ) : (
        <Card>
          <Title small>Everything look right?</Title>
          {[
            ["Service", service],
            ["Date & time", formatDate(date) + " · " + time],
            ["Frequency", frequency],
            [
              "Address",
              service === "Online Consultation"
                ? "Demo online consultation"
                : address,
            ],
            ["Reason", reason],
          ].map(([label, value]) => (
            <View key={label} style={{ gap: 5 }}>
              <Label>{label}</Label>
              <Body>{value}</Body>
            </View>
          ))}
          <View style={styles.divider} />
          <Body>
            Estimate: ₹{p.fee} per visit. No payment is collected. Recurring
            care is represented as a single request with the chosen frequency.
          </Body>
          <Button
            title="Confirm appointment"
            onPress={() => {
              if (
                dispatch({
                  type: "book",
                  visit: {
                    providerId: p.id,
                    date,
                    time,
                    service,
                    frequency,
                    address,
                    reason,
                  },
                })
              )
                setStep(3);
            }}
          />
          <Button
            title="Edit date & address"
            secondary
            onPress={() => setStep(1)}
          />
        </Card>
      )}
    </Screen>
  );
}
export function AppointmentsScreen() {
  const { state } = useClinic();
  return state.session?.role === "Doctor" ? (
    <DoctorAppointments />
  ) : (
    <GeneralAppointmentsScreen />
  );
}
function GeneralAppointmentsScreen() {
  const { state } = useClinic();
  const [filter, setFilter] = useState("Upcoming");
  const list = visibleVisits(state).filter(
    (v) =>
      filter === "All" ||
      (filter === "Upcoming" ? !terminal(v) : v.status === filter),
  );
  return (
    <Screen
      title={
        ["Doctor", "Nurse"].includes(state.session?.role || "")
          ? "Your visits"
          : "Your care calendar"
      }
      subtitle="Every care moment, in one place."
    >
      <Chips
        values={["Upcoming", "Completed", "Cancelled", "All"]}
        value={filter}
        onChange={setFilter}
      />
      {list.map((v) => (
        <VisitCard key={v.id} visit={v} />
      ))}
      {!list.length && (
        <Empty
          title="Nothing here yet"
          body="Appointments matching this filter will appear here."
          icon="calendar-outline"
        />
      )}
      {["Patient", "Family"].includes(state.session?.role || "") && (
        <Button
          title="Book another care moment"
          icon="add"
          onPress={() => router.push("/discover")}
        />
      )}
    </Screen>
  );
}
export function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch, notify } = useClinic();
  const v = visibleVisits(state).find((item) => item.id === id);
  const [cancel, setCancel] = useState(false);
  const [reschedule, setReschedule] = useState(false);
  const [date, setDate] = useState(nextDays()[0]);
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [prescription, setPrescription] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [addMedicine, setAddMedicine] = useState(false);
  const [medName, setMedName] = useState("");
  const [dosage, setDosage] = useState("");
  const [medTime, setMedTime] = useState("08:00");
  const [frequency, setFrequency] = useState("Once daily");
  const [duration, setDuration] = useState("As prescribed");
  if (!v)
    return (
      <Screen title="Visit details" back>
        <Empty
          title="Visit unavailable"
          body="Choose a visit assigned to your current care role."
        />
      </Screen>
    );
  const p = providerFor(v);
  const role = state.session!.role;
  const staff = ["Doctor", "Nurse", "Admin"].includes(role);
  const consultation = state.consultations.find((n) => n.visitId === v.id);
  const progress = ["Requested", "Confirmed", "In Progress", "Completed"];
  const current = progress.indexOf(v.status);
  return (
    <Screen
      title={role === "Doctor" ? "Consultation details" : "Your care moment"}
      back
    >
      <Card>
        <View style={styles.row}>
          <Avatar providerId={p.id} size={64} />
          <View style={{ flex: 1 }}>
            <Title small>
              {role === "Doctor" ? state.profile.name : p.name}
            </Title>
            <Body muted>
              {role === "Doctor"
                ? "Patient - " + state.profile.age + " years"
                : p.specialty}
            </Body>
            <Chip title={v.status} />
          </View>
        </View>
        <Body>
          {formatDate(v.date)} · {v.time}
        </Body>
        <Body muted>
          {v.service} · {v.frequency}
        </Body>
        <Body>{v.reason}</Body>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Icon
            name={
              v.service === "Online Consultation"
                ? "videocam-outline"
                : "location-outline"
            }
          />
          <Body>
            {v.service === "Online Consultation"
              ? "Private audio / video consultation"
              : v.address}
          </Body>
        </View>
      </Card>
      {v.service === "Online Consultation" &&
        ["Patient", "Doctor"].includes(role) &&
        ["Confirmed", "In Progress"].includes(v.status) && (
          <Button
            title="Join online consultation"
            icon="videocam-outline"
            onPress={() =>
              router.push({
                pathname: "/consultation-call",
                params: { visitId: v.id },
              })
            }
          />
        )}
      {v.status !== "Cancelled" && (
        <Card>
          <Title small>Your care journey</Title>
          {progress.map((status, i) => (
            <View style={styles.row} key={status}>
              <View
                style={[
                  styles.iconBox,
                  {
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: i <= current ? theme.green : theme.border,
                  },
                ]}
              >
                <Icon
                  name={i < current ? "checkmark" : "ellipse"}
                  size={i < current ? 16 : 7}
                  color={i <= current ? "white" : theme.muted}
                />
              </View>
              <Text
                style={{
                  fontSize: 13,
                  color: i <= current ? theme.ink : theme.muted,
                  fontWeight: i === current ? "700" : "400",
                }}
              >
                {status}
              </Text>
            </View>
          ))}
        </Card>
      )}
      {staff && (
        <Card>
          <Title small>Patient context</Title>
          <Body>
            {state.profile.name} · {state.profile.age} years ·{" "}
            {state.profile.gender}
          </Body>
          <Body>
            Conditions: {state.profile.conditions || "None entered"}
            {"\n"}Allergies: {state.profile.allergies || "None entered"}
            {"\n"}Current medicines: {state.profile.medicines || "None entered"}
          </Body>
          <Body muted>{state.profile.notes}</Body>
          <Button
            title="Review patient records"
            secondary
            onPress={() => router.push("/(tabs)/records")}
          />
        </Card>
      )}
      {staff && v.status === "Requested" && (
        <Button
          title="Accept care request"
          onPress={() =>
            dispatch({ type: "status", visitId: v.id, status: "Confirmed" })
          }
        />
      )}
      {staff && v.status === "Confirmed" && (
        <Button
          title="Start visit"
          icon="play-outline"
          onPress={() =>
            dispatch({ type: "status", visitId: v.id, status: "In Progress" })
          }
        />
      )}
      {role === "Nurse" && v.status === "In Progress" && (
        <Card>
          <Title small>A thoughtful visit, step by step</Title>
          {[
            "Confirm identity and patient consent",
            "Review the prescribed care plan",
            "Complete the assigned care tasks",
            "Share a summary with the care team",
          ].map((task, i) => (
            <Touch
              key={task}
              label={task + (v.checklist[i] ? " · Complete" : "")}
              onPress={() =>
                dispatch({ type: "check", visitId: v.id, index: i })
              }
            >
              <View style={[styles.row, { paddingVertical: 10 }]}>
                <Icon name={v.checklist[i] ? "checkbox" : "square-outline"} />
                <Text
                  style={{
                    flex: 1,
                    color: theme.ink,
                    lineHeight: 22,
                    textDecorationLine: v.checklist[i]
                      ? "line-through"
                      : "none",
                  }}
                >
                  {task}
                </Text>
              </View>
            </Touch>
          ))}
          <Field
            label="Visit summary"
            value={v.notes}
            onChange={(text) =>
              dispatch({ type: "visitNote", visitId: v.id, text })
            }
            multiline
          />
          <Button
            title="Complete care visit"
            disabled={!v.checklist.every(Boolean) || !v.notes.trim()}
            onPress={() =>
              dispatch({ type: "status", visitId: v.id, status: "Completed" })
            }
          />
        </Card>
      )}
      {role === "Doctor" && v.status === "In Progress" && !consultation && (
        <Card>
          <Title small>Send a care plan</Title>
          <Field
            label="Consultation notes"
            value={notes}
            onChange={setNotes}
            multiline
          />
          <Field
            label="Prescription / care instructions"
            value={prescription}
            onChange={setPrescription}
            multiline
          />
          <Label>Recommended follow-up</Label>
          <Chips
            values={[
              "None",
              ...nextDays().filter((_, i) => [2, 6, 13].includes(i)),
            ]}
            value={followUp || "None"}
            onChange={(date) => setFollowUp(date === "None" ? "" : date)}
          />
          <Button
            title={
              addMedicine
                ? "Remove medicine reminder"
                : "Add prescribed medicine reminder"
            }
            secondary
            onPress={() => setAddMedicine(!addMedicine)}
          />
          {addMedicine && (
            <>
              <Field
                label="Prescribed medicine name"
                value={medName}
                onChange={setMedName}
              />
              <Field
                label="Prescribed dosage"
                value={dosage}
                onChange={setDosage}
              />
              <Field
                label="Reminder time (HH:MM)"
                value={medTime}
                onChange={setMedTime}
              />
              <Field
                label="Frequency"
                value={frequency}
                onChange={setFrequency}
              />
              <Field label="Duration" value={duration} onChange={setDuration} />
            </>
          )}
          <Button
            title="Save care plan"
            onPress={() => {
              if (
                dispatch({
                  type: "consult",
                  visitId: v.id,
                  text: notes,
                  prescription,
                  followUp,
                  medicine: addMedicine
                    ? {
                        name: medName,
                        dosage,
                        time: medTime,
                        frequency,
                        duration,
                      }
                    : undefined,
                })
              )
                notify("Care plan saved to patient records and reminders.");
            }}
          />
        </Card>
      )}
      {consultation && (
        <Card>
          <Title small>Your consultation summary</Title>
          <Body>{consultation.text}</Body>
          <Label>PRESCRIPTION / CARE INSTRUCTIONS</Label>
          <Body>{consultation.prescription || "No prescription added."}</Body>
          {consultation.followUp && (
            <>
              <Chip
                title={"Follow-up · " + formatDate(consultation.followUp)}
              />
              {["Patient", "Family"].includes(role) && (
                <Button
                  title="Book recommended follow-up"
                  secondary
                  onPress={() =>
                    router.push({
                      pathname: "/booking",
                      params: { providerId: p.id, date: consultation.followUp },
                    })
                  }
                />
              )}
            </>
          )}
        </Card>
      )}
      {staff && v.status === "In Progress" && !nursing(p.id) && (
        <Button
          title="Complete consultation"
          disabled={!consultation}
          onPress={() =>
            dispatch({ type: "status", visitId: v.id, status: "Completed" })
          }
        />
      )}
      {v.notes && v.status === "Completed" && (
        <Card>
          <Title small>Care visit summary</Title>
          <Body>{v.notes}</Body>
        </Card>
      )}
      {["Patient", "Family", "Admin"].includes(role) &&
        ["Confirmed", "Requested"].includes(v.status) && (
          <>
            <Button
              title="Reschedule appointment"
              secondary
              onPress={() => setReschedule(!reschedule)}
            />
            {reschedule && (
              <Card>
                <Title small>Find a better time</Title>
                <DateTime
                  providerId={p.id}
                  date={date}
                  setDate={setDate}
                  time={time}
                  setTime={setTime}
                  ignoreId={v.id}
                />
                <Button
                  title="Save new appointment time"
                  disabled={!time}
                  onPress={() => {
                    if (
                      dispatch({
                        type: "reschedule",
                        visitId: v.id,
                        date,
                        time,
                      })
                    ) {
                      setReschedule(false);
                      notify("Your appointment has been rescheduled.");
                    }
                  }}
                />
              </Card>
            )}
            <Button
              title="Cancel appointment"
              secondary
              onPress={() => setCancel(true)}
            />
          </>
        )}
      <Body muted>Visit reference: {v.id}</Body>
      <Confirm
        visible={cancel}
        title="Cancel this care moment?"
        body="The visit will move to cancelled and the time slot will be available again."
        confirm="Cancel appointment"
        danger
        onClose={() => setCancel(false)}
        onConfirm={() => {
          dispatch({ type: "status", visitId: v.id, status: "Cancelled" });
          setCancel(false);
        }}
      />
    </Screen>
  );
}
