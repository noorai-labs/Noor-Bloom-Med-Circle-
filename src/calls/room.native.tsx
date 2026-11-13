import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import {
  AudioSession,
  RNKeyProvider,
  RNE2EEManager,
  VideoTrack,
  registerGlobals,
} from "@livekit/react-native";
import { Room, RoomEvent, Track, LocalVideoTrack } from "livekit-client";
import { Body, Button, Card, Title } from "../components";
import type { CallCredentials } from "../call-types";
registerGlobals();
export type NativeCallProps = {
  credentials: CallCredentials;
  initialVideo: boolean;
  check: () => Promise<void>;
  onExit: (message: string) => void;
};
export default function NativeRoom({
  credentials,
  initialVideo,
  check,
  onExit,
}: NativeCallProps) {
  const [engine] = useState(() => {
    const keyProvider = new RNKeyProvider({ sharedKey: true });
    const manager = new RNE2EEManager(keyProvider, true);
    const room = new Room({
      encryption: { e2eeManager: manager },
      adaptiveStream: { pixelDensity: "screen" },
      dynacast: true,
    });
    return { keyProvider, room };
  });
  const [status, setStatus] = useState("Connecting securely…"),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [, redraw] = useState(0),
    ended = useRef(false),
    callbacks = useRef({ check, onExit });
  useEffect(() => {
    callbacks.current = { check, onExit };
  }, [check, onExit]);
  useEffect(() => {
    ended.current = false;
    const { room, keyProvider } = engine;
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    async function finish(message: string) {
      if (ended.current) return;
      ended.current = true;
      clearTimeout(timer);
      await room.disconnect();
      await AudioSession.stopAudioSession();
      if (active) callbacks.current.onExit(message);
    }
    const changed = () => {
      if (active) redraw((v) => v + 1);
    };
    const subscribed = (
      _track: unknown,
      publication: { isEncrypted: boolean },
    ) => {
      if (!publication.isEncrypted) {
        void finish(
          "The other participant published unencrypted media. The call was closed.",
        );
        return;
      }
      changed();
    };
    const disconnected = () => {
      void finish(
        "The consultation disconnected. You can rejoin while the appointment is active.",
      );
    };
    const encryptedError = () => {
      void finish(
        "Encryption could not be maintained. The call was closed; try joining again.",
      );
    };
    room
      .on(RoomEvent.TrackSubscribed, subscribed)
      .on(RoomEvent.TrackUnsubscribed, changed)
      .on(RoomEvent.LocalTrackPublished, changed)
      .on(RoomEvent.LocalTrackUnpublished, changed)
      .on(RoomEvent.TrackMuted, changed)
      .on(RoomEvent.TrackUnmuted, changed)
      .on(RoomEvent.ParticipantConnected, changed)
      .on(RoomEvent.ParticipantDisconnected, changed)
      .on(RoomEvent.EncryptionError, encryptedError)
      .on(RoomEvent.Disconnected, disconnected)
      .on(RoomEvent.Reconnecting, () => {
        if (active) setStatus("Reconnecting…");
      })
      .on(RoomEvent.Reconnected, () => {
        if (active) setStatus("Encrypted consultation");
      });
    async function heartbeat() {
      if (!active || ended.current) return;
      try {
        if (Date.now() >= credentials.endsAt) throw new Error();
        await callbacks.current.check();
        if (active && !ended.current)
          timer = setTimeout(() => void heartbeat(), 15000);
      } catch {
        await finish(
          "Your call access expired or could not be confirmed. Rejoin after refreshing the appointment.",
        );
      }
    }
    void (async () => {
      await keyProvider.setSharedKey(credentials.sharedKey);
      await AudioSession.startAudioSession();
      if (!active) {
        await AudioSession.stopAudioSession();
        return;
      }
      await room.connect(credentials.serverUrl, credentials.token);
      if (!active) {
        await room.disconnect();
        return;
      }
      await room.setE2EEEnabled(true);
      if (!room.isE2EEEnabled)
        throw new Error("Encryption is unavailable on this build.");
      await room.localParticipant.setMicrophoneEnabled(true);
      if (initialVideo) await room.localParticipant.setCameraEnabled(true);
      if (active) {
        setConnected(true);
        setStatus("Encrypted consultation");
        changed();
        void heartbeat();
      }
    })().catch(() => {
      void finish(
        "Could not start the encrypted call. Check microphone/camera permissions and your connection, then retry.",
      );
    });
    const lifecycle = AppState.addEventListener("change", (value) => {
      if (value === "background")
        void finish("The call ended when the app moved to the background.");
    });
    return () => {
      active = false;
      ended.current = true;
      clearTimeout(timer);
      lifecycle.remove();
      room.removeAllListeners();
      void room.disconnect().finally(() => {
        keyProvider.dispose();
        void AudioSession.stopAudioSession();
      });
    };
  }, [engine, credentials, initialVideo]);
  async function control(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      redraw((v) => v + 1);
    } catch {
      setError(
        "Could not change this control. Check device permissions and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const participants = [
    engine.room.localParticipant,
    ...engine.room.remoteParticipants.values(),
  ];
  return (
    <>
      <Card>
        <Title small>{status}</Title>
        <Body muted>
          Only the appointment patient and assigned doctor can join. Camera
          starts only when you choose video. Recording is off.
        </Body>
        {!engine.room.remoteParticipants.size && (
          <Body>Waiting for the other participant…</Body>
        )}
      </Card>
      {connected &&
        participants.map((participant) => {
          const publication = participant.getTrackPublication(
            Track.Source.Camera,
          );
          return (
            <Card key={participant.identity || "local"}>
              <Title small>
                {participant === engine.room.localParticipant
                  ? "You"
                  : participant.name || "Participant"}
              </Title>
              {publication?.track && !publication.isMuted ? (
                <VideoTrack
                  trackRef={{
                    participant,
                    publication,
                    source: Track.Source.Camera,
                  }}
                  style={{ height: 260, width: "100%", borderRadius: 18 }}
                />
              ) : (
                <View style={{ minHeight: 90, justifyContent: "center" }}>
                  <Body muted>
                    Camera off ·{" "}
                    {participant.isMicrophoneEnabled
                      ? "Microphone on"
                      : "Microphone muted"}
                  </Body>
                </View>
              )}
            </Card>
          );
        })}
      {connected && (
        <Card>
          <Button
            title={
              engine.room.localParticipant.isMicrophoneEnabled
                ? "Mute microphone"
                : "Unmute microphone"
            }
            secondary
            disabled={busy}
            onPress={() =>
              void control(() =>
                engine.room.localParticipant.setMicrophoneEnabled(
                  !engine.room.localParticipant.isMicrophoneEnabled,
                ),
              )
            }
          />
          <Button
            title={
              engine.room.localParticipant.isCameraEnabled
                ? "Turn camera off"
                : "Turn camera on"
            }
            secondary
            disabled={busy}
            onPress={() =>
              void control(() =>
                engine.room.localParticipant.setCameraEnabled(
                  !engine.room.localParticipant.isCameraEnabled,
                ),
              )
            }
          />
          <Button
            title="Use speaker"
            secondary
            disabled={busy}
            onPress={() =>
              void control(async () => {
                await AudioSession.selectAudioOutput(
                  Platform.OS === "ios" ? "force_speaker" : "speaker",
                );
              })
            }
          />
          <Button
            title="Use earpiece / default audio"
            secondary
            disabled={busy}
            onPress={() =>
              void control(async () => {
                await AudioSession.selectAudioOutput(
                  Platform.OS === "ios" ? "default" : "earpiece",
                );
              })
            }
          />
          {engine.room.localParticipant.isCameraEnabled && (
            <Button
              title="Switch camera"
              secondary
              disabled={busy}
              onPress={() =>
                void control(async () => {
                  const track =
                    engine.room.localParticipant.getTrackPublication(
                      Track.Source.Camera,
                    )?.track;
                  if (track instanceof LocalVideoTrack)
                    await track.restartTrack({
                      facingMode:
                        track.mediaStreamTrack.getSettings().facingMode ===
                        "user"
                          ? "environment"
                          : "user",
                    });
                })
              }
            />
          )}
          {!!error && <Body>{error}</Body>}
        </Card>
      )}
      <Button
        title="Leave consultation"
        danger
        onPress={() => callbacks.current.onExit("You left the consultation.")}
      />
    </>
  );
}
