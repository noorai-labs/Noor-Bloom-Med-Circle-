import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Action,
  ClinicState,
  createState,
  migrate,
  transition,
} from "./clinic";
const KEY = "bloom-med-clinic-v2";
export type CloudControls = {
  calls: {
    join: (visitId: string) => Promise<import("./call-types").CallCredentials>;
    status: (visitId: string) => Promise<{ allowed: boolean; endsAt: number }>;
    leave: (visitId: string) => Promise<void>;
  };
  verification: {
    request: <T>(path: string, body?: unknown) => Promise<T>;
    upload: (asset: {
      uri: string;
      name: string;
      mimeType?: string;
      file?: globalThis.File;
    }) => Promise<{ id: string; name: string; mime: string }>;
    download: (id: string) => Promise<string>;
  };
  reminders: import("./cloud-reminders").CloudReminderControls;
  status: string;
  recordsAccessible: boolean;
  error: string;
  spaces: import("./cloud-api").CareSpace[];
  spaceId: string;
  refresh: () => Promise<void>;
  select: (space: string) => Promise<void>;
  signOut: () => Promise<void>;
  upload: (asset: {
    uri: string;
    name: string;
    mimeType?: string;
    file?: globalThis.File;
  }) => Promise<{ fileId: string; mime: string }>;
  download: (fileId: string) => Promise<string>;
  recordAccess: () => Promise<
    { userId: string; role: string; granted: number }[]
  >;
  setRecordAccess: (userId: string, granted: boolean) => Promise<void>;
  amendRecord: (
    recordId: string,
    detail: string,
    reason: string,
  ) => Promise<void>;
  recordHistory: (recordId: string) => Promise<
    {
      version: number;
      metadata: string;
      actorId: string;
      reason: string;
      createdAt: string;
    }[]
  >;
};
export type Store = {
  state: ClinicState;
  ready: boolean;
  toast: string;
  notify: (text: string) => void;
  dispatch: (a: Action) => boolean;
  cloud?: CloudControls;
};
export const ClinicContext = createContext<Store | null>(null);
export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(createState),
    [ready, setReady] = useState(false),
    [toast, setToast] = useState("");
  const current = useRef(state);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    (async () => {
      try {
        const raw =
          (await AsyncStorage.getItem(KEY)) ||
          (await AsyncStorage.getItem("bloom-med-demo-v1"));
        const value = migrate(raw ? JSON.parse(raw) : null);
        current.current = value;
        setState(value);
      } catch {
        setToast(
          "Saved data could not be restored. A fresh local demo is ready.",
        );
      } finally {
        setReady(true);
      }
    })();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  function dispatch(a: Action) {
    try {
      const next = transition(current.current, a);
      current.current = next;
      setState(next);
      queue.current = queue.current
        .catch(() => {})
        .then(() => AsyncStorage.setItem(KEY, JSON.stringify(next)))
        .catch(() =>
          setToast(
            "Storage unavailable. Changes are only saved for this session.",
          ),
        );
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Unable to update. Try again.");
      return false;
    }
  }
  return (
    <ClinicContext.Provider
      value={{ state, ready, dispatch, toast, notify: setToast }}
    >
      {children}
    </ClinicContext.Provider>
  );
}
export function useClinic() {
  const context = useContext(ClinicContext);
  if (!context) throw new Error("ClinicProvider missing");
  return context;
}
