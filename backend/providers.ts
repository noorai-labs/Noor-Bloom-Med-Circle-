import { verificationDay } from "../src/verification-types";

export class ProviderError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type ProviderKind = "Doctor" | "Nurse";

type VerificationRow = {
  id: string;
  user_id: string;
  kind: ProviderKind;
  status: string;
  valid_until: string;
  details: string;
  updated_at: string;
};

export type PublicProvider = {
  id: string;
  name: string;
  kind: ProviderKind;
  qualification: string;
  registrationNumber: string;
  authority: string;
  specialty: string;
  languages: string[];
  modes: string[];
  verified: boolean;
};

export async function providerRoute(
  request: Request,
  env: { DB: D1Database },
  user: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/providers") {
    throw new ProviderError(404, "Endpoint not found.");
  }
  if (request.method !== "GET") {
    throw new ProviderError(405, "Method not allowed.");
  }

  const kindParam = url.searchParams.get("kind");
  if (kindParam && kindParam !== "Doctor" && kindParam !== "Nurse") {
    throw new ProviderError(
      400,
      "Choose a valid provider kind (Doctor or Nurse).",
    );
  }

  const specialtyParam = url.searchParams.get("specialty")?.trim();
  if (specialtyParam && specialtyParam.length > 100) {
    throw new ProviderError(
      400,
      "Specialty search filter must be 100 characters or fewer.",
    );
  }

  const languageParam = url.searchParams.get("language")?.trim();
  if (languageParam && languageParam.length > 50) {
    throw new ProviderError(
      400,
      "Language filter must be 50 characters or fewer.",
    );
  }

  const modeParam = url.searchParams.get("mode")?.trim();
  if (modeParam && !["in-person", "video", "all"].includes(modeParam)) {
    throw new ProviderError(
      400,
      "Choose a valid consultation mode (in-person, video, or all).",
    );
  }

  let limit = 20;
  const limitStr = url.searchParams.get("limit");
  if (limitStr !== null) {
    const parsed = Number(limitStr);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      throw new ProviderError(
        400,
        "Limit must be an integer between 1 and 50.",
      );
    }
    limit = parsed;
  }

  let offset = 0;
  const offsetStr = url.searchParams.get("offset");
  if (offsetStr !== null) {
    const parsed = Number(offsetStr);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new ProviderError(
        400,
        "Offset must be a non-negative integer.",
      );
    }
    offset = parsed;
  }

  const today = verificationDay();
  let query =
    "SELECT id, user_id, kind, status, valid_until, details, updated_at FROM verification_applications WHERE status = 'Approved' AND valid_until > ? AND kind IN ('Doctor', 'Nurse')";
  const bindings: unknown[] = [today];

  if (kindParam) {
    query += " AND kind = ?";
    bindings.push(kindParam);
  }

  query += " ORDER BY updated_at DESC, id ASC";

  const rows = await env.DB.prepare(query)
    .bind(...bindings)
    .all<VerificationRow>();

  const allProviders: PublicProvider[] = [];

  for (const row of rows.results) {
    let details: Record<string, unknown> = {};
    try {
      details = JSON.parse(row.details || "{}");
    } catch {
      details = {};
    }

    const qualification =
      typeof details.qualification === "string"
        ? details.qualification.trim()
        : "";
    const specialty =
      typeof details.specialty === "string" && details.specialty.trim()
        ? details.specialty.trim()
        : qualification ||
          (row.kind === "Doctor" ? "General Medicine" : "Nursing Care");

    const languages =
      Array.isArray(details.languages) &&
      details.languages.every((l) => typeof l === "string") &&
      details.languages.length
        ? (details.languages as string[]).map((l) => l.trim()).filter(Boolean)
        : ["English"];

    const modes =
      Array.isArray(details.modes) &&
      details.modes.every((m) => typeof m === "string") &&
      details.modes.length
        ? (details.modes as string[]).map((m) => m.trim()).filter(Boolean)
        : ["in-person", "video"];

    const provider: PublicProvider = {
      id: row.user_id,
      name:
        typeof details.fullName === "string" && details.fullName.trim()
          ? details.fullName.trim()
          : row.kind === "Doctor"
            ? "Dr. Provider"
            : "Nurse Provider",
      kind: row.kind,
      qualification,
      registrationNumber:
        typeof details.registrationNumber === "string"
          ? details.registrationNumber.trim()
          : "",
      authority:
        typeof details.authority === "string" ? details.authority.trim() : "",
      specialty,
      languages,
      modes,
      verified: true,
    };

    // Specialty filter (case-insensitive substring match on specialty or qualification)
    if (specialtyParam) {
      const q = specialtyParam.toLowerCase();
      const match =
        provider.specialty.toLowerCase().includes(q) ||
        provider.qualification.toLowerCase().includes(q);
      if (!match) continue;
    }

    // Language filter (case-insensitive exact match in languages array)
    if (languageParam) {
      const q = languageParam.toLowerCase();
      const match = provider.languages.some((l) => l.toLowerCase() === q);
      if (!match) continue;
    }

    // Mode filter
    if (modeParam && modeParam !== "all") {
      if (!provider.modes.includes(modeParam)) continue;
    }

    allProviders.push(provider);
  }

  const total = allProviders.length;
  const providers = allProviders.slice(offset, offset + limit);
  const hasMore = offset + providers.length < total;

  return Response.json({
    providers,
    pagination: {
      total,
      limit,
      offset,
      hasMore,
    },
  });
}
