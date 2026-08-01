import { create } from "zustand";
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

type TalkState = {
  status: Status;
  expression: Expression;
  expressionIntensity: number;
  messages: Message[];
  muted: boolean;
  /** False for a text-only session, where the mic was never requested at all. */
  micEnabled: boolean;
  voice: Voice;
  head: HeadId;
  /** server_vad silence window, in ms. How long a pause has to be before it counts as your turn ending. */
  patienceMs: number;
  error: string | null;

  setStatus: (status: Status) => void;
  setExpression: (expression: Expression, intensity: number) => void;
  setMuted: (muted: boolean) => void;
  setMicEnabled: (micEnabled: boolean) => void;
  setVoice: (voice: Voice) => void;
  setHead: (head: HeadId) => void;
  setPatienceMs: (ms: number) => void;
  setError: (error: string | null) => void;
  appendDelta: (id: string, role: Message["role"], delta: string) => void;
  setMessageText: (id: string, role: Message["role"], text: string) => void;
  finishMessage: (id: string) => void;
  reset: () => void;
};

export const useTalkStore = create<TalkState>((set) => ({
  status: "offline",
  expression: "neutral",
  expressionIntensity: 0.4,
  messages: [],
  muted: false,
  micEnabled: true,
  voice: "marin",
  head: "male",
  patienceMs: 500,
  error: null,

  setStatus: (status) => set({ status }),
  setExpression: (expression, intensity) =>
    set({ expression, expressionIntensity: intensity }),
  setMuted: (muted) => set({ muted }),
  setMicEnabled: (micEnabled) => set({ micEnabled }),
  setVoice: (voice) => set({ voice }),
  setHead: (head) => set({ head }),
  setPatienceMs: (patienceMs) => set({ patienceMs }),
  setError: (error) => set({ error }),

  appendDelta: (id, role, delta) =>
    set((state) => {
      const existing = state.messages.find((m) => m.id === id);
      if (!existing) {
        return {
          messages: [...state.messages, { id, role, text: delta, done: false }],
        };
      }
      return {
        messages: state.messages.map((m) =>
          m.id === id ? { ...m, text: m.text + delta } : m,
        ),
      };
    }),

  setMessageText: (id, role, text) =>
    set((state) => {
      const existing = state.messages.find((m) => m.id === id);
      if (!existing) {
        return {
          messages: [...state.messages, { id, role, text, done: true }],
        };
      }
      return {
        messages: state.messages.map((m) => (m.id === id ? { ...m, text } : m)),
      };
    }),

  finishMessage: (id) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, done: true } : m,
      ),
    })),

  reset: () =>
    set({
      status: "offline",
      messages: [],
      expression: "neutral",
      expressionIntensity: 0.4,
      error: null,
    }),
}));
