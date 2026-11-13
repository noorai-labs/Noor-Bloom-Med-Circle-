import React from "react";
import { Redirect } from "expo-router";
import { ProfileForm } from "../screens/auth";
import { useClinic } from "../store";
import { cloudMode } from "../cloud-config";
import { useLoginAudience } from "../login-audience";
export default function Onboarding() {
  const { state } = useClinic();
  const { audience, ready } = useLoginAudience();
  if (cloudMode && !ready) return null;
  if (cloudMode && state.session && audience === "Doctor")
    return (
      <Redirect
        href={state.session.role === "Doctor" ? "/(tabs)" : "/doctor-entry"}
      />
    );
  return <ProfileForm onboarding />;
}
