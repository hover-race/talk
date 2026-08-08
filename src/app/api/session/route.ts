import { buildSessionPayload, mintClientSecret } from "@/lib/session";
import { type Voice } from "@/lib/store";

export const runtime = "edge";

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
  const voice: Voice = body.voice ?? "marin";
  const patienceMs = Math.min(2000, Math.max(200, Number(body.patienceMs) || 500));
  const mic = body.mic !== false;

  try {
    const { value, expires_at } = await mintClientSecret(apiKey, {
      voice,
      patienceMs,
      mic,
      settings: body.settings,
    });
    return Response.json({ value, expires_at });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Failed to mint client secret: ${detail}` },
      { status: 500 },
    );
  }
}
