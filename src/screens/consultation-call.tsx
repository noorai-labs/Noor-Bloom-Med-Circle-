import React, { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useLocalSearchParams } from "expo-router";
import { useClinic } from "../store";
import { Body, Button, Card, Screen, Title } from "../components";
import type { CallCredentials } from "../call-types";
function RoomEntry(props: {
  credentials: CallCredentials;
  initialVideo: boolean;
  check: () => Promise<void>;
  onExit: (message: string) => void;
}) {
  // Load native WebRTC only after the native-build check; Expo Go must still open the app.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NativeRoom = require("../calls/room").default;
  return <NativeRoom {...props} />;
}
export default function ConsultationCall() {
  const { visitId } = useLocalSearchParams<{ visitId: string }>(),
    { cloud } = useClinic();
  const client = useRef(cloud?.calls);
  useEffect(() => {
    client.current = cloud?.calls;
  }, [cloud]);
  const [credentials, setCredentials] = useState<CallCredentials | null>(null),
    [video, setVideo] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const unsupported =
    Platform.OS === "web" || Constants.executionEnvironment === "storeClient";
  const joining = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      void client.current?.leave(visitId).catch(() => {});
    };
  }, [visitId]);
  async function join(withVideo: boolean) {
    if (!cloud || joining.current) return;
    joining.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await cloud.calls.join(visitId);
      if (active.current) {
        setVideo(withVideo);
        setCredentials(result);
      } else await cloud.calls.leave(visitId);
    } catch (e) {
      if (active.current)
        setMessage(
          e instanceof Error ? e.message : "Could not join the consultation.",
        );
    } finally {
      joining.current = false;
      if (active.current) setBusy(false);
    }
  }
  function exit(reason: string) {
    setCredentials(null);
    setMessage(reason);
    void client.current?.leave(visitId).catch(() => {
      if (active.current) setMessage(reason + " Server cleanup will retry.");
    });
  }
  return (
    <Screen title="Online consultation" subtitle="Private audio and video" back>
      {credentials ? (
        <RoomEntry
          credentials={credentials}
          initialVideo={video}
          onExit={exit}
          check={async () => {
            const status = await client.current?.status(visitId);
            if (!status?.allowed) throw new Error("Call access ended.");
          }}
        />
      ) : (
        <Card>
          <Title small>Ready for your appointment?</Title>
          <Body muted>
            Microphone access is needed for audio. Video also needs camera
            permission. Both participants need active verification approval.
            Joining opens 10 minutes before the scheduled appointment and closes
            60 minutes after its start.
          </Body>
          {unsupported ? (
            <Body>
              Install the latest BLOOM MED APK to use encrypted calls. Expo Go
              and the browser preview do not support this call screen.
            </Body>
          ) : !cloud ? (
            <Body>Sign in to your cloud care account to join.</Body>
          ) : (
            <>
              <Button
                title="Join with audio"
                loading={busy}
                disabled={busy}
                onPress={() => void join(false)}
              />
              <Button
                title="Join with video"
                secondary
                disabled={busy}
                onPress={() => void join(true)}
              />
            </>
          )}
          <Body muted>
            No recording is started. Leaving this screen or putting the app in
            the background ends your participation.
          </Body>
        </Card>
      )}
      {!!message && (
        <Card>
          <Body>{message}</Body>
        </Card>
      )}
    </Screen>
  );
}
