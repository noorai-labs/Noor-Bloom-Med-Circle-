export const brand = {
  name: "MedBloom",
  company: "NoorAI Labs",
  tagline: "Better care. Closer to home.",
};
export type Role = "Patient" | "Family" | "Doctor" | "Nurse" | "Admin";
export type Profile = {
  name: string;
  age: string;
  gender: string;
  contact: string;
  language: string;
  conditions: string;
  allergies: string;
  medicines: string;
  notes: string;
  consent: boolean;
};
export type Appointment = {
  id: string;
  provider: string;
  specialty: string;
  date: string;
  time: string;
  type: string;
  status: "Requested" | "Confirmed" | "Completed" | "Cancelled";
};
export type Report = {
  id: string;
  name: string;
  category: string;
  date: string;
  detail: string;
};
export type Note = {
  id: string;
  text: string;
  prescription: string;
  followUp: string;
};
export const doctors = [
  {
    id: "1",
    name: "Dr. Aisha Khan",
    specialty: "General physician",
    experience: 12,
    initials: "AK",
    color: "#E1ECE2",
    rating: "4.9",
    fee: 800,
    about:
      "Patient-centered primary care, routine checkups and long-term care coordination.",
    skills: "Primary care · Preventive health",
  },
  {
    id: "2",
    name: "Dr. Arjun Mehta",
    specialty: "Cardiologist",
    experience: 15,
    initials: "AM",
    color: "#E7E2F3",
    rating: "4.9",
    fee: 1200,
    about:
      "Heart health consultations and follow-up care in the comfort of your home.",
    skills: "Heart health · Follow-up care",
  },
  {
    id: "3",
    name: "Dr. Priya Nair",
    specialty: "Physiotherapist",
    experience: 8,
    initials: "PN",
    color: "#F4E5D7",
    rating: "4.8",
    fee: 700,
    about:
      "Personalized mobility and rehabilitation sessions for everyday independence.",
    skills: "Rehabilitation · Mobility",
  },
];
export const nurses = [
  {
    id: "n1",
    name: "Sarah Thomas",
    specialty: "Registered nurse",
    experience: 7,
    initials: "ST",
    color: "#DCECEC",
    rating: "4.9",
    fee: 600,
    about:
      "Home nursing and post-operative support with clear family care updates.",
    skills: "Wound care · Medication support",
  },
  {
    id: "n2",
    name: "Anjali Rao",
    specialty: "Care professional",
    experience: 5,
    initials: "AR",
    color: "#F2E4DD",
    rating: "4.8",
    fee: 500,
    about: "Compassionate daily assistance and elder care at home.",
    skills: "Elder care · Daily assistance",
  },
];
export type Provider = (typeof doctors)[number];
export type State = {
  profile: Profile;
  appointments: Appointment[];
  reports: Report[];
  medications: {
    id: string;
    name: string;
    dosage: string;
    time: string;
    frequency: string;
    duration: string;
    status: string;
  }[];
  notes: Note[];
  checklist: boolean[];
  visitNote: string;
  visitComplete: boolean;
  approvals: string[];
  issues: string[];
  sos: boolean;
};
export const initialState: State = {
  profile: {
    name: "Ananya Sharma",
    age: "34",
    gender: "Female",
    contact: "Rohan Sharma · Demo contact",
    language: "English",
    conditions: "Hypertension",
    allergies: "Penicillin",
    medicines: "Amlodipine",
    notes: "Prefers morning visits.",
    consent: false,
  },
  appointments: [
    {
      id: "a1",
      provider: "Dr. Aisha Khan",
      specialty: "General physician",
      date: "2026-10-12",
      time: "10:00 AM",
      type: "Home Visit",
      status: "Confirmed",
    },
  ],
  reports: [
    {
      id: "r1",
      name: "Complete blood count",
      category: "Lab report",
      date: "2026-10-08",
      detail:
        "Demonstration report only. Sample values are intentionally omitted. Review this report with your care team.",
    },
    {
      id: "r2",
      name: "Routine checkup prescription",
      category: "Prescription",
      date: "2026-10-05",
      detail:
        "Sample prescription. Continue the existing care plan as directed by the treating clinician. This is fictional demonstration content.",
    },
  ],
  medications: [
    {
      id: "m1",
      name: "Amlodipine",
      dosage: "5 mg · 1 tablet",
      time: "08:00 AM",
      frequency: "Once daily",
      duration: "As prescribed",
      status: "Pending",
    },
    {
      id: "m2",
      name: "Vitamin D3",
      dosage: "As prescribed",
      time: "01:00 PM",
      frequency: "Per care plan",
      duration: "4 weeks (demo)",
      status: "Pending",
    },
  ],
  notes: [],
  checklist: [false, false, false, false],
  visitNote: "",
  visitComplete: false,
  approvals: [],
  issues: ["Family account linking request"],
  sos: false,
};
