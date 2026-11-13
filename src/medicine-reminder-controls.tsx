import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Body, Button, Card, Field, Icon, Title, theme } from "./components";
import { useMedicineReminders } from "./medicine-reminders";
import { parseReminderTimes, reminderTimes } from "./reminder-plan";
import type { Medicine } from "./clinic";
export function ReminderSettings() {
  const reminders = useMedicineReminders();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function act(action: () => Promise<void>, success = "") {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not update reminders.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="notifications-outline" />
        <Title small>Medicine reminders</Title>
      </View>
      <Body muted>{reminders.status}</Body>
      {!!reminders.cloudStatus && <Body muted>{reminders.cloudStatus}</Body>}
      {reminders.cloudSupported && (
        <Button
          title="Sync reminder settings"
          secondary
          disabled={busy || !reminders.ready}
          onPress={() => void act(reminders.refresh)}
        />
      )}
      <Body muted>
        Get daily alerts at your selected times. Alerts continue until you turn
        them off or archive the medicine.
      </Body>
      <Button
        title={
          reminders.prefs.enabled
            ? "Turn off medicine notifications"
            : "Enable medicine notifications"
        }
        icon="notifications-outline"
        loading={busy}
        disabled={!reminders.ready || busy}
        onPress={() =>
          void act(() => reminders.setEnabled(!reminders.prefs.enabled))
        }
      />
      {reminders.prefs.enabled && (
        <>
          {reminders.cloudSupported && (
            <>
              <Body muted>
                {reminders.delivery === "server"
                  ? "This phone uses cloud push and needs internet to receive alerts."
                  : "This phone uses local reminders that work offline."}
              </Body>
              <Button
                title={
                  reminders.delivery === "server"
                    ? "Use offline local reminders"
                    : "Use cloud push on this phone"
                }
                secondary
                disabled={busy}
                onPress={() =>
                  void act(() =>
                    reminders.setDelivery(
                      reminders.delivery === "server" ? "local" : "server",
                    ),
                  )
                }
              />
            </>
          )}
          <Button
            title="Send a test notification"
            secondary
            disabled={busy}
            onPress={() =>
              void act(
                reminders.test,
                reminders.delivery === "server"
                  ? "Test push requested. Delivery depends on phone notification settings."
                  : "A test notification is scheduled in 5 seconds.",
              )
            }
          />
          <Button
            title={
              reminders.prefs.showNames
                ? "Hide medicine names in notifications"
                : "Show medicine names in notifications"
            }
            secondary
            disabled={busy}
            onPress={() =>
              void act(() => reminders.setShowNames(!reminders.prefs.showNames))
            }
          />
          <Body muted>
            {reminders.prefs.showNames
              ? "Medicine names can appear on the lock screen, depending on your phone settings."
              : "Medicine names are hidden from notification text."}
          </Body>
        </>
      )}
      {(!!message || !!reminders.error) && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: theme.muted, lineHeight: 21 }}
        >
          {message || reminders.error}
        </Text>
      )}
      <Button
        title="Open phone notification settings"
        secondary
        onPress={() => {
          void Linking.openSettings().catch(() =>
            setMessage(
              "Open your phone Settings and allow notifications for this app.",
            ),
          );
        }}
      />
      <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>
        Times follow this phone timezone. Battery and notification settings can
        delay alerts. If using Expo Go, notification permissions belong to Expo
        Go.
      </Text>
    </Card>
  );
}
export function MedicineAlertTimes({ medicine }: { medicine: Medicine }) {
  const reminders = useMedicineReminders();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const times = reminderTimes(medicine, reminders.prefs);
  const enabled = reminders.prefs.medicines[medicine.id]?.enabled !== false;
  async function save(enabledValue: boolean) {
    setBusy(true);
    setError("");
    try {
      await reminders.saveMedicine(
        medicine.id,
        editing ? parseReminderTimes(value) : times,
        enabledValue,
      );
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save alert times.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{
        gap: 8,
        borderTopWidth: 1,
        borderColor: theme.border,
        paddingTop: 12,
      }}
    >
      <Text style={{ color: theme.green, fontSize: 13, fontWeight: "700" }}>
        Daily alerts: {enabled && times.length ? times.join(", ") : "Off"}
      </Text>
      {editing ? (
        <>
          <Field
            label="Daily alert times (24-hour clock)"
            value={value}
            onChange={setValue}
            placeholder="08:00, 20:00"
            inputProps={{ autoCapitalize: "none", autoCorrect: false }}
          />
          <Body muted>
            Choose times that match your prescribed routine. This changes
            notifications, not your prescription or dosage.
          </Body>
          <Button
            title="Save alert times"
            loading={busy}
            disabled={busy || !reminders.ready}
            onPress={() => void save(true)}
          />
          <Button
            title="Cancel"
            secondary
            disabled={busy}
            onPress={() => {
              setEditing(false);
              setError("");
            }}
          />
        </>
      ) : (
        <>
          <Button
            title="Edit alert times"
            secondary
            disabled={!reminders.ready || busy}
            onPress={() => {
              setValue(times.join(", "));
              setEditing(true);
              setError("");
            }}
          />
          {!!times.length && (
            <Button
              title={
                enabled
                  ? "Turn off alerts for this medicine"
                  : "Turn on alerts for this medicine"
              }
              secondary
              disabled={!reminders.ready || busy}
              onPress={() => void save(!enabled)}
            />
          )}
        </>
      )}
      {!!error && (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.red }}>
          {error}
        </Text>
      )}
    </View>
  );
}
