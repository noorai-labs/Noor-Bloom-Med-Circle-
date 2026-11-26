import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useClinic } from "../store";
import { CloudError, type AvailabilityDay } from "../cloud-api";
import {
  Body,
  Button,
  Card,
  Chips,
  Icon,
  Screen,
  Skeleton,
  styles,
  theme,
  Title,
  Touch,
} from "../components";

export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type DaySchedule = {
  day: DayKey;
  label: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

const DEFAULT_WEEK: DaySchedule[] = [
  { day: "Mon", label: "Monday", enabled: true, startTime: "09:00", endTime: "12:00" },
  { day: "Tue", label: "Tuesday", enabled: true, startTime: "09:00", endTime: "12:00" },
  { day: "Wed", label: "Wednesday", enabled: true, startTime: "09:00", endTime: "12:00" },
  { day: "Thu", label: "Thursday", enabled: true, startTime: "09:00", endTime: "12:00" },
  { day: "Fri", label: "Friday", enabled: true, startTime: "09:00", endTime: "12:00" },
  { day: "Sat", label: "Saturday", enabled: false, startTime: "09:00", endTime: "12:00" },
  { day: "Sun", label: "Sunday", enabled: false, startTime: "09:00", endTime: "12:00" },
];

const PRESET_HOURS = [
  { start: "09:00", end: "12:00", label: "09:00 - 12:00 (Morning)" },
  { start: "10:00", end: "14:00", label: "10:00 - 14:00 (Mid-day)" },
  { start: "14:00", end: "18:00", label: "14:00 - 18:00 (Afternoon)" },
  { start: "16:00", end: "19:00", label: "16:00 - 19:00 (Evening)" },
  { start: "09:00", end: "17:00", label: "09:00 - 17:00 (Full day)" },
];

// Clean vector illustrations matching the Notion mockups
function EmptyCalendarIllustration() {
  return (
    <View style={localStyles.illustrationWrapper}>
      <View style={localStyles.calendarCircleBg}>
        {/* Subtle sparkle rays */}
        <View style={[localStyles.sparkleRay, { top: 8, right: 24 }]} />
        <View style={[localStyles.sparkleRay, { top: 18, right: 12, transform: [{ rotate: "45deg" }] }]} />
        <View style={[localStyles.sparkleRay, { top: 32, right: 8, transform: [{ rotate: "90deg" }] }]} />

        {/* Calendar Card */}
        <View style={localStyles.calendarBody}>
          {/* Calendar top binder bar */}
          <View style={localStyles.calendarHeaderBar}>
            <View style={localStyles.calendarRing} />
            <View style={localStyles.calendarRing} />
            <View style={localStyles.calendarRing} />
          </View>
          {/* Calendar grid representation */}
          <View style={localStyles.calendarGrid}>
            <View style={localStyles.calendarGridRow}>
              <View style={localStyles.calendarDot} />
              <View style={localStyles.calendarDot} />
              <View style={localStyles.calendarDot} />
            </View>
            <View style={localStyles.calendarGridRow}>
              <View style={localStyles.calendarDot} />
              <View style={localStyles.calendarDot} />
              <View style={localStyles.calendarDot} />
            </View>
          </View>
        </View>

        {/* Floating Teal Plus Badge */}
        <View style={localStyles.plusBadge}>
          <Icon name="add" size={20} color="white" />
        </View>
      </View>
    </View>
  );
}

function ErrorCloudIllustration() {
  return (
    <View style={localStyles.illustrationWrapper}>
      <View style={localStyles.cloudContainer}>
        {/* Subtle alert rays */}
        <View style={[localStyles.sparkleRay, { top: 12, right: 20, backgroundColor: "#E85D6E" }]} />
        <View style={[localStyles.sparkleRay, { top: 22, right: 10, backgroundColor: "#E85D6E", transform: [{ rotate: "45deg" }] }]} />

        {/* Cloud Body */}
        <View style={localStyles.cloudBase}>
          <View style={localStyles.cloudPuff1} />
          <View style={localStyles.cloudPuff2} />
          <View style={localStyles.cloudPuff3} />
        </View>

        {/* Red Alert Exclamation Badge */}
        <View style={localStyles.alertBadge}>
          <Icon name="alert" size={20} color="white" />
        </View>
      </View>
    </View>
  );
}

export function DoctorAvailabilityScreen() {
  const { notify, cloud } = useClinic();
  const [schedule, setSchedule] = useState<DaySchedule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scheduleRef = useRef(schedule);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);
  const [previewFilter, setPreviewFilter] = useState(cloud ? "Live" : "Active");
  const [reloadTicket, setReloadTicket] = useState(0);

  // Editing dialog state
  const [editingDay, setEditingDay] = useState<DayKey | null>(null);

  useEffect(() => {
    let active = true;
    if (!cloud) {
      const timer = setTimeout(() => {
        if (!active) return;
        setSchedule(DEFAULT_WEEK);
        setLoading(false);
        setError(null);
      }, 350);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }

    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      setError(null);
      try {
        const res = await cloud.availability.get();
        if (!active) return;
        setSchedule(res.schedule as DaySchedule[]);
      } catch (e) {
        if (!active) return;
        if (e instanceof CloudError && e.status === 404) {
          setSchedule(DEFAULT_WEEK);
        } else {
          setError(
            e instanceof Error
              ? e.message
              : "There was a problem loading your availability. Please try again.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [cloud, reloadTicket]);

  const loadAvailability = useCallback(() => {
    setReloadTicket((t) => t + 1);
  }, []);

  function handleToggleDay(day: DayKey) {
    if (!schedule) return;
    setSchedule(
      schedule.map((item) =>
        item.day === day ? { ...item, enabled: !item.enabled } : item,
      ),
    );
  }

  async function handleSaveAvailability() {
    if (!schedule || saving) return;
    const submitted = schedule;
    setSaving(true);
    try {
      if (cloud) {
        try {
          const saved = await cloud.availability.save(
            submitted as AvailabilityDay[],
          );
          if (scheduleRef.current === submitted) {
            setSchedule(saved.schedule as DaySchedule[]);
          }
        } catch (e) {
          if (!(e instanceof CloudError && e.status === 404)) {
            throw e;
          }
        }
      }
      notify("Weekly availability saved successfully.");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not save availability.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleAddHoursFromEmpty() {
    setSchedule(DEFAULT_WEEK);
    if (!cloud) setPreviewFilter("Active");
  }

  function handleSelectHoursPreset(start: string, end: string) {
    if (!schedule || !editingDay) return;
    setSchedule(
      schedule.map((item) =>
        item.day === editingDay
          ? { ...item, startTime: start, endTime: end, enabled: true }
          : item,
      ),
    );
    setEditingDay(null);
  }

  // Determine which visual state to render
  const activeState =
    previewFilter === "Loading"
      ? "loading"
      : previewFilter === "Error"
        ? "error"
        : previewFilter === "Empty"
          ? "empty"
          : previewFilter === "Active"
            ? "active"
            : loading
              ? "loading"
              : error
                ? "error"
                : schedule && schedule.length > 0
                  ? "active"
                  : "empty";

  return (
    <Screen
      title="Doctor availability"
      subtitle="Set your weekly availability for appointments."
      back
      allowed={["Doctor", "Patient", "Admin"]}
      noGuard
    >
      {/* Dev / Review state previewer bar */}
      <View style={localStyles.previewBar}>
        <Text style={localStyles.previewLabel}>PREVIEW STATE:</Text>
        <Chips
          values={["Active", "Empty", "Loading", "Error"]}
          value={previewFilter}
          onChange={setPreviewFilter}
        />
      </View>

      {/* STATE 1: LOADING (SKELETON) */}
      {activeState === "loading" && (
        <View style={{ gap: 12 }}>
          {Array.from({ length: 7 }).map((_, index) => (
            <Card key={index} style={localStyles.dayRowCard}>
              <View style={styles.row}>
                <Skeleton width={38} height={18} borderRadius={6} />
                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                  <Skeleton width={110} height={32} borderRadius={10} />
                </View>
                <Skeleton width={44} height={24} borderRadius={12} />
              </View>
            </Card>
          ))}
          <View style={{ marginTop: 8 }}>
            <Skeleton width="100%" height={48} borderRadius={16} />
          </View>
        </View>
      )}

      {/* STATE 2: EMPTY ("No availability yet") */}
      {activeState === "empty" && (
        <Card style={localStyles.emptyContainer}>
          <EmptyCalendarIllustration />
          <Text style={localStyles.emptyTitle}>No availability yet</Text>
          <Body muted style={localStyles.emptySubtitle}>
            Add your consulting hours to let patients book appointments.
          </Body>
          <View style={{ width: "100%", marginTop: 8 }}>
            <Button
              title="+ Add hours"
              onPress={handleAddHoursFromEmpty}
            />
          </View>
        </Card>
      )}

      {/* STATE 3: ERROR / RETRY */}
      {activeState === "error" && (
        <Card style={localStyles.emptyContainer}>
          <ErrorCloudIllustration />
          <Text style={localStyles.emptyTitle}>{"Couldn't load availability"}</Text>
          <Body muted style={localStyles.emptySubtitle}>
            There was a problem loading your availability. Please try again.
          </Body>
          <View style={{ width: "100%", marginTop: 8 }}>
            <Button
              title="Retry"
              icon="refresh"
              onPress={() => {
                setPreviewFilter("Active");
                void loadAvailability();
              }}
            />
          </View>
        </Card>
      )}

      {/* STATE 4: CONFIGURED / ACTIVE SCHEDULE */}
      {activeState === "active" && (
        <View style={{ gap: 10 }}>
          {(schedule || DEFAULT_WEEK).map((item) => (
            <Card key={item.day} style={localStyles.dayRowCard}>
              <View
                style={[
                  styles.row,
                  { justifyContent: "space-between", alignItems: "center" },
                ]}
              >
                {/* Day abbreviation (e.g. Mon, Tue) */}
                <Text style={localStyles.dayNameText}>{item.day}</Text>

                {/* Slot or Not Available pill */}
                {item.enabled ? (
                  <Touch
                    label={`Edit ${item.label} hours`}
                    onPress={() => setEditingDay(item.day)}
                    style={localStyles.slotPill}
                  >
                    <View style={localStyles.slotPillInner}>
                      <Text style={localStyles.slotPillText}>
                        {item.startTime} - {item.endTime}
                      </Text>
                      <Icon name="pencil" size={14} color={theme.muted} />
                    </View>
                  </Touch>
                ) : (
                  <View style={localStyles.notAvailablePill}>
                    <Text style={localStyles.notAvailableText}>Not available</Text>
                  </View>
                )}

                {/* Active Toggle Switch */}
                <Switch
                  accessibilityLabel={`Toggle ${item.label} availability`}
                  value={item.enabled}
                  trackColor={{ false: "#DCE5E8", true: theme.green }}
                  thumbColor="white"
                  onValueChange={() => handleToggleDay(item.day)}
                />
              </View>
            </Card>
          ))}

          <View style={{ marginTop: 12 }}>
            <Button
              title={saving ? "Saving..." : "Save availability"}
              loading={saving}
              disabled={saving}
              onPress={() => void handleSaveAvailability()}
            />
          </View>
        </View>
      )}

      {/* Time Slot Picker Modal */}
      <Modal
        visible={editingDay !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingDay(null)}
      >
        <View style={localStyles.modalOverlay}>
          <Card style={localStyles.modalCard}>
            <View
              style={[
                styles.row,
                { justifyContent: "space-between", marginBottom: 12 },
              ]}
            >
              <Title small>
                Set consulting hours (
                {schedule?.find((d) => d.day === editingDay)?.label})
              </Title>
              <Touch
                label="Close dialog"
                onPress={() => setEditingDay(null)}
                style={{ padding: 4 }}
              >
                <Icon name="close" size={20} color={theme.muted} />
              </Touch>
            </View>

            <Body muted style={{ marginBottom: 14 }}>
              Select your consultation hours for this day:
            </Body>

            <ScrollView style={{ maxHeight: 260 }}>
              {PRESET_HOURS.map((preset) => (
                <Touch
                  key={preset.label}
                  label={preset.label}
                  onPress={() =>
                    handleSelectHoursPreset(preset.start, preset.end)
                  }
                  style={localStyles.presetOption}
                >
                  <Text style={localStyles.presetOptionText}>
                    {preset.label}
                  </Text>
                  <Icon name="chevron-forward" size={16} color={theme.green} />
                </Touch>
              ))}
            </ScrollView>

            <Button
              title="Cancel"
              secondary
              style={{ marginTop: 12 }}
              onPress={() => setEditingDay(null)}
            />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const localStyles = StyleSheet.create({
  previewBar: {
    marginBottom: 14,
    padding: 10,
    backgroundColor: "#F4F8F6",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2EDE8",
    gap: 6,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.green,
    letterSpacing: 0.8,
  },
  dayRowCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5ECE8",
  },
  dayNameText: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.ink,
    minWidth: 42,
  },
  slotPill: {
    borderWidth: 1,
    borderColor: "#DCE5E8",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FAFCFB",
  },
  slotPillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slotPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.ink,
  },
  notAvailablePill: {
    borderWidth: 1,
    borderColor: "#F0F4F4",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#F7FAF9",
  },
  notAvailableText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#9EAFA9",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 42,
    paddingHorizontal: 24,
    gap: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.ink,
    textAlign: "center",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.muted,
    textAlign: "center",
    maxWidth: 260,
  },
  // Illustration styling
  illustrationWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
  calendarCircleBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#EDF7F4",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  sparkleRay: {
    position: "absolute",
    width: 6,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#3BB896",
  },
  calendarBody: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#7B969A",
    overflow: "hidden",
  },
  calendarHeaderBar: {
    height: 12,
    backgroundColor: "#7B969A",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  calendarRing: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#FFFFFF",
  },
  calendarGrid: {
    flex: 1,
    padding: 6,
    justifyContent: "space-around",
  },
  calendarGridRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  calendarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#B4C8C9",
  },
  plusBadge: {
    position: "absolute",
    bottom: -2,
    right: 18,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.green,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  // Cloud Error Illustration
  cloudContainer: {
    width: 100,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cloudBase: {
    width: 64,
    height: 34,
    backgroundColor: "#EBF2F3",
    borderRadius: 17,
    position: "relative",
    marginTop: 10,
  },
  cloudPuff1: {
    position: "absolute",
    top: -16,
    left: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EBF2F3",
  },
  cloudPuff2: {
    position: "absolute",
    top: -10,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EBF2F3",
  },
  cloudPuff3: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: "#EBF2F3",
    borderRadius: 10,
  },
  alertBadge: {
    position: "absolute",
    bottom: 6,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E84C5F",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  // Modal styling
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 24, 20, 0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 24,
    padding: 22,
    backgroundColor: "white",
  },
  presetOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5ECE8",
    marginBottom: 8,
    backgroundColor: "#F9FCFA",
  },
  presetOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.ink,
  },
});
