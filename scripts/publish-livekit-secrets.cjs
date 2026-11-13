// Keep secrets in process memory and authenticated stdin; never print or write them locally.
const { execFileSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const wrangler = "node_modules/wrangler/bin/wrangler.js";
const configured = JSON.parse(
  execFileSync(
    process.execPath,
    [wrangler, "secret", "list", "--config", "backend/wrangler.jsonc"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  ),
);
const values = JSON.parse(
  execFileSync(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "Neon-VC",
      "sudo -n cat /opt/bloom-livekit/worker-secrets.json",
    ],
    { encoding: "utf8" },
  ),
);
delete values.LIVEKIT_E2EE_SECRET;
if (!configured.some((item) => item.name === "LIVEKIT_E2EE_SECRET"))
  values.LIVEKIT_E2EE_SECRET = randomBytes(32).toString("base64url");
execFileSync(
  process.execPath,
  [wrangler, "secret", "bulk", "--config", "backend/wrangler.jsonc"],
  { input: JSON.stringify(values), stdio: ["pipe", "inherit", "inherit"] },
);
// The SFU host does not need the media-encryption master secret. Leave only service credentials there.
execFileSync(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    "Neon-VC",
    'sudo -n python3 -c \'import json; from pathlib import Path; p=Path("/opt/bloom-livekit/worker-secrets.json"); v=json.loads(p.read_text()); v.pop("LIVEKIT_E2EE_SECRET",None); p.write_text(json.dumps(v)); p.chmod(0o600)\'',
  ],
  { stdio: ["ignore", "inherit", "inherit"] },
);
console.log(
  "LiveKit backend configuration published. Media-encryption master secret is held only by the Worker.",
);
