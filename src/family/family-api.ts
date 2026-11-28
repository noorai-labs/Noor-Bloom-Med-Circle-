import AsyncStorage from "@react-native-async-storage/async-storage";
import { CloudError, cloudRequest } from "../cloud-api";
import { cloudMode } from "../cloud-config";
import {
  FAMILY_LINK_SCOPE,
  FAMILY_PENDING_EXPIRY_DAYS,
  FAMILY_REQUEST_RATE_LIMIT_MS,
  NEUTRAL_FAMILY_REQUEST_MESSAGE,
  resolveLinkStatus,
  type FamilyLink,
  type FamilyLinkStatus,
} from "./policy";

const DEV_LINKS_KEY = "medbloom_family_links_dev_v1";
const FAMILY_CACHE_PREFIX = "medbloom_family_patient_cache_v1:";
const RATE_LIMIT_PREFIX = "medbloom_family_req_ts_v1:";

const isDevMockAllowed =
  typeof __DEV__ !== "undefined"
    ? __DEV__
    : process.env.NODE_ENV !== "production";

export class FamilyAccessDeniedError extends Error {
  constructor(message = "You no longer have permission to view this patient's records.") {
    super(message);
    this.name = "FamilyAccessDeniedError";
  }
}

export type SendFamilyRequestResult = {
  message: string;
  link?: FamilyLink;
};

export interface FamilyApi {
  sendRequest(
    familyEmail: string,
    patientEmail: string,
    token?: string,
  ): Promise<SendFamilyRequestResult>;
  listForPatient(patientEmail: string, token?: string): Promise<FamilyLink[]>;
  listForFamily(familyEmail: string, token?: string): Promise<FamilyLink[]>;
  accept(linkId: string, token?: string): Promise<FamilyLink>;
  decline(linkId: string, token?: string): Promise<FamilyLink>;
  revoke(linkId: string, token?: string): Promise<FamilyLink>;
  getLinkStatus(linkId: string, token?: string): Promise<FamilyLinkStatus>;
}

