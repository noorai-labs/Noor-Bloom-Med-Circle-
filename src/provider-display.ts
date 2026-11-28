import type { Visit, Provider } from "./clinic";
import type { PublicProvider } from "./cloud-api";
import {
  doctors as demoDoctors,
  nurses as demoNurses,
  providerFor as demoProviderFor,
} from "./clinic";
import { cloudMode } from "./cloud-config";

// The static catalogue is fictional. Never expose it as a real cloud directory.
// Verified cloud providers fetched from /v1/providers are cached here for profile/booking lookup.
export const doctors = cloudMode ? [] : demoDoctors;
export const nurses = cloudMode ? [] : demoNurses;
export const providers = [...doctors, ...nurses];

export type DisplayProvider = Provider & {
  kind?: "Doctor" | "Nurse";
  qualification?: string;
  registrationNumber?: string;
  authority?: string;
  languages?: string[];
  modes?: string[];
  verified?: boolean;
};

const cloudCache = new Map<string, DisplayProvider>();

function initialsFor(name: string): string {
  const parts = name
    .replace(/^Dr\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "MB";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export function toDisplayProvider(p: PublicProvider): DisplayProvider {
  const item: DisplayProvider = {
    id: p.id,
    name: p.name,
    specialty: p.specialty,
    experience: 0,
    initials: initialsFor(p.name),
    color: p.kind === "Nurse" ? "#F4E5D8" : "#D6EFE5",
    rating: "Verified",
    fee: 0,
    about: p.qualification
      ? `${p.qualification}${p.authority ? ` · Registered with ${p.authority}` : ""}`
      : "Verified healthcare professional.",
    skills: [
      p.qualification,
      p.languages.length ? `Speaks: ${p.languages.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    kind: p.kind,
    qualification: p.qualification,
    registrationNumber: p.registrationNumber,
    authority: p.authority,
    languages: p.languages,
    modes: p.modes,
    verified: p.verified,
  };
  cloudCache.set(p.id, item);
  return item;
}

export function cacheCloudProviders(list: PublicProvider[]): DisplayProvider[] {
  return list.map(toDisplayProvider);
}

export function findProvider(id?: string): DisplayProvider | undefined {
  if (!id) return undefined;
  return cloudCache.get(id) || providers.find((item) => item.id === id);
}

export function providerFor(visit: Visit): Provider {
  if (!cloudMode) return demoProviderFor(visit);
  const cached = cloudCache.get(visit.providerId);
  if (cached) return cached;
  return {
    id: visit.providerId,
    name: "Assigned care professional",
    specialty: "Your care team",
    experience: 0,
    initials: "",
    color: "#E1ECE2",
    rating: "",
    fee: 0,
    about: "",
    skills: "",
  };
}
