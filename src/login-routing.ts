import type { Session } from "./clinic";
import type { LoginAudience } from "./login-audience";
export function postLoginRoute(
  session: Session | null,
  onboarded: boolean,
  audience: LoginAudience,
): "/sign-in" | "/doctor-entry" | "/onboarding" | "/(tabs)" {
  if (!session) return "/sign-in";
  if (audience === "Doctor" && session.role !== "Doctor")
    return "/doctor-entry";
  return session.role === "Patient" && !onboarded ? "/onboarding" : "/(tabs)";
}
