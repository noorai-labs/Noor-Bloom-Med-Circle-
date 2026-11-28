import { apiUrl } from "./cloud-config";
import type { Action, ClinicState, Role } from "./clinic";
export type CloudSnapshot = {
  state: ClinicState;
  revision: number;
  spaceId: string;
  recordsAccess?: boolean;
};
export type CareSpace = {
  id: string;
  name: string;
  role: Role;
  providerId: string;
};
export class CloudError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function cloudRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(apiUrl + path, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: "Bearer " + token,
      },
    });
    const result = await response.json();
    if (!response.ok)
      throw new CloudError(
        result.error || "Cloud request failed.",
        response.status,
      );
    return result as T;
  } finally {
    clearTimeout(timer);
  }
}
export type PublicProvider = {
  id: string;
  name: string;
  kind: "Doctor" | "Nurse";
  qualification: string;
  registrationNumber: string;
  authority: string;
  specialty: string;
  languages: string[];
  modes: string[];
  verified: boolean;
};

export type ProvidersQuery = {
  kind?: "Doctor" | "Nurse";
  specialty?: string;
  language?: string;
  mode?: "in-person" | "video" | "all";
  limit?: number;
  offset?: number;
};

export type ProvidersResponse = {
  providers: PublicProvider[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export function listCloudProviders(token: string, query: ProvidersQuery = {}) {
  const params = new URLSearchParams();
  if (query.kind) params.set("kind", query.kind);
  if (query.specialty?.trim()) params.set("specialty", query.specialty.trim());
  if (query.language?.trim()) params.set("language", query.language.trim());
  if (query.mode) params.set("mode", query.mode);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  const qs = params.toString();
  return cloudRequest<ProvidersResponse>(
    token,
    "/v1/providers" + (qs ? "?" + qs : ""),
  );
}

export type AvailabilityDay = {
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  label: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

export type AvailabilityResponse = {
  providerId: string;
  schedule: AvailabilityDay[];
  updatedAt: string;
};

export function getCloudAvailability(token: string, providerId?: string) {
  const qs = providerId
    ? "?providerId=" + encodeURIComponent(providerId)
    : "";
  return cloudRequest<AvailabilityResponse>(token, "/v1/availability" + qs);
}

export function saveCloudAvailability(
  token: string,
  schedule: AvailabilityDay[],
) {
  return cloudRequest<AvailabilityResponse>(token, "/v1/availability", {
    method: "POST",
    body: JSON.stringify({ schedule }),
  });
}

export const readCloud = (token: string, space = "") =>
  cloudRequest<CloudSnapshot>(
    token,
    "/v1/state" + (space ? "?space=" + encodeURIComponent(space) : ""),
  );
export const writeCloud = (
  token: string,
  space: string,
  revision: number,
  action: Action,
  operationId: string,
) =>
  cloudRequest<CloudSnapshot>(
    token,
    "/v1/actions?space=" + encodeURIComponent(space),
    { method: "POST", body: JSON.stringify({ revision, action, operationId }) },
  );

export type CloudOrganization = { id: string; name: string; code: string };
export type CloudWorkspace = {
  spaceId: string;
  name: string;
  organizationId: string;
  member: boolean;
  requestStatus: string | null;
};
export type CloudWorkspaceRequest = {
  id: string;
  spaceId: string;
  workspaceName: string;
  organizationId: string;
  status: "Pending" | "Approved" | "Rejected";
  reason: string;
  createdAt: string;
  updatedAt: string;
};
