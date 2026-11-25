import type { Role } from "../clinic";

export const FAMILY_REVOKE_POLICY = "patient_can_revoke" as const;
export const FAMILY_PENDING_EXPIRY_DAYS = 7;
export const FAMILY_LINK_SCOPE = "all_records" as const;
export const FAMILY_REQUEST_RATE_LIMIT_MS = 10_000;

export const NEUTRAL_FAMILY_REQUEST_MESSAGE =
  "If this person has a MedBloom account, they will get your request.";

export type FamilyLinkStatus =
  | "pending"
  | "active"
  | "declined"
  | "revoked"
  | "expired";

export type FamilyLinkScope = typeof FAMILY_LINK_SCOPE;

export type FamilyLink = {
  id: string;
  patientEmail: string;
  patientLabel: string;
  familyEmail: string;
  familyLabel: string;
  status: FamilyLinkStatus;
  scope: FamilyLinkScope;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export function isPendingExpired(
  link: Pick<FamilyLink, "status" | "expiresAt">,
  nowMs = Date.now(),
): boolean {
  if (link.status !== "pending") return false;
  const expiresMs = Date.parse(link.expiresAt);
  return Number.isFinite(expiresMs) && nowMs >= expiresMs;
}

export function resolveLinkStatus(
  link: Pick<FamilyLink, "status" | "expiresAt">,
  nowMs = Date.now(),
): FamilyLinkStatus {
  return isPendingExpired(link, nowMs) ? "expired" : link.status;
}

export function canFamilyAccessLink(
  link: Pick<FamilyLink, "status" | "expiresAt">,
  patientConsentEnabled: boolean,
  nowMs = Date.now(),
): boolean {
  if (!patientConsentEnabled) return false;
  return resolveLinkStatus(link, nowMs) === "active";
}

export function canFamilyManageCare(
  link: Pick<FamilyLink, "status" | "expiresAt">,
  patientConsentEnabled: boolean,
  nowMs = Date.now(),
): boolean {
  return canFamilyAccessLink(link, patientConsentEnabled, nowMs);
}

export function canFamilyEditRecords(role: Role): boolean {
  return role !== "Family";
}

export function canFamilyRoleWrite(role: Role): boolean {
  return role !== "Family";
}

const RESTRICTED_FAMILY_ROUTES = [
  "/doctor-entry",
  "/doctor-availability",
  "/verification-review",
  "/admin",
] as const;

export function canFamilyRoleReachRoute(role: Role, pathname: string): boolean {
  if (role !== "Family") return true;
  return !RESTRICTED_FAMILY_ROUTES.some((blocked) =>
    pathname.startsWith(blocked),
  );
}
