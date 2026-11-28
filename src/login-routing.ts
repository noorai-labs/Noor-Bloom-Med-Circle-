import type { Role, Session } from "./clinic";
import type { LoginAudience } from "./login-audience";

export function postLoginRoute(
  session: Session | null,
  onboarded: boolean,
  audience: LoginAudience,
  doctorApproved = false,
): "/sign-in" | "/doctor-entry" | "/onboarding" | "/(tabs)" {
  if (!session) return "/sign-in";
  if (audience === "Doctor" && session.role !== "Doctor" && !doctorApproved)
    return "/doctor-entry";
  if (audience === "Doctor" && (session.role === "Doctor" || doctorApproved))
    return "/(tabs)";
  if (session.role === "Family") return "/(tabs)";
  return session.role === "Patient" && !onboarded ? "/onboarding" : "/(tabs)";
}

const FAMILY_BLOCKED_PREFIXES = [
  "/doctor-entry",
  "/doctor-availability",
  "/verification-review",
  "/admin",
] as const;

export function canAccessRoute(role: Role, pathname: string): boolean {
  if (role !== "Family") return true;
  return !FAMILY_BLOCKED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}
