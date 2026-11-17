export type VerificationKind = "Patient" | "Doctor" | "Nurse";
export const verificationDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export type VerificationStatus =
  "Submitted" | "Needs information" | "Approved" | "Rejected" | "Suspended";
export type VerificationDetails = {
  fullName: string;
  country: "India";
  authority: string;
  registrationNumber: string;
  qualification: string;
  consent: boolean;
};
export type VerificationApplication = {
  id: string;
  userId: string;
  kind: VerificationKind;
  status: VerificationStatus;
  revision: number;
  details: VerificationDetails;
  reason: string;
  validUntil: string;
  submittedAt: string;
  updatedAt: string;
  documents: { id: string; name: string; mime: string }[];
};
export type VerificationSnapshot = {
  applications: VerificationApplication[];
  reviewer: boolean;
};
export type VerificationSubmission = {
  kind: VerificationKind;
  revision: number;
  details: VerificationDetails;
  documents: string[];
};
export type VerificationDecision = {
  id: string;
  revision: number;
  status: VerificationStatus;
  reason: string;
  identityReference: string;
  registrationReference: string;
  validUntil: string;
};
