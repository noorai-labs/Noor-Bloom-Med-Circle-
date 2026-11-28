/**
 * Authenticated Backend Speech Provider Adapter for BLOOM MED
 * Keeps Deepgram & Cartesia API keys strictly on the Cloudflare Worker server.
 * - POST /v1/voice/stt-token : Mints short-lived (60s) Deepgram WebSocket access token
 * - POST /v1/voice/tts       : Proxies Cartesia Sonic TTS and streams audio/mpeg bytes
 * - GET  /v1/voice/status    : Reports whether server speech providers are configured
 */

import { type VoiceLanguage } from "../src/voice-types";

export type VoiceEnv = {
  DEEPGRAM_API_KEY?: string;
  CARTESIA_API_KEY?: string;
};

export class VoiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const CARTESIA_VOICE_ID = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";
const CARTESIA_VERSION = "2024-06-10";
const CARTESIA_MODEL_ID = "sonic-3";
const SCREEN_PROMPT: Record<VoiceLanguage, string> = {
  "en-IN": "Please follow the instructions on screen.",
  "hi-IN": "कृपया स्क्रीन पर दिए गए निर्देशों का पालन करें।",
  "kn-IN": "ದಯವಿಟ್ಟು ಪರದೆಯ ಮೇಲಿನ ಸೂಚನೆಗಳನ್ನು ಅನುಸರಿಸಿ.",
  "ta-IN": "திரையில் உள்ள வழிமுறைகளைப் பின்பற்றவும்.",
  "te-IN": "దయచేసి తెరపై ఉన్న సూచనలను అనుసరించండి.",
};

const CARTESIA_LANG_MAP: Record<VoiceLanguage, string> = {
  "en-IN": "en",
  "hi-IN": "hi",
  "kn-IN": "kn",
  "ta-IN": "ta",
  "te-IN": "te",
};

function isSupportedLanguage(value: unknown): value is VoiceLanguage {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(CARTESIA_LANG_MAP, value)
  );
}

export async function voiceRoute(
  request: Request,
  env: VoiceEnv,
  user: string,
): Promise<Response> {
  if (!user) {
    throw new VoiceError(401, "Sign in to use the cloud voice assistant.");
  }

  const url = new URL(request.url);

  if (url.pathname === "/v1/voice/status") {
    if (request.method !== "GET") {
      throw new VoiceError(405, "Method not allowed.");
    }
    return Response.json({
      sttAvailable: Boolean(env.DEEPGRAM_API_KEY),
      ttsAvailable: Boolean(env.CARTESIA_API_KEY),
    });
  }

  if (url.pathname === "/v1/voice/stt-token") {
    if (request.method !== "POST") {
      throw new VoiceError(405, "Method not allowed.");
    }
    if (!env.DEEPGRAM_API_KEY) {
      throw new VoiceError(
        503,
        "Speech recognition is not configured on the server yet.",
      );
    }

    const upstream = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });

    if (!upstream.ok) {
      throw new VoiceError(
        502,
        "Unable to issue a temporary speech session token.",
      );
    }

    const payload = (await upstream.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) {
      throw new VoiceError(
        502,
        "Speech provider returned an incomplete session token.",
      );
    }

    return Response.json(
      {
        accessToken: payload.access_token,
        expiresIn: payload.expires_in ?? 60,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (url.pathname === "/v1/voice/tts") {
    if (request.method !== "POST") {
      throw new VoiceError(405, "Method not allowed.");
    }
    if (!env.CARTESIA_API_KEY) {
      throw new VoiceError(
        503,
        "Voice playback is not configured on the server yet.",
      );
    }

    let body: { language?: unknown };
    try {
      body = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).some((key) => key !== "language")) {
        throw new Error("Unsupported speech synthesis input");
      }
    } catch {
      throw new VoiceError(400, "Speech synthesis accepts only a language.");
    }

    const language: VoiceLanguage = isSupportedLanguage(body.language)
      ? body.language
      : "en-IN";
    const cartesiaLang = CARTESIA_LANG_MAP[language];

    const upstream = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": env.CARTESIA_API_KEY,
        "Cartesia-Version": CARTESIA_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL_ID,
        transcript: SCREEN_PROMPT[language],
        voice: {
          mode: "id",
          id: CARTESIA_VOICE_ID,
        },
        output_format: {
          container: "mp3",
          sample_rate: 44100,
          encoding: "mp3",
        },
        language: cartesiaLang,
      }),
    });

    if (!upstream.ok) {
      throw new VoiceError(
        502,
        `Speech synthesis provider failed (${upstream.status}).`,
      );
    }

    const audioBytes = await upstream.arrayBuffer();
    return new Response(audioBytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  throw new VoiceError(404, "Voice endpoint not found.");
}
