import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
export type LoginAudience = "Patient" | "Doctor";
const key = "bloom-login-audience";
let snapshot: { audience: LoginAudience; ready: boolean } = {
  audience: "Patient",
  ready: false,
};
let revision = 0;
let reading: Promise<LoginAudience> | null = null;
let writes: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const readSnapshot = () => snapshot;
function publish(audience: LoginAudience) {
  snapshot = { audience, ready: true };
  listeners.forEach((listener) => listener());
}
// Navigation intent only: no role or clinical permission is granted here.
export async function getLoginAudience(): Promise<LoginAudience> {
  if (snapshot.ready) return snapshot.audience;
  if (!reading) {
    const ticket = revision;
    reading = AsyncStorage.getItem(key)
      .then((value) => {
        if (ticket === revision)
          publish(value === "Doctor" ? "Doctor" : "Patient");
        return snapshot.audience;
      })
      .catch(() => {
        if (ticket === revision) publish("Patient");
        return snapshot.audience;
      });
  }
  return reading;
}
export async function setLoginAudience(value: LoginAudience) {
  revision++;
  publish(value);
  writes = writes.catch(() => {}).then(() => AsyncStorage.setItem(key, value));
  await writes;
}
export function useLoginAudience() {
  const value = useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
  useEffect(() => {
    void getLoginAudience();
  }, []);
  return value;
}
