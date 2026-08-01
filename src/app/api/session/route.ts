import {
  coerceSettings,
  describeSettings,
  settingsToolParameters,
} from "@/lib/settings";
import { VOICES, type Voice } from "@/lib/store";

export const runtime = "edge";

const MODEL = "gpt-realtime-2.1";
const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

const instructions = (settings: string) => `You are a talking head: a face on a screen having a real conversation.

Speak the way people actually speak out loud. Short sentences. Contractions. No
bulleted lists, no markdown, no headings, no emoji — none of it survives being
spoken. If something genuinely needs several parts, say them as sentences.

Keep turns short, usually one to three sentences. You are in a conversation, not
delivering a lecture, and the person can always ask you to go deeper. Ask a
follow-up question when it would actually help rather than as a verbal tic.

If you are interrupted, stop and listen. Do not restate what you were saying.

You have a face, and it is visible. Call set_expression when your emotional tone
genuinely shifts — delight at a good idea, concern at bad news, thinking when a
question needs real work. Do not call it every turn; a face that changes on a
schedule reads as broken, not expressive.

How you look is yours to change with update_settings. Pass only the settings you
want to change; the rest stay as they are. Do it when the person asks, or when
you have a reason to; then say what you changed rather than narrating the call.

${settings}`;

const TOOLS = [
  {
    type: "function",
    name: "set_expression",
    description:
      "Set the facial expression of your visible avatar. Call this only when your emotional tone genuinely changes.",
    parameters: {
      type: "object",
      properties: {
        emotion: {
          type: "string",
          enum: ["neutral", "happy", "thinking", "curious", "concerned", "excited"],
          description: "The emotion to display.",
        },
        intensity: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "How strongly to show it. 0.3 is subtle, 0.9 is unmistakable.",
        },
      },
      required: ["emotion", "intensity"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_settings",
    description:
      "Change how you look. Pass only the settings you want to change. Returns the full settings after the change.",
    parameters: settingsToolParameters(),
  },
];

/**
 * Per-isolate token bucket. A serverless deployment runs many isolates, so this
 * throttles a runaway client but is not a substitute for a shared rate limiter
 * before this endpoint is exposed publicly.
 */
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not set. Copy .env.example to .env.local and add your key." },
      { status: 500 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (rateLimited(ip)) {
    return Response.json({ error: "Too many sessions. Slow down." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const voice: Voice = VOICES.includes(body.voice) ? body.voice : "marin";
  const patienceMs = Math.min(2000, Math.max(200, Number(body.patienceMs) || 500));
  const mic = body.mic !== false;
  const { values: settings } = coerceSettings(body.settings);

  const upstream = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 120 },
      session: {
        type: "realtime",
        model: MODEL,
        instructions: instructions(describeSettings(settings)),
        tools: TOOLS,
        audio: {
          input: mic
            ? {
                transcription: { model: "whisper-1" },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: patienceMs,
                  create_response: true,
                  interrupt_response: true,
                },
              }
            : { turn_detection: null },
          output: { voice },
        },
      },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return Response.json(
      { error: `Failed to mint client secret: ${detail}` },
      { status: upstream.status },
    );
  }

  const data = await upstream.json();
  return Response.json({ value: data.value, expires_at: data.expires_at });
}
