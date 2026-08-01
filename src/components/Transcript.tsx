"use client";

import { useEffect, useRef } from "react";
import { useTalkStore } from "@/lib/store";

export function Transcript() {
  const messages = useTalkStore((s) => s.messages);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div
      ref={scroller}
      className="pointer-events-auto absolute inset-x-0 bottom-40 mx-auto flex max-h-52 w-full max-w-2xl flex-col gap-3 overflow-y-auto px-6 [mask-image:linear-gradient(to_bottom,transparent,black_18%)]"
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={
            m.role === "assistant"
              ? "text-balance text-lg leading-snug text-neutral-100"
              : "text-sm text-neutral-500"
          }
        >
          {m.role === "user" && <span className="mr-2 text-neutral-600">you</span>}
          {m.text}
        </div>
      ))}
    </div>
  );
}
