type StorageEnvironment = { FILES_PREFIX?: string };

// Prefixes are server configuration, never supplied by the client.
export function fileKey(env: StorageEnvironment, key: string): string {
  const prefix = env.FILES_PREFIX || "";
  if (prefix && !["main/", "dev/", "qa/"].includes(prefix))
    throw new Error("Invalid file storage environment.");
  return prefix + key;
}
