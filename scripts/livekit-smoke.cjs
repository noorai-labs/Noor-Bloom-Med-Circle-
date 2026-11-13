// Tests operator-owned infrastructure without writing or displaying service credentials.
const { execFileSync } = require("node:child_process");
const { randomUUID, randomBytes } = require("node:crypto");
const tls = require("node:tls");
const dgram = require("node:dgram");
const { RoomServiceClient } = require("livekit-server-sdk");
async function tlsCheck(host) {
  await new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: true },
      () => {
        socket.end();
        resolve();
      },
    );
    socket.setTimeout(8000, () => socket.destroy(new Error("TLS timeout")));
    socket.once("error", reject);
  });
  console.log("Trusted TLS verified:", host);
}
async function turnCheck(host) {
  await new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4"),
      packet = Buffer.alloc(20);
    packet.writeUInt16BE(1, 0);
    packet.writeUInt32BE(0x2112a442, 4);
    randomBytes(12).copy(packet, 8);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("TURN UDP did not respond"));
    }, 8000);
    socket.once("message", (message) => {
      clearTimeout(timer);
      socket.close();
      if (
        message.length >= 20 &&
        message.readUInt32BE(4) === 0x2112a442 &&
        message.subarray(8, 20).equals(packet.subarray(8, 20))
      )
        resolve();
      else reject(new Error("Unexpected TURN response"));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
    socket.send(packet, 3478, host);
  });
  console.log("TURN UDP reachable");
}
(async () => {
  const secrets = JSON.parse(
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
  const host = new URL(secrets.LIVEKIT_URL).hostname;
  await tlsCheck(host);
  await tlsCheck(host.replace("bloom-calls.", "bloom-turn."));
  const client = new RoomServiceClient(
    "https://" + host,
    secrets.LIVEKIT_API_KEY,
    secrets.LIVEKIT_API_SECRET,
    { requestTimeout: 8 },
  );
  const name = "bloom-smoke-" + randomUUID();
  try {
    const room = await client.createRoom({
      name,
      maxParticipants: 2,
      emptyTimeout: 30,
    });
    if (room.maxParticipants !== 2)
      throw new Error("Room participant cap is incorrect");
    const rooms = await client.listRooms([name]);
    if (!rooms.some((r) => r.name === name))
      throw new Error("Created room not returned");
    console.log(
      "Authenticated room create/list verified; cap is two participants",
    );
  } finally {
    await client.deleteRoom(name);
  }
  const unauthorized = await fetch(
    "https://" + host + "/twirp/livekit.RoomService/ListRooms",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  if (![401, 403].includes(unauthorized.status))
    throw new Error("Unauthenticated room administration was not blocked");
  console.log("Unauthenticated administration blocked");
  await turnCheck(host);
  console.log(
    "Self-hosted LiveKit infrastructure smoke checks passed. Two-device media/E2EE testing is still required.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
