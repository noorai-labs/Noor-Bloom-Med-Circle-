export type CallCredentials = {
  serverUrl: string;
  token: string;
  roomId: string;
  sharedKey: string;
  endsAt: number;
  role: "Patient" | "Doctor";
  encryption: "required";
};
