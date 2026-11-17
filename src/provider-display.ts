import type { Visit, Provider } from "./clinic";
import {
  doctors as demoDoctors,
  nurses as demoNurses,
  providerFor as demoProviderFor,
} from "./clinic";
import { cloudMode } from "./cloud-config";
// The static catalogue is fictional. Never expose it as a real cloud directory.
// Replace this empty list with a verified server catalogue when one is available.
export const doctors = cloudMode ? [] : demoDoctors;
export const nurses = cloudMode ? [] : demoNurses;
export const providers = [...doctors, ...nurses];
export function providerFor(visit: Visit): Provider {
  if (!cloudMode) return demoProviderFor(visit);
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
