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
