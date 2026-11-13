import type { ConfigContext, ExpoConfig } from "expo/config";
import { existsSync } from "node:fs";
import app from "./app.json";

export default ({ config }: ConfigContext): ExpoConfig => {
  // EAS file environment variable or the Firebase client configuration downloaded locally.
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (existsSync("./google-services.json")
      ? "./google-services.json"
      : undefined);
  return {
    ...config,
    ...app.expo,
    android: {
      ...app.expo.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  } as ExpoConfig;
};
