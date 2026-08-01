"use client";

import { useEffect, useRef, useState } from "react";
import { startDemoVoice } from "@/lib/demo";
import { realtime } from "@/lib/realtime";
import { useTalkStore, VOICES, type Status, type Voice } from "@/lib/store";

const STATUS_LABEL: Record<Status, string> = {
  offline: "Offline",
  connecting: "Connecting",
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

const STATUS_DOT: Record<Status, string> = {
  offline: "bg-neutral-600",
  connecting: "bg-amber-400 animate-pulse",
  idle: "bg-emerald-500",
  listening: "bg-sky-400 animate-pulse",
  thinking: "bg-violet-400 animate-pulse",
  speaking: "bg-emerald-400",
};

export function Controls() {
  const status = useTalkStore((s) => s.status);
  const muted = useTalkStore((s) => s.muted);
  const voice = useTalkStore((s) => s.voice);
  const patienceMs = useTalkStore((s) => s.patienceMs);
  const error = useTalkStore((s) => s.error);
  const setVoice = useTalkStore((s) => s.setVoice);
  const setPatienceMs = useTalkStore((s) => s.setPatienceMs);

  const [draft, setDraft] = useState("");
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const stopDemo = useRef<(() => void) | null>(null);
  const live = status !== "offline" && status !== "connecting";

  useEffect(() => {
    setDemoAvailable(
      new URLSearchParams(window.location.search).has("demo"),
    );
  }, []);

  const toggleDemo = () => {
    if (stopDemo.current) {
      stopDemo.current();
      stopDemo.current = null;
      setDemoRunning(false);
      return;
    }
    stopDemo.current = startDemoVoice();
    setDemoRunning(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !live) return;
    realtime.sendText(text);
    setDraft("");
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-2 text-xs font-medium tracking-wide text-neutral-300 backdrop-blur-md">
          <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
          {STATUS_LABEL[status]}
          {live && !muted && (
            <span className="ml-1 text-[10px] uppercase text-rose-400">mic on</span>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <select
            value={voice}
            disabled={live}
            onChange={(e) => setVoice(e.target.value as Voice)}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs text-neutral-300 backdrop-blur-md disabled:opacity-40"
          >
            {VOICES.map((v) => (
              <option key={v} value={v} className="bg-neutral-900">
                {v}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-neutral-400 backdrop-blur-md">
            <span title="How long a pause has to be before your turn counts as over">
              patience
            </span>
            <input
              type="range"
              min={200}
              max={1200}
              step={50}
              value={patienceMs}
              disabled={live}
              onChange={(e) => setPatienceMs(Number(e.target.value))}
              className="w-20 accent-sky-400 disabled:opacity-40"
            />
            <span className="w-10 tabular-nums text-neutral-500">{patienceMs}ms</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="absolute inset-x-0 top-20 mx-auto w-fit max-w-lg rounded-lg border border-rose-500/30 bg-rose-950/60 px-4 py-2 text-center text-sm text-rose-200 backdrop-blur-md">
          {error}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6">
        <form onSubmit={submit} className="flex w-full max-w-xl items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!live}
            placeholder={live ? "Or type instead…" : "Start a conversation to type"}
            className="flex-1 rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 backdrop-blur-md outline-none focus:border-sky-400/40 disabled:opacity-40"
          />
        </form>

        <div className="flex items-center gap-3">
          {live ? (
            <>
              <button
                onClick={() => realtime.setMuted(!muted)}
                className={`rounded-full border px-5 py-3 text-sm font-medium backdrop-blur-md transition ${
                  muted
                    ? "border-rose-400/40 bg-rose-500/20 text-rose-200"
                    : "border-white/10 bg-black/40 text-neutral-300 hover:border-white/25"
                }`}
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={() => realtime.disconnect()}
                className="rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm font-medium text-neutral-300 backdrop-blur-md transition hover:border-white/25"
              >
                End
              </button>
            </>
          ) : (
            <button
              onClick={() => realtime.connect()}
              disabled={status === "connecting"}
              className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-50"
            >
              {status === "connecting" ? "Connecting…" : "Start talking"}
            </button>
          )}
          {demoAvailable && (
            <button
              onClick={toggleDemo}
              className="rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm font-medium text-neutral-400 backdrop-blur-md transition hover:border-white/25"
            >
              {demoRunning ? "Stop demo" : "Demo voice"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
