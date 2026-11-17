import { createState, type ClinicState } from "./clinic";
export function createCloudState(): ClinicState {
  return {
    ...createState(),
    profile: {
      name: "",
      age: "",
      gender: "Prefer not to say",
      contact: "",
      language: "English",
      conditions: "",
      allergies: "",
      medicines: "",
      notes: "",
      consent: false,
      address: "",
    },
    visits: [],
    medicines: [],
    records: [],
    consultations: [],
    activities: [],
    approved: [],
    issues: [],
    sos: false,
  };
}