async function readDevLinks(): Promise<FamilyLink[]> {
  if (!isDevMockAllowed) return [];
  try {
    const raw = await AsyncStorage.getItem(DEV_LINKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FamilyLink[];
    const now = Date.now();
    let changed = false;
    const normalized = parsed.map((item) => {
      const nextStatus = resolveLinkStatus(item, now);
      if (nextStatus !== item.status) {
        changed = true;
        return { ...item, status: nextStatus };
      }
      return item;
    });
    if (changed) {
      await AsyncStorage.setItem(DEV_LINKS_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return [];
  }
}

async function writeDevLinks(links: FamilyLink[]): Promise<void> {
  if (!isDevMockAllowed) return;
  await AsyncStorage.setItem(DEV_LINKS_KEY, JSON.stringify(links));
}

export async function clearFamilyCache(userIdentifier?: string): Promise<void> {
  try {
    if (userIdentifier) {
      await AsyncStorage.removeItem(`${FAMILY_CACHE_PREFIX}${userIdentifier}`);
      return;
    }
    const keys = await AsyncStorage.getAllKeys();
    const targets = keys.filter((k) => k.startsWith(FAMILY_CACHE_PREFIX));
    if (targets.length) await AsyncStorage.multiRemove(targets);
  } catch {
    /* Cache cleanup must never block sign-out or revocation. */
  }
}

async function enforceRateLimit(familyEmail: string): Promise<void> {
  const key = `${RATE_LIMIT_PREFIX}${familyEmail.toLowerCase()}`;
  const raw = await AsyncStorage.getItem(key);
  const lastMs = raw ? Number(raw) : 0;
  if (Number.isFinite(lastMs) && Date.now() - lastMs < FAMILY_REQUEST_RATE_LIMIT_MS) {
    const waitSec = Math.ceil(
      (FAMILY_REQUEST_RATE_LIMIT_MS - (Date.now() - lastMs)) / 1000,
    );
    throw new Error(
      `Please wait ${waitSec}s before sending another family request.`,
    );
  }
  await AsyncStorage.setItem(key, String(Date.now()));
}

function handleCloudError(err: unknown, userIdentifier?: string): never {
  if (err instanceof CloudError && err.status === 403) {
    void clearFamilyCache(userIdentifier);
    throw new FamilyAccessDeniedError();
  }
  throw err instanceof Error ? err : new Error("Unable to complete request.");
}

// TODO(API): Replace dev/test fallback with real /v1/family/* endpoints once backend routes are deployed.
const devOnlyLocalStore: FamilyApi = {
  async sendRequest(familyEmail, patientEmail) {
    if (!isDevMockAllowed) {
      throw new Error("Family linking service is unavailable in production without API.");
    }
    const cleanFamily = familyEmail.trim().toLowerCase();
    const cleanPatient = patientEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanPatient)) {
      throw new Error("Enter a valid email address.");
    }
    if (cleanFamily === cleanPatient) {
      throw new Error("You cannot send a family link request to your own email.");
    }
    await enforceRateLimit(cleanFamily || "family");

    const links = await readDevLinks();
    const existingPending = links.find(
      (l) =>
        l.familyEmail === cleanFamily &&
        l.patientEmail === cleanPatient &&
        l.status === "pending",
    );
    if (existingPending) {
      return { message: NEUTRAL_FAMILY_REQUEST_MESSAGE, link: existingPending };
    }

    const now = new Date();
    const expires = new Date(
      now.getTime() + FAMILY_PENDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
    const created: FamilyLink = {
      id: `flink-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      patientEmail: cleanPatient,
      patientLabel: cleanPatient.split("@")[0] || "Patient",
      familyEmail: cleanFamily,
      familyLabel: cleanFamily.split("@")[0] || "Family caregiver",
      status: "pending",
      scope: FAMILY_LINK_SCOPE,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
    await writeDevLinks([created, ...links]);
    return { message: NEUTRAL_FAMILY_REQUEST_MESSAGE, link: created };
  },

  async listForPatient(patientEmail) {
    const clean = patientEmail.trim().toLowerCase();
    const links = await readDevLinks();
    return links.filter((l) => !clean || l.patientEmail === clean);
  },

  async listForFamily(familyEmail) {
    const clean = familyEmail.trim().toLowerCase();
    const links = await readDevLinks();
    return links.filter((l) => !clean || l.familyEmail === clean);
  },

  async accept(linkId) {
    const links = await readDevLinks();
    const idx = links.findIndex((l) => l.id === linkId);
    if (idx < 0) throw new Error("Family request not found.");
    const current = links[idx];
    if (resolveLinkStatus(current) === "expired") {
      throw new Error("This family request has expired.");
    }
    const updated: FamilyLink = {
      ...current,
      status: "active",
      updatedAt: new Date().toISOString(),
    };
    links[idx] = updated;
    await writeDevLinks(links);
    return updated;
  },

  async decline(linkId) {
    const links = await readDevLinks();
    const idx = links.findIndex((l) => l.id === linkId);
    if (idx < 0) throw new Error("Family request not found.");
    const updated: FamilyLink = {
      ...links[idx],
      status: "declined",
      updatedAt: new Date().toISOString(),
    };
    links[idx] = updated;
    await writeDevLinks(links);
    await clearFamilyCache(updated.familyEmail);
    return updated;
  },

  async revoke(linkId) {
    const links = await readDevLinks();
    const idx = links.findIndex((l) => l.id === linkId);
    if (idx < 0) throw new Error("Family link not found.");
    const updated: FamilyLink = {
      ...links[idx],
      status: "revoked",
      updatedAt: new Date().toISOString(),
    };
    links[idx] = updated;
    await writeDevLinks(links);
    await clearFamilyCache(updated.familyEmail);
    return updated;
  },

  async getLinkStatus(linkId) {
    const links = await readDevLinks();
    const found = links.find((l) => l.id === linkId);
    if (!found) throw new FamilyAccessDeniedError();
    return resolveLinkStatus(found);
  },
};

// TODO(API): Confirm exact backend paths and payloads with Darshan before enabling cloud calls.
const cloudFamilyApi: FamilyApi = {
  async sendRequest(familyEmail, patientEmail, token) {
    if (!token) return devOnlyLocalStore.sendRequest(familyEmail, patientEmail);
    await enforceRateLimit(familyEmail.trim().toLowerCase() || "family");
    try {
      // TODO(API): POST /v1/family/requests { patientEmail, scope: FAMILY_LINK_SCOPE }
      const res = await cloudRequest<{ link?: FamilyLink }>(
        token,
        "/v1/family/requests",
        {
          method: "POST",
          body: JSON.stringify({
            patientEmail: patientEmail.trim().toLowerCase(),
            scope: FAMILY_LINK_SCOPE,
          }),
        },
      );
      return { message: NEUTRAL_FAMILY_REQUEST_MESSAGE, link: res.link };
    } catch (err) {
      if (err instanceof CloudError && err.status === 404 && isDevMockAllowed) {
        return devOnlyLocalStore.sendRequest(familyEmail, patientEmail);
      }
      handleCloudError(err, familyEmail);
    }
  },

  async listForPatient(patientEmail, token) {
    if (!token) return devOnlyLocalStore.listForPatient(patientEmail);
    try {
      // TODO(API): GET /v1/family/requests?role=patient
      return await cloudRequest<FamilyLink[]>(
        token,
        "/v1/family/requests?role=patient",
      );
    } catch (err) {
      if (err instanceof CloudError && err.status === 404 && isDevMockAllowed) {
        return devOnlyLocalStore.listForPatient(patientEmail);
      }
      handleCloudError(err, patientEmail);
    }
  },

  async listForFamily(familyEmail, token) {
    if (!token) return devOnlyLocalStore.listForFamily(familyEmail);
    try {
      // TODO(API): GET /v1/family/requests?role=family
      return await cloudRequest<FamilyLink[]>(
        token,
        "/v1/family/requests?role=family",
      );
    } catch (err) {
      if (err instanceof CloudError && err.status === 404 && isDevMockAllowed) {
        return devOnlyLocalStore.listForFamily(familyEmail);
      }
      handleCloudError(err, familyEmail);
    }
  },

  async accept(linkId, token) {
    if (!token) return devOnlyLocalStore.accept(linkId);
    try {
      // TODO(API): POST /v1/family/requests/:id/accept
      return await cloudRequest<FamilyLink>(
        token,
        `/v1/family/requests/${encodeURIComponent(linkId)}/accept`,
        { method: "POST", body: "{}" },
      );
    } catch (err) {
      if (err instanceof CloudError && err.status === 404 && isDevMockAllowed) {
        return devOnlyLocalStore.accept(linkId);
      }
      handleCloudError(err);
    }
  },

  async decline(linkId, token) {
    if (!token) return devOnlyLocalStore.decline(linkId);
    try {
      // TODO(API): POST /v1/family/requests/:id/decline
      return await cloudRequest<FamilyLink>(
        token,
        `/v1/family/requests/${encodeURIComponent(linkId)}/decline`,
        { method: "POST", body: "{}" },
      );
    } catch (err) {
      if (err instanceof CloudError && err.status === 404 && isDevMockAllowed) {
        return devOnlyLocalStore.decline(linkId);
      }
      handleCloudError(err);
    }
  },

  async revoke(linkId, token) {
    if (!token) return devOnlyLocalStore.revoke(linkId);
    try {
      // TODO(API): POST /v1/family/requests/:id/revoke
      return await cloudRequest<FamilyLink>(
        token,
        `/v1/family/requests/${encodeURIComponent(linkId)}/revoke`,
        { method: "POST", body: "{}" },
      );
    } catch (err) {
      if (err instanceof CloudError && err.status === 404 && isDevMockAllowed) {
        return devOnlyLocalStore.revoke(linkId);
      }
      handleCloudError(err);
    }
  },

  async getLinkStatus(linkId, token) {
    if (!token) return devOnlyLocalStore.getLinkStatus(linkId);
    try {
      // TODO(API): GET /v1/family/requests/:id
      const link = await cloudRequest<FamilyLink>(
        token,
        `/v1/family/requests/${encodeURIComponent(linkId)}`,
      );
      return resolveLinkStatus(link);
    } catch (err) {
      if (err instanceof CloudError && err.status === 404 && isDevMockAllowed) {
        return devOnlyLocalStore.getLinkStatus(linkId);
      }
      handleCloudError(err);
    }
  },
};

export const familyApi: FamilyApi = cloudMode ? cloudFamilyApi : devOnlyLocalStore;
