import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  AndroidImportance,
  AndroidNotificationVisibility,
  IosAuthorizationStatus,
} from "expo-notifications";
import type { ReminderPlan } from "./reminder-plan";
export const medicineChannel = "bloom-medicine";
let work: Promise<void> = Promise.resolve();
let epoch = 0;
if (Platform.OS !== "web")
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
export function reconcileReminders(plan: ReminderPlan[]): Promise<void> {
  const version = ++epoch;
  const next = work
    .catch(() => {})
    .then(async () => {
      if (Platform.OS === "web" || version !== epoch) return;
      const existing = await Notifications.getAllScheduledNotificationsAsync();
      const wanted = new Map(plan.map((p) => [p.identifier, p]));
      for (const request of existing) {
        if (version !== epoch) return;
        if (!request.identifier.startsWith("bloom-med:")) continue;
        const desired = wanted.get(request.identifier);
        if (desired && request.content.data?.signature === desired.signature) {
          wanted.delete(request.identifier);
          continue;
        }
        await Notifications.cancelScheduledNotificationAsync(
          request.identifier,
        );
      }
      const presented = await Notifications.getPresentedNotificationsAsync();
      for (const notification of presented) {
        if (version !== epoch) return;
        if (
          notification.request.identifier.startsWith("bloom-med:") &&
          !plan.some((p) => p.identifier === notification.request.identifier)
        )
          await Notifications.dismissNotificationAsync(
            notification.request.identifier,
          );
      }
      for (const entry of wanted.values()) {
        if (version !== epoch) return;
        await Notifications.scheduleNotificationAsync({
          identifier: entry.identifier,
          content: {
            title: entry.title,
            body: entry.body,
            sound: "default",
            data: {
              kind: "bloom-medicine",
              owner: entry.owner,
              medicineId: entry.medicineId,
              signature: entry.signature,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: entry.hour,
            minute: entry.minute,
            channelId: medicineChannel,
            delivery: "bestEffort",
          },
        });
      }
    });
  work = next;
  return next;
}
export async function configureMedicineChannel() {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(medicineChannel, {
      name: "Medicine reminders",
      importance: AndroidImportance.HIGH,
      sound: "default",
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
}
export async function reminderPermission() {
  const result = await Notifications.getPermissionsAsync();
  return {
    allowed:
      result.granted ||
      result.ios?.status === IosAuthorizationStatus.PROVISIONAL ||
      result.ios?.status === IosAuthorizationStatus.EPHEMERAL,
    canAskAgain: result.canAskAgain,
  };
}
export const clearMedicineReminders = () => reconcileReminders([]);
