import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { CloudError, cloudRequest } from "./cloud-api";
import type { ReminderPreferences } from "./reminder-plan";
export type ReminderSnapshot = {
  preferences: ReminderPreferences | null;
  revision: number;
};
export type ReminderDevice = {
  id: string;
  mode: "local" | "server" | "off";
  timezone: string;
  ownerTag: string;
  token?: string;
};
export type CloudReminderControls = {
  read: () => Promise<ReminderSnapshot>;
  save: (
    preferences: ReminderPreferences,
    revision: number,
  ) => Promise<{ revision: number }>;
  register: (device: ReminderDevice) => Promise<void>;
  test: (id: string) => Promise<void>;
};
const registrationKey = "bloom-server-reminder-registration-v1";
// Identity-scoped installation IDs keep one account from reusing another account's registration.
export async function reminderDeviceId(owner: string) {
  const key = "bloom-reminder-device:" + owner;
  const old = await AsyncStorage.getItem(key);
  if (old) return old;
  const id = randomUUID();
  await AsyncStorage.setItem(key, id);
  return id;
}
export const markReminderRegistration = () =>
  AsyncStorage.setItem(registrationKey, "yes");
export async function revokeServerReminders(token: string) {
  try {
    await cloudRequest(token, "/v1/reminders/revoke-session", {
      method: "POST",
      body: "{}",
    });
  } catch (error) {
    // Compatibility with the existing Worker before the reminder migration is deployed.
    if (!(error instanceof CloudError && error.status === 404)) throw error;
  }
  await AsyncStorage.removeItem(registrationKey);
}
