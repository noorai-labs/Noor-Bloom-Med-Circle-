import { cloudMode } from "../cloud-config";
import type { AvailabilityDay } from "../cloud-api";
import {
  cacheCloudProviders,
  doctors,
  findProvider,
  nurses,
  providerFor,
  type DisplayProvider,
} from "../provider-display";
import { DoctorAppointments } from "./doctor";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Skeleton,
  styles,
  theme,
  Title,
  Touch,
} from "../components";
import { VisitCard } from "./home";
function JustifiedFilterRow({
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
              paddingVertical: 10,
              paddingHorizontal: 6,
              borderRadius: 14,
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
                fontSize: 12,
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

export function DiscoverScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const { state, cloud } = useClinic();
  const [mode, setMode] = useState(
    kind === "nurse" ? "Home nursing" : "Doctors",
  );
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const [language, setLanguage] = useState("All");
  const [consultMode, setConsultMode] = useState("All");
  const [cloudList, setCloudList] = useState<DisplayProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadTicket, setReloadTicket] = useState(0);

  const specialtyRows =
    mode === "Doctors"
      ? [
          [
            { label: "All", flex: 0.55 },
            { label: "General Medicine", flex: 1.35 },
            { label: "Cardiology", flex: 1 },
          ],
          [
            { label: "Pediatrics", flex: 1 },
            { label: "Diabetology", flex: 1 },
            { label: "Geriatrics", flex: 1 },
          ],
        ]
      : [
          [
            { label: "All", flex: 0.6 },
            { label: "Nursing Care", flex: 1.1 },
            { label: "Palliative Care", flex: 1.1 },
          ],
          [
            { label: "Post-operative Care", flex: 1.35 },
            { label: "Elder Support", flex: 1 },
          ],
        ];

  const loadAllCloudProviders = useCallback(
    async (signal?: { active: boolean }) => {
      if (!cloudMode || !cloud) return [];
      const baseQuery = {
        kind: (mode === "Doctors" ? "Doctor" : "Nurse") as "Doctor" | "Nurse",
        specialty: specialty === "All" ? undefined : specialty,
        language: language === "All" ? undefined : language,
        mode: (consultMode === "Home Visit"
          ? "in-person"
          : consultMode === "Online Consultation"
            ? "video"
            : "all") as "in-person" | "video" | "all",
        limit: 50,
      };
      const all: Parameters<typeof cacheCloudProviders>[0] = [];
      let offset = 0;
      for (let page = 0; page < 20; page++) {
        const response = await cloud.providers({ ...baseQuery, offset });
        if (signal && !signal.active) return all;
        all.push(...response.providers);
        if (!response.pagination?.hasMore || response.providers.length === 0) {
          break;
        }
        offset += response.providers.length;
      }
      return all;
    },
    [cloud, mode, specialty, language, consultMode],
  );

  const fetchProviders = useCallback(async () => {
    if (!cloudMode || !cloud) return;
    setLoading(true);
    setLoadError("");
    try {
      const providersList = await loadAllCloudProviders();
      setCloudList(cacheCloudProviders(providersList));
    } catch (e) {
      setCloudList([]);
      setLoadError(
        e instanceof Error
          ? e.message
          : "Couldn't load care professionals. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [cloud, loadAllCloudProviders]);

  useEffect(() => {
    if (!cloudMode || !cloud) return;
    const signal = { active: true };
    void (async () => {
      await Promise.resolve();
      if (!signal.active) return;
      setLoading(true);
      setLoadError("");
      try {
        const providersList = await loadAllCloudProviders(signal);
        if (!signal.active) return;
        setCloudList(cacheCloudProviders(providersList));
      } catch (e) {
        if (!signal.active) return;
        setCloudList([]);
        setLoadError(
          e instanceof Error
            ? e.message
            : "Couldn't load care professionals. Please try again.",
        );
      } finally {
        if (signal.active) setLoading(false);
      }
    })();
    return () => {
      signal.active = false;
    };
  }, [cloud, loadAllCloudProviders, reloadTicket]);

  const rawList: DisplayProvider[] = cloudMode
    ? cloudList
    : mode === "Doctors"
      ? doctors
      : nurses;

  const list = rawList.filter((p) => {
    const isApproved = cloudMode ? p.verified !== false : state.approved.includes(p.id);
    const matchesSpecialty =
      specialty === "All" ||
      p.specialty.toLowerCase().includes(specialty.toLowerCase());
    const matchesSearch =
      (p.name + " " + p.specialty + " " + p.skills)
        .toLowerCase()
        .includes(search.toLowerCase());

    const providerLanguages = p.languages?.length
      ? p.languages
      : ["English", "Hindi", "Kannada", "Tamil"];
    const matchesLanguage =
      language === "All" ||
      providerLanguages.some((l) => l.toLowerCase() === language.toLowerCase());

    const matchesConsultMode =
      consultMode === "All" ||
      (p.modes?.length
        ? consultMode === "Home Visit"
          ? p.modes.includes("in-person")
          : p.modes.includes("video")
        : (consultMode === "Home Visit" &&
            !p.specialty.includes("Telehealth Only")) ||
          (consultMode === "Online Consultation" && !nursing(p.id)));

    return (
      isApproved &&
      matchesSpecialty &&
      matchesSearch &&
      matchesLanguage &&
      matchesConsultMode
    );
  });

  return (
    <Screen
      title="Find your kind of care"
      subtitle="A little closer to feeling better."
      back
      allowed={["Patient", "Family"]}
    >
      <JustifiedFilterRow
        items={[{ label: "Doctors" }, { label: "Home nursing" }]}
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

      <View style={{ gap: 8 }}>
        <Label>SPECIALTY</Label>
        {specialtyRows.map((row, idx) => (
          <JustifiedFilterRow
            key={idx}
            items={row}
            value={specialty}
            onChange={setSpecialty}
          />
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <Label>SPOKEN LANGUAGE</Label>
        <JustifiedFilterRow
          items={[
            { label: "All", flex: 0.65 },
            { label: "English", flex: 1 },
            { label: "Hindi", flex: 0.85 },
            { label: "Kannada", flex: 1.1 },
            { label: "Tamil", flex: 0.85 },
          ]}
          value={language}
          onChange={setLanguage}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Label>CONSULTATION MODE</Label>
        <JustifiedFilterRow
          items={[
            { label: "All", flex: 0.6 },
            { label: "Home Visit", flex: 1 },
            { label: "Online Consultation", flex: 1.45 },
          ]}
          value={consultMode}
          onChange={setConsultMode}
        />
      </View>

      {!loading && !loadError && (
        <Body muted>
          {cloudMode
            ? list.length + " verified professional(s) available"
            : list.length + " verified professional(s) match your care criteria"}
        </Body>
      )}

      {loading && (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((idx) => (
            <Card key={idx} style={{ gap: 10 }}>
              <View style={styles.row}>
                <Skeleton width={64} height={64} borderRadius={32} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="65%" height={16} />
                  <Skeleton width="45%" height={12} />
                  <Skeleton width="55%" height={12} />
                </View>
              </View>
              <Skeleton width="90%" height={12} />
            </Card>
          ))}
        </View>
      )}

      {!loading && !!loadError && (
        <Empty
          title="Couldn't load care professionals"
          body={loadError}
          icon="cloud-offline-outline"
          action="Retry"
          onPress={() => {
            setReloadTicket((t) => t + 1);
            void fetchProviders();
          }}
        />
      )}

      {!loading &&
        !loadError &&
        list.map((p) => (
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
                  <View style={styles.row}>
                    <Title small>{p.name}</Title>
                    <Chip title="Verified" />
                  </View>
                  <Body muted>{p.specialty}</Body>
                  <Text style={{ color: "#A18142", fontSize: 12, marginTop: 4 }}>
                    {p.experience > 0
                      ? `★ ${p.rating} · ${p.experience} years experience`
                      : p.authority || "Verified care provider"}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={18} />
              </View>
              <Body muted>{p.skills || p.about}</Body>
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <Chip
                  title={
                    p.modes?.length
                      ? p.modes
                          .map((m) => (m === "video" ? "Video" : "Home visit"))
                          .join(" & ")
                      : nursing(p.id)
                        ? "Home visit"
                        : "Home visit & Video"
                  }
                />
                {p.fee > 0 ? (
                  <Text style={{ color: theme.ink, fontWeight: "700" }}>
                    ₹{p.fee}
                    <Text style={{ color: theme.muted, fontWeight: "400" }}>
                      {" "}
                      / visit
                    </Text>
                  </Text>
                ) : (
                  <Chip title="Verified profile" />
                )}
              </View>
            </Card>
          </Touch>
        ))}

      {!loading && !loadError && list.length === 0 && (
        <Empty
          title="No doctors match your filters"
          body="No care professionals matched your search criteria. Clear filters or try another specialty, language, or mode."
          icon="search-outline"
          action={
            search || specialty !== "All" || language !== "All" || consultMode !== "All"
              ? "Clear filters"
              : undefined
          }
          onPress={() => {
            setSearch("");
            setSpecialty("All");
            setLanguage("All");
            setConsultMode("All");
          }}
        />
      )}
    </Screen>
  );
}
export function ProfessionalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = findProvider(id);
  const { state } = useClinic();
  if (!p)
    return (
      <Screen back title="Professional">
        <Empty
          title="Profile not found"
          body="Choose a professional from Find care."
          icon="person-outline"
          action="Find care"
          onPress={() => router.replace("/discover")}
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
          <Body>
            {p.authority
              ? `Verified by MedBloom · ${p.authority}${p.registrationNumber ? ` · Reg ${p.registrationNumber}` : ""}`
              : "Verified by MedBloom · Credentials checked"}
          </Body>
        </View>
        <View style={styles.row}>
          <Icon name="chatbubble-ellipses-outline" />
          <Body>
            Languages:{" "}
            {p.languages?.length
              ? p.languages.join(", ")
              : "English, Hindi, Kannada"}
          </Body>
        </View>
      </Card>
      <Card>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <View>
            <Label>CONSULTATION ESTIMATE</Label>
            <Title>{p.fee > 0 ? `₹${p.fee}` : "Confirmed on booking"}</Title>
          </View>
          <Chip title="No payment required" />
        </View>
        <Button
          title="Request consultation appointment"
          disabled={!p.verified && !state.approved.includes(p.id)}
          onPress={() =>
            router.push({ pathname: "/booking", params: { providerId: p.id } })
          }
          icon="calendar-outline"
        />
      </Card>
    </Screen>
  );
}
function to24Hour(slot: string): string {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(slot);
  if (!m) return "";
  let hour = Number(m[1]);
  if (m[3] === "PM" && hour < 12) hour += 12;
  if (m[3] === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function DateTime({
  providerId,
  date,
  setDate,
  time,
  setTime,
  ignoreId,
  onLoadingChange,
}: {
  providerId: string;
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  ignoreId?: string;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const { state, cloud } = useClinic();
  const isStaticProvider =
    doctors.some((p) => p.id === providerId) ||
    nurses.some((p) => p.id === providerId);
  const [providerSchedule, setProviderSchedule] = useState<
    AvailabilityDay[] | null
  >(null);
  const [scheduleError, setScheduleError] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(
    cloudMode && !!cloud && !!providerId && !isStaticProvider,
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      if (!cloudMode || !cloud || !providerId || isStaticProvider) {
        setScheduleError(false);
        setScheduleLoading(false);
        onLoadingChange?.(false);
        return;
      }
      setScheduleError(false);
      setScheduleLoading(true);
      onLoadingChange?.(true);
      try {
        const res = await cloud.availability.get(providerId);
        if (active) setProviderSchedule(res.schedule);
      } catch {
        if (active) {
          setProviderSchedule(null);
          setScheduleError(true);
        }
      } finally {
        if (active) {
          setScheduleLoading(false);
          onLoadingChange?.(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [cloud, isStaticProvider, onLoadingChange, providerId]);

  const weekdayKey = WEEKDAY_KEYS[new Date(date + "T12:00:00").getDay()];
  const dayRule =
    providerSchedule && providerSchedule.length > 0
      ? providerSchedule.find((d) => d.day === weekdayKey)
      : undefined;

  const availableTimes =
    !cloudMode || isStaticProvider
      ? times
      : scheduleError || !providerSchedule || providerSchedule.length === 0
        ? []
        : !dayRule || !dayRule.enabled
          ? []
          : times.filter((slot) => {
              const hhmm = to24Hour(slot);
              return hhmm >= dayRule.startTime && hhmm < dayRule.endTime;
            });

  const timeStillValid = !time || availableTimes.includes(time);

  useEffect(() => {
    if (!scheduleLoading && !timeStillValid) {
      setTime("");
    }
  }, [scheduleLoading, setTime, timeStillValid]);

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
      {scheduleLoading ? (
        <Body muted>Loading available times…</Body>
      ) : availableTimes.length === 0 ? (
        <Body muted>
          {scheduleError
            ? "Could not load doctor's availability. Please try again later."
            : "Doctor is not available on this day. Please select another day."}
        </Body>
      ) : (
        <View style={styles.wrap}>
          {availableTimes.map((t) => {
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
      )}
    </>
  );
}
export function BookingScreen() {
  const params = useLocalSearchParams<{ providerId: string; date?: string }>();
  const { state, cloud, dispatch, notify } = useClinic();
  const p = findProvider(params.providerId);
  const isNurse = p?.kind === "Nurse" || nursing(params.providerId || "");
  const hasPendingWithProvider = state.visits.some(
    (v) => v.providerId === params.providerId && v.status === "Requested",
  );
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmedVisit, setConfirmedVisit] = useState<
    (typeof state.visits)[number] | null
  >(null);
  const preSubmitIdsRef = useRef<Set<string>>(new Set());
  const submittedSlotRef = useRef<{
    providerId: string;
    date: string;
    time: string;
  } | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [service, setService] = useState(
    isNurse ? "Home nursing" : "Home Visit",
  );
  const [frequency, setFrequency] = useState("One visit");
  const [date, setDate] = useState(
    nextDays().includes(params.date || "") ? params.date! : nextDays()[0],
  );
  const [time, setTime] = useState("");
  const [address, setAddress] = useState(state.profile.address);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!awaitingConfirm || !p) return;
    if (cloud?.status === "Save failed") {
      const msg =
        cloud.error ||
        "Could not send care request. Please review your date and time.";
      const timer = setTimeout(() => {
        setAwaitingConfirm(false);
        setSubmitting(false);
        setSubmitError(msg);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!cloud || cloud.status === "Synced") {
      const target = submittedSlotRef.current || {
        providerId: p.id,
        date,
        time,
      };
      const matched =
        state.visits.find(
          (v) =>
            !preSubmitIdsRef.current.has(v.id) &&
            v.providerId === target.providerId &&
            v.date === target.date &&
            v.time === target.time &&
            !terminal(v),
        ) ||
        state.visits.find(
          (v) =>
            v.providerId === target.providerId &&
            v.date === target.date &&
            v.time === target.time &&
            !terminal(v),
        );
      if (matched) {
        const timer = setTimeout(() => {
          setConfirmedVisit(matched);
          setAwaitingConfirm(false);
          setSubmitting(false);
          setSubmitError("");
          setStep(3);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [awaitingConfirm, cloud, date, p, state.visits, time]);
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
  if (step === 3 && confirmedVisit) {
    const visit = confirmedVisit;
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
              ? "Care request sent"
              : "You’re all booked."}
          </Title>
          <Body muted>
            {visit.status === "Requested"
              ? `${p.name} will review your request. The slot is not confirmed until accepted.`
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
              isNurse
                ? ["Home nursing", "Elder care", "Post-operative care"]
                : ["Home Visit", "Online Consultation"]
            }
            value={service}
            onChange={setService}
          />
          {isNurse && (
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
            onLoadingChange={setScheduleLoading}
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
              scheduleLoading ||
              !time ||
              (service !== "Online Consultation" && !address.trim())
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
          {hasPendingWithProvider && (
            <View
              style={{
                backgroundColor: "#FFFBEB",
                borderColor: "#FDE68A",
                borderWidth: 1,
                borderRadius: 12,
                padding: 10,
              }}
            >
              <Body style={{ fontSize: 12, color: "#B45309" }}>
                You already have a pending request with {p.name}. Sending this
                creates an additional request.
              </Body>
            </View>
          )}
          <Body>
            {p.name} will review your request before confirming. No payment is
            collected.
          </Body>
          <Body muted style={{ fontSize: 12 }}>
            For emergencies, use SOS or call 112.
          </Body>
          {submitError ? (
            <View
              style={{
                backgroundColor: "#FEF2F2",
                borderColor: "#FECACA",
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Body style={{ color: "#991B1B", fontSize: 13 }}>
                {submitError}
              </Body>
            </View>
          ) : null}
          <Button
            title="Confirm care request"
            loading={submitting}
            disabled={submitting}
            onPress={() => {
              if (submitting) return;
              setSubmitError("");
              setSubmitting(true);
              preSubmitIdsRef.current = new Set(state.visits.map((v) => v.id));
              submittedSlotRef.current = { providerId: p.id, date, time };
              const ok = dispatch({
                type: "book",
                visit: {
                  providerId: p.id,
                  providerName: p.name,
                  date,
                  time,
                  service,
                  frequency,
                  address,
                  reason,
                },
              });
              if (ok) {
                setAwaitingConfirm(true);
              } else {
                setSubmitting(false);
                setSubmitError(
                  cloud?.error ||
                    "Could not submit care request. Please review your details and try again.",
                );
              }
            }}
          />
          <Button
            title="Edit date & address"
            secondary
            disabled={submitting}
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
  const allVisits = visibleVisits(state);
  const list = allVisits.filter(
    (v) =>
      filter === "All" ||
      (filter === "Upcoming" ? !terminal(v) : v.status === filter),
  );
  const hasHistory = allVisits.length > 0;
  const isPatientOrFamily = ["Patient", "Family"].includes(
    state.session?.role || "",
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
      {isPatientOrFamily && (hasHistory || list.length > 0) && (
        <Card
          style={{
            backgroundColor: "#F2F9F5",
            borderColor: "#D2E9DC",
            padding: 14,
            gap: 8,
          }}
        >
          <Button
            title="Book another care moment"
            icon="add-circle-outline"
            onPress={() => router.push("/discover")}
            style={{ minHeight: 48 }}
          />
          <Body muted style={{ fontSize: 12, textAlign: "center" }}>
            Find verified doctors or home nursing care
          </Body>
        </Card>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {["Upcoming", "Completed", "Cancelled", "All"].map((item) => {
          const active = filter === item;
          return (
            <Touch
              key={item}
              label={item}
              selected={active}
              onPress={() => setFilter(item)}
              style={{
                flex: item === "All" ? 0.65 : 1,
                paddingVertical: 9,
                paddingHorizontal: 6,
                borderRadius: 14,
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
                  fontSize: 12,
                  fontWeight: "600",
                  color: active ? "white" : theme.ink,
                  textAlign: "center",
                }}
              >
                {item}
              </Text>
            </Touch>
          );
        })}
      </View>
      {list.map((v) => (
        <VisitCard key={v.id} visit={v} />
      ))}
      {!list.length && (
        <Empty
          title={
            hasHistory ? `No ${filter.toLowerCase()} visits` : "No visits yet"
          }
          body={
            hasHistory
              ? `You don’t have any ${filter.toLowerCase()} appointments right now.`
              : isPatientOrFamily
                ? "Book your first appointment with a verified doctor or home nurse."
                : "No appointments scheduled in your queue yet."
          }
          icon="calendar-outline"
          action={!hasHistory && isPatientOrFamily ? "Find a doctor" : undefined}
          onPress={
            !hasHistory && isPatientOrFamily
              ? () =>
                  router.push({
                    pathname: "/discover",
                    params: { kind: "doctor" },
                  })
              : undefined
          }
          secondaryAction={
            !hasHistory && isPatientOrFamily ? "Explore all care" : undefined
          }
          onSecondaryPress={
            !hasHistory && isPatientOrFamily
              ? () => router.push("/discover")
              : undefined
          }
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
          icon="alert-circle-outline"
          action="Back to appointments"
          onPress={() => router.replace("/(tabs)/appointments")}
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
