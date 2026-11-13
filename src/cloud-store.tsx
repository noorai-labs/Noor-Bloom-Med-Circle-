import { createCloudState } from "./cloud-state";
import { getLoginAudience } from "./login-audience";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
import { Directory, File, Paths } from "expo-file-system";
import { type Action } from "./clinic";
import { cloudTransition } from "./cloud-transition";
import { apiUrl } from "./cloud-config";
import {
  cloudRequest,
  CloudError,
  readCloud,
  writeCloud,
  type CloudSnapshot,
  type CareSpace,
} from "./cloud-api";
import { ClinicContext } from "./store";
import { StartupLoader } from "./branding";
import { clearMedicineReminders } from "./reminder-service";
import { setAuthFlow } from "./auth-flow";
import {
  markReminderRegistration,
  revokeServerReminders,
} from "./cloud-reminders";

export function CloudClinicProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();
  if (!auth.isLoaded) return <StartupLoader />;
  return (
    <CloudUserStore key={auth.userId || "signed-out"}>
      {children}
    </CloudUserStore>
  );
}
function CloudUserStore({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState(createCloudState);
  const [ready, setReady] = useState(!auth.isSignedIn);
  const [toast, setToast] = useState("");
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const [spaces, setSpaces] = useState<CareSpace[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [recordsAccessible, setRecordsAccessible] = useState(false);
  const base = useRef<CloudSnapshot | null>(null);
  const pending = useRef<{ action: Action; operationId: string }[]>([]);
  const processing = useRef(false);
  const generation = useRef(0);
  const loadSequence = useRef(0);
  const getToken = auth.getToken;
  const tokenGetter = useRef(getToken);
  const signingOut = useRef(false);
  useEffect(() => {
    tokenGetter.current = getToken;
  }, [getToken]);
  const token = useCallback(async () => {
    const value = await tokenGetter.current({ skipCache: true });
    if (!value) throw new Error("Sign in again to continue.");
    return value;
  }, []);
  const publish = () => {
    if (!base.current) return;
    let next = base.current.state;
    for (const entry of pending.current)
      next = cloudTransition(next, entry.action, entry.operationId);
    setState(next);
  };
  const load = useCallback(
    async (selected = "") => {
      if (processing.current) return;
      const epoch = generation.current;
      const ticket = ++loadSequence.current;
      try {
        const jwt = await token();
        setStatus("Connecting");
        setError("");
        const available = await cloudRequest<CareSpace[]>(jwt, "/v1/spaces");
        const audience = selected ? null : await getLoginAudience();
        const preferred =
          selected ||
          available.find((space) => space.role === audience)?.id ||
          "";
        const snapshot = await readCloud(jwt, preferred);
        if (
          epoch !== generation.current ||
          ticket !== loadSequence.current ||
          processing.current
        )
          return;
        base.current = snapshot;
        pending.current = [];
        setState(snapshot.state);
        setRecordsAccessible(snapshot.recordsAccess === true);
        setSpaceId(snapshot.spaceId);
        setSpaces(available);
        setStatus("Synced");
        return true;
      } catch (e) {
        if (epoch !== generation.current || ticket !== loadSequence.current)
          return;
        if (e instanceof CloudError && [401, 403].includes(e.status)) {
          base.current = null;
          pending.current = [];
          setState(createCloudState());
          setRecordsAccessible(false);
        }
        setError(e instanceof Error ? e.message : "Could not connect.");
        setStatus("Connection failed");
        return false;
      } finally {
        if (epoch === generation.current) setReady(true);
      }
    },
    [token],
  );
  useEffect(() => {
    if (!auth.isSignedIn) return;
    const lifecycle = generation;
    lifecycle.current++;
    // Hydrate external server state on authentication changes; this is not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      lifecycle.current++;
    };
  }, [auth.isSignedIn, load]);
  useEffect(() => {
    if (!auth.isSignedIn) return;
    const listener = AppState.addEventListener("change", (value) => {
      if (value === "active") void load(spaceId);
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void load(spaceId);
    }, 30000);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, [auth.isSignedIn, load, spaceId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function drain() {
    if (processing.current || !base.current) return;
    processing.current = true;
    const epoch = generation.current;
    setStatus("Saving");
    try {
      while (
        pending.current.length &&
        base.current &&
        epoch === generation.current
      ) {
        const entry = pending.current[0];
        const saved = await writeCloud(
          await token(),
          base.current.spaceId,
          base.current.revision,
          entry.action,
          entry.operationId,
        );
        if (epoch !== generation.current) return;
        base.current = saved;
        pending.current.shift();
        publish();
      }
      if (epoch === generation.current) {
        setStatus("Synced");
        setError("");
      }
    } catch (e) {
      if (epoch !== generation.current) return;
      pending.current = [];
      const message = e instanceof Error ? e.message : "Cloud save failed.";
      setError(message);
      setToast(
        message + " Unsaved changes were reverted. Refresh before retrying.",
      );
      setStatus("Save failed");
      if (e instanceof CloudError && [401, 403].includes(e.status)) {
        base.current = null;
        setState(createCloudState());
      }
      try {
        if (base.current) {
          base.current = await readCloud(await token(), base.current.spaceId);
          publish();
        }
      } catch {
        publish();
      }
    } finally {
      if (epoch === generation.current) processing.current = false;
    }
  }
  function dispatch(action: Action) {
    if (action.type === "session") {
      setToast("Cloud roles are assigned by your care administrator.");
      return false;
    }
    if (!base.current || error) {
      setToast("Refresh your cloud connection before making changes.");
      return false;
    }
    try {
      const entry = { action, operationId: randomUUID() };
      let next = base.current.state;
      for (const queued of [...pending.current, entry])
        next = cloudTransition(next, queued.action, queued.operationId);
      pending.current.push(entry);
      setState(next);
      void drain();
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Unable to update.");
      return false;
    }
  }
  async function upload(asset: {
    uri: string;
    name: string;
    mimeType?: string;
    file?: globalThis.File;
  }) {
    if (!base.current) throw new Error("Cloud connection is not ready.");
    const response = await expoFetch(
      apiUrl +
        "/v1/files?space=" +
        encodeURIComponent(base.current.spaceId) +
        "&name=" +
        encodeURIComponent(asset.name),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (await token()),
          "Content-Type": asset.mimeType || "application/octet-stream",
        },
        body: Platform.OS === "web" ? asset.file : new File(asset.uri),
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed.");
    return result as { fileId: string; mime: string };
  }
  async function download(fileId: string, verification = false) {
    if (!base.current || Platform.OS === "web")
      throw new Error("Open attachments in the mobile app.");
    const epoch = generation.current;
    const response = await expoFetch(
      apiUrl +
        (verification ? "/v1/verification/documents/" : "/v1/files/") +
        encodeURIComponent(fileId) +
        "?space=" +
        encodeURIComponent(base.current.spaceId),
      { headers: { Authorization: "Bearer " + (await token()) } },
    );
    if (!response.ok)
      throw new Error("Could not download this private attachment.");
    if (epoch !== generation.current)
      throw new Error("Your account changed. Open this file again.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (epoch !== generation.current || signingOut.current)
      throw new Error("Your account changed. Open this file again.");
    const extension = response.headers.get("Content-Type")?.includes("pdf")
      ? ".pdf"
      : ".image";
    const directory = new Directory(Paths.cache, "bloom-cloud-" + auth.userId);
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, "bloom-" + fileId + extension);
    file.create({ overwrite: true });
    await file.write(bytes);
    return file.uri;
  }
  return (
    <ClinicContext.Provider
      value={{
        state,
        ready,
        toast,
        notify: setToast,
        dispatch,
        cloud: {
          calls: {
            join: async (visitId) =>
              cloudRequest(
                await token(),
                "/v1/calls/" +
                  encodeURIComponent(visitId) +
                  "/join?space=" +
                  encodeURIComponent(spaceId),
                { method: "POST", body: "{}" },
              ),
            status: async (visitId) =>
              cloudRequest(
                await token(),
                "/v1/calls/" +
                  encodeURIComponent(visitId) +
                  "/status?space=" +
                  encodeURIComponent(spaceId),
              ),
            leave: async (visitId) => {
              await cloudRequest(
                await token(),
                "/v1/calls/" +
                  encodeURIComponent(visitId) +
                  "/leave?space=" +
                  encodeURIComponent(spaceId),
                { method: "POST", body: "{}" },
              );
            },
          },
          verification: {
            request: async <T,>(path: string, body?: unknown) =>
              cloudRequest<T>(
                await token(),
                "/v1/verification" + path,
                body === undefined
                  ? {}
                  : { method: "POST", body: JSON.stringify(body) },
              ),
            upload: async (asset) => {
              const epoch = generation.current;
              const response = await expoFetch(
                apiUrl +
                  "/v1/verification/documents?consent=1&name=" +
                  encodeURIComponent(asset.name),
                {
                  method: "POST",
                  headers: {
                    Authorization: "Bearer " + (await token()),
                    "Content-Type":
                      asset.mimeType || "application/octet-stream",
                  },
                  body:
                    Platform.OS === "web" ? asset.file : new File(asset.uri),
                },
              );
              const result = await response.json();
              if (epoch !== generation.current || signingOut.current)
                throw new Error(
                  "Your account changed. Try again after signing in.",
                );
              if (!response.ok)
                throw new Error(result.error || "Evidence upload failed.");
              return result;
            },
            download: async (id) => download(id, true),
          },
          reminders: {
            read: async () =>
              cloudRequest(
                await token(),
                "/v1/reminders?space=" + encodeURIComponent(spaceId),
              ),
            save: async (preferences, revision) =>
              cloudRequest(
                await token(),
                "/v1/reminders?space=" + encodeURIComponent(spaceId),
                {
                  method: "POST",
                  body: JSON.stringify({ preferences, revision }),
                },
              ),
            register: async (device) => {
              await cloudRequest(
                await token(),
                "/v1/reminders/device?space=" + encodeURIComponent(spaceId),
                { method: "POST", body: JSON.stringify(device) },
              );
              await markReminderRegistration();
            },
            test: async (id) => {
              await cloudRequest(
                await token(),
                "/v1/reminders/test?space=" + encodeURIComponent(spaceId),
                { method: "POST", body: JSON.stringify({ id }) },
              );
            },
          },
          status,
          recordsAccessible,
          error,
          spaces,
          spaceId,
          refresh: async () => {
            await load(spaceId);
          },
          select: async (value) => {
            if (processing.current) {
              throw new Error("Wait for your changes to finish saving.");
            }
            setReady(false);
            if (!(await load(value)))
              throw new Error("Could not open the selected care space.");
          },
          signOut: async () => {
            if (signingOut.current) return;
            if (processing.current)
              throw new Error(
                "Wait for your care changes to finish saving before signing out.",
              );
            signingOut.current = true;
            generation.current++;
            pending.current = [];
            try {
              await revokeServerReminders(await token());
              await clearMedicineReminders();
              await auth.signOut();
              setAuthFlow({ busy: false, error: "" });
              base.current = null;
              if (Platform.OS !== "web") {
                try {
                  const directory = new Directory(
                    Paths.cache,
                    "bloom-cloud-" + auth.userId,
                  );
                  if (directory.exists) directory.delete();
                } catch {
                  /* Cache cleanup must not prevent account sign-out. */
                }
              }
              router.replace("/sign-in");
            } catch (failure) {
              signingOut.current = false;
              throw failure;
            }
          },
          recordAccess: async () =>
            cloudRequest(
              await token(),
              "/v1/records/access?space=" + encodeURIComponent(spaceId),
            ),
          setRecordAccess: async (userId, granted) => {
            await cloudRequest(
              await token(),
              "/v1/records/access?space=" + encodeURIComponent(spaceId),
              { method: "POST", body: JSON.stringify({ userId, granted }) },
            );
          },
          amendRecord: async (recordId, detail, reason) => {
            if (processing.current || !base.current)
              throw new Error(
                "Wait for changes to save before correcting a record.",
              );
            processing.current = true;
            try {
              await cloudRequest(
                await token(),
                "/v1/records/" +
                  encodeURIComponent(recordId) +
                  "/amend?space=" +
                  encodeURIComponent(spaceId),
                {
                  method: "POST",
                  body: JSON.stringify({
                    revision: base.current.revision,
                    detail,
                    reason,
                  }),
                },
              );
            } finally {
              processing.current = false;
            }
            await load(spaceId);
          },
          recordHistory: async (recordId) =>
            cloudRequest(
              await token(),
              "/v1/records/" +
                encodeURIComponent(recordId) +
                "/history?space=" +
                encodeURIComponent(spaceId),
            ),
          upload,
          download,
        },
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
}
