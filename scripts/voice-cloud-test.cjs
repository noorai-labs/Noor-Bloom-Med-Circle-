const assert = require("node:assert/strict");
const path = require("node:path");
const { generateKeyPairSync, sign } = require("node:crypto");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");

async function runUnconfiguredVoiceChecks({ request, mf }) {
  // 1. Unauthenticated access must be rejected with 401
  const unauthStatus = await mf.dispatchFetch("http://test/v1/voice/status");
  assert.equal(unauthStatus.status, 401);

  const unauthToken = await mf.dispatchFetch("http://test/v1/voice/stt-token", {
    method: "POST",
    body: "{}",
  });
  assert.equal(unauthToken.status, 401);

  const unauthTts = await mf.dispatchFetch("http://test/v1/voice/tts", {
    method: "POST",
    body: JSON.stringify({ transcript: "Hello", language: "en-IN" }),
  });
  assert.equal(unauthTts.status, 401);

  // 2. Missing server credentials must report explicit unavailable state (never fake live success)
  const statusRes = await request("user_patient", "/v1/voice/status");
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.data.sttAvailable, false);
  assert.equal(statusRes.data.ttsAvailable, false);

  const sttUnavailable = await request(
    "user_patient",
    "/v1/voice/stt-token",
    "POST",
    {},
  );
  assert.equal(sttUnavailable.status, 503);

  const ttsUnavailable = await request(
    "user_patient",
    "/v1/voice/tts",
    "POST",
    { transcript: "Show my medicines", language: "en-IN" },
  );
  assert.equal(ttsUnavailable.status, 503);
}

async function runStandalone() {
  const root = path.resolve(__dirname, "..");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const issuer = "https://voice-test.clerk.accounts.dev";
  const secretDeepgram = "dg_server_only_secret_999";
  const secretCartesia = "car_server_only_secret_888";

  function jwt(user) {
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body =
      encode({ alg: "RS256", typ: "JWT", kid: "test-key" }) +
      "." +
      encode({
        sub: user,
        sid: "sess_voice",
        iss: issuer,
        iat: now,
        nbf: now - 5,
        exp: now + 300,
      });
    return (
      body +
      "." +
      sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")
    );
  }

  let deepgramGrantCalls = 0;
  let cartesiaCalls = 0;

  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "bloom-voice-test",
          modules: true,
          scriptPath: path.join(root, "backend/backend-build/worker.js"),
          compatibilityDate: "2026-10-11",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: { DB: "bloom-voice-test" },
          durableObjects: {
            REMINDERS: {
              className: "MedicineReminderScheduler",
              useSQLite: true,
            },
          },
          r2Buckets: ["FILES"],
          outboundService: async (req) => {
            const url = new URL(req.url);
            if (
              url.hostname === "api.deepgram.com" &&
              url.pathname === "/v1/auth/grant"
            ) {
              deepgramGrantCalls++;
              assert.equal(
                req.headers.get("Authorization"),
                `Token ${secretDeepgram}`,
              );
              return Response.json({
                access_token: "dg_ephemeral_jwt_token_abc",
                expires_in: 60,
              });
            }
            if (
              url.hostname === "api.cartesia.ai" &&
              url.pathname === "/tts/bytes"
            ) {
              cartesiaCalls++;
              assert.equal(req.headers.get("X-API-Key"), secretCartesia);
              assert.equal(req.headers.get("Cartesia-Version"), "2024-06-10");
              const payload = await req.json();
              assert.equal(payload.model_id, "sonic-3");
              assert.equal(payload.language, "hi");
              return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x03]), {
                status: 200,
                headers: { "Content-Type": "audio/mpeg" },
              });
            }
            assert.fail(`Unexpected outbound request: ${req.url}`);
          },
          bindings: {
            CLERK_JWT_KEY: publicKey.export({ type: "spki", format: "pem" }),
            CLERK_ISSUER: issuer,
            ALLOWED_ORIGINS: "",
            AUTHORIZED_PARTIES: "",
            DEEPGRAM_API_KEY: secretDeepgram,
            CARTESIA_API_KEY: secretCartesia,
          },
        },
      ],
    }),
  );

  try {
    const authHeaders = (user) => ({
      Authorization: `Bearer ${jwt(user)}`,
      "Content-Type": "application/json",
    });

    // Unauth rejected
    const unauth = await mf.dispatchFetch("http://test/v1/voice/stt-token", {
      method: "POST",
    });
    assert.equal(unauth.status, 401);

    // Status reports available
    const statusRes = await mf.dispatchFetch("http://test/v1/voice/status", {
      headers: authHeaders("patient_1"),
    });
    assert.equal(statusRes.status, 200);
    assert.deepEqual(await statusRes.json(), {
      sttAvailable: true,
      ttsAvailable: true,
    });

    // STT token issues short-lived credential and never leaks server secret
    const tokenRes = await mf.dispatchFetch("http://test/v1/voice/stt-token", {
      method: "POST",
      headers: authHeaders("patient_1"),
      body: "{}",
    });
    assert.equal(tokenRes.status, 200);
    const tokenText = await tokenRes.text();
    assert.equal(tokenText.includes(secretDeepgram), false);
    const tokenJson = JSON.parse(tokenText);
    assert.equal(tokenJson.accessToken, "dg_ephemeral_jwt_token_abc");
    assert.equal(tokenJson.expiresIn, 60);
    assert.equal(deepgramGrantCalls, 1);

    // Validation rejects empty and overlong transcripts
    const emptyTts = await mf.dispatchFetch("http://test/v1/voice/tts", {
      method: "POST",
      headers: authHeaders("patient_1"),
      body: JSON.stringify({ transcript: "   ", language: "hi-IN" }),
    });
    assert.equal(emptyTts.status, 400);

    const longTts = await mf.dispatchFetch("http://test/v1/voice/tts", {
      method: "POST",
      headers: authHeaders("patient_1"),
      body: JSON.stringify({ transcript: "a".repeat(1001), language: "hi-IN" }),
    });
    assert.equal(longTts.status, 400);

    // Valid TTS proxies MP3 audio bytes with correct model/version
    const ttsRes = await mf.dispatchFetch("http://test/v1/voice/tts", {
      method: "POST",
      headers: authHeaders("patient_1"),
      body: JSON.stringify({
        transcript: "यह आपकी दवाइयों का शेड्यूल है",
        language: "hi-IN",
      }),
    });
    assert.equal(ttsRes.status, 200);
    assert.equal(ttsRes.headers.get("Content-Type"), "audio/mpeg");
    const audioBuf = new Uint8Array(await ttsRes.arrayBuffer());
    assert.equal(audioBuf.length, 4);
    assert.equal(cartesiaCalls, 1);

    console.log(
      "Voice cloud backend tests passed: auth gate (401), short-lived Deepgram grant, Cartesia sonic-3/2024-06-10 proxy, input validation, and secret isolation.",
    );
  } finally {
    await mf.dispose();
  }
}

module.exports = { runUnconfiguredVoiceChecks };

if (require.main === module) {
  runStandalone().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
