import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { router } from "expo-router";
import Constants from "expo-constants";
import { reminderDeviceId } from "./cloud-reminders";
import { useClinic } from "./store";
import {
  buildReminderPlan,
  defaultReminderPreferences,
  readReminderPreferences,
  type ReminderPreferences,
} from "./reminder-plan";
import {
  configureMedicineChannel,
  medicineChannel,
  reconcileReminders,
  reminderPermission,
} from "./reminder-service";
type Controls = {
  prefs: ReminderPreferences;
  ready: boolean;
  status: string;
  error: string;
  count: number;
  delivery: "local" | "server";
  cloudStatus: string;
  cloudSupported: boolean;
  setDelivery: (mode: "local" | "server") => Promise<void>;
  refresh: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  saveMedicine: (
    id: string,
    times: string[],
    enabled: boolean,
  ) => Promise<void>;
  setShowNames: (value: boolean) => Promise<void>;
  test: () => Promise<void>;
};
const Context = createContext<Controls | null>(null);
export function MedicineReminderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state, ready, cloud } = useClinic();
  const identity =
    ready && state.session?.role === "Patient"
      ? (cloud ? "cloud:" : "demo:") +
        state.session.identifier +
        ":" +
        (cloud?.spaceId || "local")
      : "";
  const [saved, setSaved] = useState<{
    identity: string;
    tag: string;
    prefs: ReminderPreferences;
    revision: number | null;
    delivery: "local" | "server";
  } | null>(null);
  const [status, setStatus] = useState("Reminders are off");
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [cloudStatus, setCloudStatus] = useState("");
  const cloudRef = useRef(cloud);
  const pushToken = useRef("");
  useEffect(() => {
    cloudRef.current = cloud;
  }, [cloud]);
  const latestIdentity = useRef(identity);
  useEffect(() => {
    latestIdentity.current = identity;
  }, [identity]);
  useEffect(() => {
    let active = true;
    if (Platform.OS === "web") return;
    void (async () => {
      await reconcileReminders([]);
      if (!identity) return;
      const tag = (
        await digestStringAsync(CryptoDigestAlgorithm.SHA256, identity)
      ).slice(0, 24);
      const raw = await AsyncStorage.getItem("bloom-reminders-v1:" + tag);
      const mode = await AsyncStorage.getItem("bloom-reminder-delivery:" + tag);
      let prefs = readReminderPreferences(raw);
      let revision: number | null = null;
      if (cloudRef.current) {
        try {
          const remote = await cloudRef.current.reminders.read();
          revision = remote.revision;
          if (remote.preferences) prefs = remote.preferences;
          if (remote.preferences)
            await AsyncStorage.setItem(
              "bloom-reminders-v1:" + tag,
              JSON.stringify(remote.preferences),
            );
          if (active) setCloudStatus("Schedule connected to your care account");
        } catch {
          if (active)
            setCloudStatus(
              "Cloud reminder sync unavailable. Local settings remain on this phone.",
            );
        }
      }
      if (active)
        setSaved({
          identity,
          tag,
          prefs,
          revision,
          delivery: mode === "server" && cloudRef.current ? "server" : "local",
        });
    })().catch(() => {
      if (active)
        setError("Could not load notification settings. Please retry.");
    });
    return () => {
      active = false;
      void reconcileReminders([]).catch(() => {});
    };
  }, [identity]);
  const current = saved?.identity === identity ? saved : null;
  const prefs = current?.prefs || defaultReminderPreferences;
  useEffect(() => {
    if (!current || Platform.OS === "web") return;
    let active = true;
    void (async () => {
      const permission = await reminderPermission();
      if (!active) return;
      const plan = permission.allowed
        ? buildReminderPlan(current.tag, state.medicines, current.prefs)
        : [];
      await configureMedicineChannel();
      if (!active) return;
      // Local edits must take effect even if cloud device sync fails.
      await reconcileReminders(current.delivery === "local" ? plan : []);
      if (!active) return;
      const server = cloudRef.current;
      if (server && current.revision !== null) {
        const id = await reminderDeviceId(current.tag);
        const token =
          current.delivery === "server" && permission.allowed
            ? await getPushToken()
            : undefined;
        if (!active) return;
        try {
          await server.reminders.register({
            id,
            ownerTag: current.tag,
            mode: !permission.allowed ? "off" : current.delivery,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            token,
          });
        } catch (failure) {
          if (current.delivery === "server") throw failure;
          if (active)
            setCloudStatus(
              "Local alerts are active. Cloud device sync is unavailable.",
            );
        }
      }
      if (!active) return;
      if (current.delivery === "server" && current.revision === null)
        throw new Error(
          "Cloud notifications are unavailable. Reopen this screen when connected, or switch to local reminders.",
        );
      if (active) {
        setCount(plan.length);
        setError("");
        setStatus(
          current.prefs.enabled
            ? permission.allowed
              ? plan.length +
                (current.delivery === "server"
                  ? " daily cloud alerts configured"
                  : " daily alerts scheduled on this phone")
              : "Notifications are blocked in phone settings"
            : "Reminders are off",
        );
      }
    })().catch((failure) => {
      if (active) {
        setCount(0);
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not schedule reminders.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [current, state.medicines, refresh]);
  useEffect(() => {
    if (!current || !cloudRef.current || !refresh) return;
    let active = true;
    void cloudRef.current.reminders
      .read()
      .then(async (remote) => {
        if (active) {
          if (remote.preferences)
            await AsyncStorage.setItem(
              "bloom-reminders-v1:" + current.tag,
              JSON.stringify(remote.preferences),
            );
          if (!active) return;
          setSaved((old) =>
            old?.identity === current.identity &&
            (old.revision !== remote.revision || old.revision === null)
              ? {
                  ...old,
                  revision: remote.revision,
                  prefs: remote.preferences || old.prefs,
                }
              : old,
          );
          setCloudStatus("Schedule synced with your care account");
        }
      })
      .catch(() => {
        if (active)
          setCloudStatus(
            "Cloud sync unavailable. Your last saved schedule is retained.",
          );
      });
    return () => {
      active = false;
    };
  }, [refresh, current]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (value) => {
      if (value === "active") setRefresh((v) => v + 1);
    });
    const tokenListener =
      Platform.OS !== "web" && Constants.executionEnvironment !== "storeClient"
        ? Notifications.addPushTokenListener(() => {
            pushToken.current = "";
            setRefresh((value) => value + 1);
          })
        : null;
    const timer = setInterval(() => {
      if (cloudRef.current && AppState.currentState === "active")
        setRefresh((v) => v + 1);
    }, 30000);
    return () => {
      listener.remove();
      tokenListener?.remove();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!current || Platform.OS === "web") return;
    function open(response: Notifications.NotificationResponse | null) {
      if (
        response?.notification.request.content.data?.kind !==
          "bloom-medicine" ||
        response.notification.request.content.data.owner !== current!.tag
      )
        return;
      router.push("/medicines");
      Notifications.clearLastNotificationResponse();
    }
    open(Notifications.getLastNotificationResponse());
    const subscription =
      Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [current]);
  async function save(next: ReminderPreferences) {
    if (!current || latestIdentity.current !== identity)
      throw new Error("Open your patient care space before setting reminders.");
    buildReminderPlan(current.tag, state.medicines, next);
    let revision = current.revision;
    if (cloudRef.current) {
      if (revision === null) {
        if (current.delivery === "server")
          throw new Error(
            "Connect to the reminder server before editing cloud alerts.",
          );
        setCloudStatus(
          "Saved on this phone only; cloud reminder sync is unavailable.",
        );
      } else {
        const remote = await cloudRef.current.reminders.save(next, revision);
        revision = remote.revision;
        setCloudStatus("Schedule synced with your care account");
      }
    }
    await AsyncStorage.setItem(
      "bloom-reminders-v1:" + current.tag,
      JSON.stringify(next),
    );
    if (latestIdentity.current === identity)
      setSaved({ ...current, prefs: next, revision });
  }
  async function getPushToken() {
    if (Constants.executionEnvironment === "storeClient")
      throw new Error(
        "Server push requires an installed BLOOM MED development or APK build. Expo Go supports local reminders.",
      );
    if (pushToken.current) return pushToken.current;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    if (!projectId)
      throw new Error("The Expo project ID is missing from this build.");
    pushToken.current = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;
    return pushToken.current;
  }
  const controls: Controls = {
    prefs,
    ready: !!current,
    status:
      Platform.OS === "web"
        ? "Open the mobile app to enable notifications"
        : status,
    error,
    count,
    delivery: current?.delivery || "local",
    cloudStatus,
    refresh: async () => {
      setRefresh((value) => value + 1);
    },
    cloudSupported: !!cloud,
    setDelivery: async (delivery) => {
      if (!current || !cloudRef.current)
        throw new Error("Cloud reminders require your signed-in care account.");
      if (current.revision === null)
        throw new Error(
          "The reminder server is unavailable. Reopen the app after the backend update is deployed.",
        );
      if (delivery === "server") {
        if (!(await reminderPermission()).allowed)
          throw new Error("Enable notification permission first.");
        await getPushToken();
        await reconcileReminders([]);
      } else {
        // Revoke push before enabling local alerts so a transition cannot run both.
        await cloudRef.current.reminders.register({
          id: await reminderDeviceId(current.tag),
          ownerTag: current.tag,
          mode: "local",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }
      await AsyncStorage.setItem(
        "bloom-reminder-delivery:" + current.tag,
        delivery,
      );
      if (latestIdentity.current === identity)
        setSaved({ ...current, delivery });
    },
    setEnabled: async (enabled) => {
      if (Platform.OS === "web")
        throw new Error("Notifications are available in the mobile app.");
      if (enabled) {
        await configureMedicineChannel();
        let permission = await reminderPermission();
        if (!permission.allowed && permission.canAskAgain) {
          await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: false, allowSound: true },
          });
          permission = await reminderPermission();
        }
        if (!permission.allowed)
          throw new Error(
            "Allow BLOOM MED notifications in your phone settings, then try again.",
          );
      }
      await save({ ...prefs, enabled });
      if (!enabled) await reconcileReminders([]);
    },
    saveMedicine: async (id, times, enabled) =>
      save({
        ...prefs,
        medicines: { ...prefs.medicines, [id]: { times, enabled } },
      }),
    setShowNames: async (showNames) => save({ ...prefs, showNames }),
    test: async () => {
      if (!current || !prefs.enabled || !(await reminderPermission()).allowed)
        throw new Error("Enable notifications first.");
      if (current.delivery === "server") {
        if (!cloudRef.current)
          throw new Error("Connect your care account first.");
        await cloudRef.current.reminders.test(
          await reminderDeviceId(current.tag),
        );
        return;
      }
      await Notifications.scheduleNotificationAsync({
        identifier: "bloom-med:" + current.tag + ":test",
        content: {
          title: "BLOOM MED reminders are ready",
          body: "Your phone can display medicine reminders.",
          sound: "default",
          data: { kind: "bloom-medicine", owner: current.tag },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          channelId: medicineChannel,
        },
      });
    },
  };
  return <Context.Provider value={controls}>{children}</Context.Provider>;
}
export function useMedicineReminders() {
  const context = useContext(Context);
  if (!context) throw new Error("MedicineReminderProvider missing");
  return context;
}
