import AsyncStorage from "@react-native-async-storage/async-storage";

export type Organization = {
  id: string;
  name: string;
  city: string;
  state: string;
  type: "Hospital Network" | "Clinic System" | "Medical Center" | "Community Health";
  licenseNumber: string;
  verified: boolean;
  departments: string[];
  description: string;
  badge: string;
};

export type OrganizationWorkspace = {
  id: string;
  organizationId: string;
  name: string;
  specialty: string;
  department: string;
  activePatients: number;
  openCases: number;
  adminName: string;
  description: string;
};

export type WorkspaceJoinRequest = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
  doctorUserId: string;
  doctorName: string;
  status: "Pending" | "Approved" | "Declined";
  reason?: string;
  requestedAt: string;
  updatedAt: string;
};

export const ORGANIZATIONS: Organization[] = [
  {
    id: "org-medbloom-central",
    name: "MedBloom Clinic Network",
    city: "Bengaluru",
    state: "Karnataka",
    type: "Clinic System",
    licenseNumber: "KA-MED-2024-0881",
    verified: true,
    departments: ["General Medicine", "Cardiology", "Home Nursing", "Pediatrics", "Diabetology"],
    description: "Integrated primary, home care, and digital consultation network across Bengaluru.",
    badge: "MB",
  },
  {
    id: "org-apollo-bengaluru",
    name: "Apollo Hospitals Bengaluru",
    city: "Bengaluru",
    state: "Karnataka",
    type: "Hospital Network",
    licenseNumber: "KA-HOSP-2019-0142",
    verified: true,
    departments: ["Cardiology", "Neurology", "Orthopedics", "Emergency Care", "Oncology"],
    description: "Multispeciality quaternary healthcare center accredited by JCI and NABH.",
    badge: "AH",
  },
  {
    id: "org-manipal-health",
    name: "Manipal Hospital Network",
    city: "Bengaluru",
    state: "Karnataka",
    type: "Hospital Network",
    licenseNumber: "KA-HOSP-2018-0315",
    verified: true,
    departments: ["General Medicine", "Pulmonology", "Gastroenterology", "Nephrology"],
    description: "Comprehensive medical and surgical center with regional home care wards.",
    badge: "MH",
  },
  {
    id: "org-fortis-healthcare",
    name: "Fortis Healthcare",
    city: "Bengaluru",
    state: "Karnataka",
    type: "Hospital Network",
    licenseNumber: "KA-HOSP-2021-0499",
    verified: true,
    departments: ["Internal Medicine", "Cardiology", "Critical Care", "Pediatrics"],
    description: "Specialized tertiary care hospital with active telemedicine and care spaces.",
    badge: "FH",
  },
  {
    id: "org-narayana-health",
    name: "Narayana Health City",
    city: "Bengaluru",
    state: "Karnataka",
    type: "Hospital Network",
    licenseNumber: "KA-HOSP-2017-0092",
    verified: true,
    departments: ["Cardiac Sciences", "General Medicine", "Vascular Surgery", "Oncology"],
    description: "Advanced cardiac and multispeciality care hub with digital workspace coordination.",
    badge: "NH",
  },
  {
    id: "org-max-healthcare",
    name: "Max Healthcare Institute",
    city: "New Delhi",
    state: "Delhi NCR",
    type: "Medical Center",
    licenseNumber: "DL-HOSP-2020-0721",
    verified: true,
    departments: ["Internal Medicine", "Endocrinology", "Rheumatology", "Geriatrics"],
    description: "Leading healthcare provider known for integrated patient care spaces.",
    badge: "MX",
  },
];

