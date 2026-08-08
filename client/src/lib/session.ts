import {
  coerceSettings,
  describeSettings,
  settingsToolParameters,
} from "./settings";
import { VOICES, type Voice } from "./store";

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

export type SessionOptions = {
  voice: Voice;
  patienceMs: number;
  mic: boolean;
  settings: unknown;
};

export function buildSessionPayload({ voice, patienceMs, mic, settings }: SessionOptions) {
  const validVoice = VOICES.includes(voice) ? voice : "marin";
  const { values: coercedSettings } = coerceSettings(settings);

  return {
    expires_after: { anchor: "created_at", seconds: 120 },
    session: {
      type: "realtime",
      model: MODEL,
      instructions: instructions(describeSettings(coercedSettings)),
      tools: TOOLS,
      audio: {
        input: mic
          ? {
              transcription: { model: "whisper-1" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: Math.min(
                  2000,
                  Math.max(200, Number(patienceMs) || 500),
                ),
                create_response: true,
                interrupt_response: true,
              },
            }
          : { turn_detection: null },
        output: { voice: validVoice },
      },
    },
  };
}

export async function mintClientSecret(
  apiKey: string,
  options: SessionOptions,
): Promise<{ value: string; expires_at: string }> {
  const upstream = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildSessionPayload(options)),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(`Failed to mint client secret: ${detail}`);
  }

  const data = await upstream.json();
  return { value: data.value, expires_at: data.expires_at };
}
