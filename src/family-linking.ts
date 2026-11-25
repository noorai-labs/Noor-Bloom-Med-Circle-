import AsyncStorage from "@react-native-async-storage/async-storage";

export type FamilyRelationship =
  | "Spouse"
  | "Parent"
  | "Child"
  | "Sibling"
  | "Caregiver";

export type FamilyLinkStatus = "Pending" | "Active" | "Revoked";

export type FamilyConsentPermissions = {
  appointments: boolean;
  medicines: boolean;
  records: boolean;
  sosAlerts: boolean;
};

export type FamilyMemberLink = {
  id: string;
  name: string;
  contact: string;
  relationship: FamilyRelationship;
  status: FamilyLinkStatus;
  direction: "invited" | "requested";
  permissions: FamilyConsentPermissions;
  linkedAt: string;
};

export type FamilyInviteCode = {
  code: string;
  expiresAt: string;
};

export const DEFAULT_PERMISSIONS: FamilyConsentPermissions = {
  appointments: true,
  medicines: true,
  records: false,
  sosAlerts: true,
};

const LINKS_KEY = "bloom_family_links_v1";
const PERMS_KEY = "bloom_family_perms_v1";
const CODE_KEY = "bloom_family_code_v1";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 3; i++) {
    part1 += chars[Math.floor(Math.random() * chars.length)];
    part2 += chars[Math.floor(Math.random() * chars.length)];
  }
  return `MB-${part1}-${part2}`;
}

export async function getFamilyLinks(
  userId: string,
): Promise<FamilyMemberLink[]> {
  try {
    const raw = await AsyncStorage.getItem(`${LINKS_KEY}:${userId}`);
    if (raw) return JSON.parse(raw) as FamilyMemberLink[];
  } catch {
    /* ignore storage errors */
  }
  return [];
}

export async function saveFamilyLinks(
  userId: string,
  links: FamilyMemberLink[],
): Promise<void> {
  await AsyncStorage.setItem(`${LINKS_KEY}:${userId}`, JSON.stringify(links));
}

export async function getFamilyPermissions(
  userId: string,
): Promise<FamilyConsentPermissions> {
  try {
    const raw = await AsyncStorage.getItem(`${PERMS_KEY}:${userId}`);
    if (raw) return JSON.parse(raw) as FamilyConsentPermissions;
  } catch {
    /* ignore storage errors */
  }
  return DEFAULT_PERMISSIONS;
}

export async function saveFamilyPermissions(
  userId: string,
  perms: FamilyConsentPermissions,
): Promise<void> {
  await AsyncStorage.setItem(`${PERMS_KEY}:${userId}`, JSON.stringify(perms));
}

export async function getOrCreateInviteCode(
  userId: string,
): Promise<FamilyInviteCode> {
  try {
    const raw = await AsyncStorage.getItem(`${CODE_KEY}:${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as FamilyInviteCode;
      if (new Date(parsed.expiresAt).getTime() > Date.now()) {
        return parsed;
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return regenerateInviteCode(userId);
}

export async function regenerateInviteCode(
  userId: string,
): Promise<FamilyInviteCode> {
  const next: FamilyInviteCode = {
    code: generateCode(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  };
  await AsyncStorage.setItem(`${CODE_KEY}:${userId}`, JSON.stringify(next));
  return next;
}

export async function createFamilyInvite(
  userId: string,
  name: string,
  contact: string,
  relationship: FamilyRelationship,
  permissions: FamilyConsentPermissions,
): Promise<FamilyMemberLink[]> {
  const existing = await getFamilyLinks(userId);
  const entry: FamilyMemberLink = {
    id: `fam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    contact: contact.trim(),
    relationship,
    status: "Active",
    direction: "invited",
    permissions,
    linkedAt: new Date().toISOString(),
  };
  const next = [entry, ...existing];
  await saveFamilyLinks(userId, next);
  return next;
}

export async function submitFamilyLinkRequest(
  userId: string,
  patientCodeOrEmail: string,
  relationship: FamilyRelationship,
): Promise<FamilyMemberLink[]> {
  const existing = await getFamilyLinks(userId);
  const clean = patientCodeOrEmail.trim();
  const isInviteCode = /^MB-[A-Z0-9]{3}-[A-Z0-9]{3}$/i.test(clean);
  const entry: FamilyMemberLink = {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: isInviteCode ? `Care Circle (${clean.toUpperCase()})` : clean,
    contact: clean,
    relationship,
    status: isInviteCode ? "Active" : "Pending",
    direction: "requested",
    permissions: DEFAULT_PERMISSIONS,
    linkedAt: new Date().toISOString(),
  };
  const next = [entry, ...existing];
  await saveFamilyLinks(userId, next);
  return next;
}

export async function updateFamilyLinkStatus(
  userId: string,
  linkId: string,
  status: FamilyLinkStatus,
): Promise<FamilyMemberLink[]> {
  const existing = await getFamilyLinks(userId);
  const next = existing.map((item) =>
    item.id === linkId ? { ...item, status } : item,
  );
  await saveFamilyLinks(userId, next);
  return next;
}

export async function updateMemberPermissions(
  userId: string,
  linkId: string,
  permissions: FamilyConsentPermissions,
): Promise<FamilyMemberLink[]> {
  const existing = await getFamilyLinks(userId);
  const next = existing.map((item) =>
    item.id === linkId ? { ...item, permissions } : item,
  );
  await saveFamilyLinks(userId, next);
  return next;
}