export const WORKSPACES: OrganizationWorkspace[] = [
  {
    id: "ws-mb-gen-opd",
    organizationId: "org-medbloom-central",
    name: "General Medicine OPD Care Space",
    specialty: "General Medicine",
    department: "Outpatient Services",
    activePatients: 14,
    openCases: 3,
    adminName: "Dr. K. S. Rao",
    description: "Day-to-day outpatient consultations, wellness checks, and follow-ups.",
  },
  {
    id: "ws-mb-cardio",
    organizationId: "org-medbloom-central",
    name: "Cardiology & Chronic Care Space",
    specialty: "Cardiology",
    department: "Cardiovascular Care",
    activePatients: 9,
    openCases: 2,
    adminName: "Dr. Arvind Patel",
    description: "Hypertension management, ECG reviews, and cardiac rehabilitation.",
  },
  {
    id: "ws-mb-home-nursing",
    organizationId: "org-medbloom-central",
    name: "Home Nursing & Palliative Space",
    specialty: "Nursing Care",
    department: "Home Health",
    activePatients: 21,
    openCases: 6,
    adminName: "Sister Mary V.",
    description: "Home health visits, post-operative nursing, and elder care tracking.",
  },
  {
    id: "ws-mb-telehealth",
    organizationId: "org-medbloom-central",
    name: "Telehealth & Urgent Consultation Hub",
    specialty: "Family Medicine",
    department: "Digital Care",
    activePatients: 18,
    openCases: 4,
    adminName: "Dr. Priya Nair",
    description: "Real-time video consults and urgent triage for connected family members.",
  },
  {
    id: "ws-apollo-internal",
    organizationId: "org-apollo-bengaluru",
    name: "Internal Medicine Clinical Ward",
    specialty: "General Medicine",
    department: "Internal Medicine",
    activePatients: 12,
    openCases: 5,
    adminName: "Dr. R. Venkat",
    description: "Inpatient and outpatient continuous care tracking with family access.",
  },
  {
    id: "ws-apollo-cardio",
    organizationId: "org-apollo-bengaluru",
    name: "Apollo Heart Care Space",
    specialty: "Cardiology",
    department: "Heart Center",
    activePatients: 16,
    openCases: 4,
    adminName: "Dr. S. Mukherjee",
    description: "Pre-procedure and post-procedure cardiology patient care circle.",
  },
  {
    id: "ws-manipal-care",
    organizationId: "org-manipal-health",
    name: "Manipal Multispeciality Practice",
    specialty: "General Medicine",
    department: "Clinical Services",
    activePatients: 15,
    openCases: 3,
    adminName: "Dr. Anand Joshi",
    description: "Collaborative care teams for acute illnesses and long-term care plans.",
  },
  {
    id: "ws-fortis-consult",
    organizationId: "org-fortis-healthcare",
    name: "Fortis Consultation & Triage Workspace",
    specialty: "Critical Care",
    department: "Ambulatory Services",
    activePatients: 8,
    openCases: 1,
    adminName: "Dr. Shalini Roy",
    description: "Specialist consultation workspace for referred and admitted patients.",
  },
];

const SELECTED_ORG_KEY = "bloom_doctor_selected_org_v1";
const WORKSPACE_REQUESTS_KEY = "bloom_doctor_workspace_requests_v1";

export function searchOrganizations(
  query: string,
  type = "All",
  city = "All",
): Organization[] {
  const clean = query.trim().toLowerCase();
  return ORGANIZATIONS.filter((org) => {
    const matchesType = type === "All" || org.type === type;
    const matchesCity = city === "All" || org.city === city;
    const matchesQuery =
      !clean ||
      org.name.toLowerCase().includes(clean) ||
      org.city.toLowerCase().includes(clean) ||
      org.type.toLowerCase().includes(clean) ||
      org.departments.some((d) => d.toLowerCase().includes(clean));
    return matchesType && matchesCity && matchesQuery;
  });
}

export async function fetchOrganizations(
  query: string,
  type = "All",
  city = "All",
): Promise<Organization[]> {
  return searchOrganizations(query, type, city);
}

export function getOrganization(id: string): Organization | undefined {
  return ORGANIZATIONS.find((org) => org.id === id);
}

export function searchWorkspaces(
  orgId?: string,
  query = "",
): OrganizationWorkspace[] {
  let list = WORKSPACES;
  if (orgId) {
    const matched = list.filter((w) => w.organizationId === orgId);
    if (matched.length > 0) list = matched;
  }
  const clean = query.trim().toLowerCase();
  if (!clean) return list;
  return list.filter(
    (w) =>
      w.name.toLowerCase().includes(clean) ||
      w.specialty.toLowerCase().includes(clean) ||
      w.department.toLowerCase().includes(clean) ||
      w.adminName.toLowerCase().includes(clean),
  );
}

