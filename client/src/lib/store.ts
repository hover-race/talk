import { reactive } from "vue";
import type { HeadId } from "./heads";

export type Status =
  | "offline"
  | "connecting"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking";

export const EXPRESSIONS = [
  "neutral",
  "happy",
  "thinking",
  "curious",
  "concerned",
  "excited",
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  done: boolean;
};

export const VOICES = [
  "marin",
  "cedar",
  "alloy",
  "echo",
  "shimmer",
  "verse",
] as const;
export type Voice = (typeof VOICES)[number];

type Persisted = {
  voice: Voice;
  head: HeadId;
  hairColor: string | null;
  hairLength: number;
};

const PREF_KEY = "talk-prefs";
const VIEW_KEY = "talk-view";
const API_KEY = "talk-api-key";

function loadPrefs(): Partial<Persisted> {
  const raw = localStorage.getItem(PREF_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<Persisted>;
  } catch {
    return {};
  }
}

export function savePrefs() {
  const { voice, head, hairColor, hairLength } = store;
  localStorage.setItem(
    PREF_KEY,
    JSON.stringify({ voice, head, hairColor, hairLength }),
  );
}

export type View = { azimuth: number; polar: number };

export const DEFAULT_VIEW: View = { azimuth: 0, polar: Math.PI / 2 };

export function loadView(): View {
  const raw = localStorage.getItem(VIEW_KEY);
  if (!raw) return DEFAULT_VIEW;
  try {
    const { azimuth, polar } = JSON.parse(raw) as View;
    return { azimuth, polar };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view: View) {
  localStorage.setItem(VIEW_KEY, JSON.stringify(view));
}

export type TalkState = {
  status: Status;
  expression: Expression;
  expressionIntensity: number;
  messages: Message[];
  muted: boolean;
  micEnabled: boolean;
  voice: Voice;
  head: HeadId;
  hairColor: string | null;
  hairLength: number;
  patienceMs: number;
  error: string | null;
  apiKey: string | null;

  setStatus: (status: Status) => void;
  setExpression: (expression: Expression, intensity: number) => void;
  setMuted: (muted: boolean) => void;
  setMicEnabled: (micEnabled: boolean) => void;
  setVoice: (voice: Voice) => void;
  setHead: (head: HeadId) => void;
  setHairColor: (hairColor: string | null) => void;
  setHairLength: (hairLength: number) => void;
  setPatienceMs: (ms: number) => void;
  setError: (error: string | null) => void;
  setApiKey: (apiKey: string | null) => void;
  appendDelta: (id: string, role: Message["role"], delta: string) => void;
  setMessageText: (id: string, role: Message["role"], text: string) => void;
  finishMessage: (id: string) => void;
  reset: () => void;
};

const prefs = loadPrefs();

export const store = reactive<TalkState>({
  status: "offline",
  expression: "neutral",
  expressionIntensity: 0.4,
  messages: [],
  muted: false,
  micEnabled: true,
  voice: prefs.voice ?? "marin",
  head: prefs.head ?? "raccoon",
  hairColor: prefs.hairColor ?? null,
  hairLength: prefs.hairLength ?? 0.35,
  patienceMs: 500,
  error: null,
  apiKey:
    localStorage.getItem(API_KEY) ||
    "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",

  setStatus(status) {
    this.status = status;
  },
  setExpression(expression, intensity) {
    this.expression = expression;
    this.expressionIntensity = intensity;
  },
  setMuted(muted) {
    this.muted = muted;
  },
  setMicEnabled(micEnabled) {
    this.micEnabled = micEnabled;
  },
  setVoice(voice) {
    this.voice = voice;
    savePrefs();
  },
  setHead(head) {
    this.head = head;
    savePrefs();
  },
  setHairColor(hairColor) {
    this.hairColor = hairColor;
    savePrefs();
  },
  setHairLength(hairLength) {
    this.hairLength = hairLength;
    savePrefs();
  },
  setPatienceMs(ms) {
    this.patienceMs = ms;
  },
  setError(error) {
    this.error = error;
  },
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    if (apiKey) localStorage.setItem(API_KEY, apiKey);
    else localStorage.removeItem(API_KEY);
  },
  appendDelta(id, role, delta) {
    const existing = this.messages.find((m) => m.id === id);
    if (!existing) {
      this.messages.push({ id, role, text: delta, done: false });
      return;
    }
    existing.text += delta;
  },
  setMessageText(id, role, text) {
    const existing = this.messages.find((m) => m.id === id);
    if (!existing) {
      this.messages.push({ id, role, text, done: true });
      return;
    }
    existing.text = text;
  },
  finishMessage(id) {
    const m = this.messages.find((m) => m.id === id);
    if (m) m.done = true;
  },
  reset() {
    this.status = "offline";
    this.messages = [];
    this.expression = "neutral";
    this.expressionIntensity = 0.4;
    this.error = null;
  },
});

export function useTalkStore(): TalkState {
  return store;
}
