import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Redirect, router } from "expo-router";
import { useClinic } from "../store";
import { setLoginAudience, useLoginAudience } from "../login-audience";
import { BloomLogo } from "../branding";
import { Body, Button, Card, Chip, Empty, Screen, Title } from "../components";
import type { VerificationSnapshot } from "../verification-types";
export default function DoctorEntry() {
  const { state, cloud, notify } = useClinic();
  const { audience, ready } = useLoginAudience();
  const client = useRef(cloud?.verification);
  useEffect(() => {
    client.current = cloud?.verification;
  }, [cloud]);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<VerificationSnapshot | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    if (client.current)
      void client.current
        .request<VerificationSnapshot>("")
        .then((value) => {
          if (active) setVerification(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [state.session?.identifier]);
  if (!ready) return null;
  if (!state.session) return <Redirect href="/sign-in" />;
  if (state.session.role === "Doctor" || audience === "Patient")
    return <Redirect href="/(tabs)" />;
  const application = verification?.applications.find(
    (item) => item.kind === "Doctor",
  );
  const spaces = cloud?.spaces.filter((space) => space.role === "Doctor") || [];
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Your doctor account" noGuard>
      <View style={{ gap: 16 }}>
        <BloomLogo size={52} />
        <Title>Welcome to your doctor workspace</Title>
        <Body muted>
          You signed in successfully. Professional approval and patient
          assignments are managed separately from account sign-in.
        </Body>
      </View>
      <Card>
        <Title small>Professional verification</Title>
        {application ? (
          <>
            <Chip title={application.status} />
            <Body>
              {application.reason ||
                "Open your application to see its review details."}
            </Body>
          </>
        ) : (
          <Body>
            Submit your registration and supporting documents for manual review.
          </Body>
        )}
        <Button
          title={application ? "View doctor application" : "Apply as a doctor"}
          disabled={busy}
          onPress={() =>
            router.push({
              pathname: "/verification",
              params: { kind: "Doctor" },
            })
          }
        />
      </Card>
      <Card>
        <Title small>Assigned patient workspaces</Title>
        {spaces.length ? (
          spaces.map((space) => (
            <Button
              key={space.id}
              title={"Open " + space.name}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await cloud!.select(space.id);
                })
              }
            />
          ))
        ) : (
          <Empty
            title="No doctor care space assigned yet"
            body="After approval, your care administrator must assign your doctor account to a patient. Signing in as Doctor does not grant access to patient records."
          />
        )}
        <Button
          title={busy ? "Checking..." : "Refresh doctor access"}
          secondary
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await cloud?.refresh();
              if (cloud)
                setVerification(
                  await cloud.verification.request<VerificationSnapshot>(""),
                );
            })
          }
        />
      </Card>
      <Button
        title="Continue as a patient instead"
        secondary
        disabled={busy}
        onPress={() =>
          void run(async () => {
            await setLoginAudience("Patient");
            router.replace(state.onboarded ? "/(tabs)" : "/onboarding");
          })
        }
      />
      <Button
        title="Sign out"
        secondary
        disabled={busy}
        onPress={() =>
          void run(async () => {
            await cloud?.signOut();
            router.replace("/sign-in");
          })
        }
      />
    </Screen>
  );
}