export async function saveSelectedOrganization(org: Organization): Promise<void> {
  await AsyncStorage.setItem(SELECTED_ORG_KEY, JSON.stringify(org));
}

export async function getSelectedOrganization(): Promise<Organization | null> {
  try {
    const raw = await AsyncStorage.getItem(SELECTED_ORG_KEY);
    return raw ? (JSON.parse(raw) as Organization) : null;
  } catch {
    return null;
  }
}

export async function clearSelectedOrganization(): Promise<void> {
  await AsyncStorage.removeItem(SELECTED_ORG_KEY);
}

export const isDevMockAllowed =
  typeof __DEV__ !== "undefined"
    ? __DEV__
    : process.env.NODE_ENV !== "production";

// TODO(API): Replace local catalog with GET /v1/workspaces?orgId=&q= once Darshan deploys it.
export async function fetchWorkspaces(
  orgId?: string,
  query = "",
): Promise<OrganizationWorkspace[]> {
  if (!isDevMockAllowed) {
    throw new Error(
      "Organization workspace search is not available yet. Please check back soon.",
    );
  }
  return searchWorkspaces(orgId, query);
}

// TODO(API): Replace AsyncStorage request list with GET /v1/workspace-requests once backend exists.
export async function getWorkspaceJoinRequests(
  doctorUserId: string,
): Promise<WorkspaceJoinRequest[]> {
  if (!isDevMockAllowed) return [];
  try {
    const raw = await AsyncStorage.getItem(
      `${WORKSPACE_REQUESTS_KEY}:${doctorUserId}`,
    );
    return raw ? (JSON.parse(raw) as WorkspaceJoinRequest[]) : [];
  } catch {
    return [];
  }
}

// TODO(API): Replace with POST /v1/workspace-requests once backend exists.
export async function submitWorkspaceJoinRequest(
  doctorUserId: string,
  doctorName: string,
  workspace: OrganizationWorkspace,
  organizationName: string,
): Promise<WorkspaceJoinRequest> {
  if (!isDevMockAllowed) {
    throw new Error("Workspace request service is unavailable.");
  }
  const existing = await getWorkspaceJoinRequests(doctorUserId);
  const now = new Date().toISOString();

  const found = existing.find(
    (req) => req.workspaceId === workspace.id && req.status !== "Declined",
  );
  if (found) {
    return found;
  }

  const newRequest: WorkspaceJoinRequest = {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    organizationId: workspace.organizationId,
    organizationName,
    doctorUserId,
    doctorName,
    status: "Pending",
    requestedAt: now,
    updatedAt: now,
  };

  const updated = [
    newRequest,
    ...existing.filter((req) => req.workspaceId !== workspace.id),
  ];
  await AsyncStorage.setItem(
    `${WORKSPACE_REQUESTS_KEY}:${doctorUserId}`,
    JSON.stringify(updated),
  );
  return newRequest;
}

// TODO(API): Replace with DELETE /v1/workspace-requests/:id once backend supports withdraw.
export async function withdrawWorkspaceJoinRequest(
  doctorUserId: string,
  requestId: string,
): Promise<WorkspaceJoinRequest[]> {
  const existing = await getWorkspaceJoinRequests(doctorUserId);
  const updated = existing.filter((req) => req.id !== requestId);
  await AsyncStorage.setItem(
    `${WORKSPACE_REQUESTS_KEY}:${doctorUserId}`,
    JSON.stringify(updated),
  );
  return updated;
}

export async function clearWorkspaceRequests(
  doctorUserId?: string,
): Promise<void> {
  try {
    if (doctorUserId) {
      await AsyncStorage.removeItem(`${WORKSPACE_REQUESTS_KEY}:${doctorUserId}`);
      return;
    }
    const keys = await AsyncStorage.getAllKeys();
    const targets = keys.filter((k) => k.startsWith(WORKSPACE_REQUESTS_KEY));
    if (targets.length) await AsyncStorage.multiRemove(targets);
  } catch {
    /* ignore cleanup errors */
  }
}
