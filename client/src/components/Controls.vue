<template>
  <div>
    <!-- Top bar -->
    <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5">
      <div class="flex flex-col items-start gap-2">
        <!-- Status -->
        <div
          class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-2 text-xs font-medium tracking-wide text-neutral-300 backdrop-blur-md"
        >
          <span class="size-2 rounded-full" :class="statusDot" />
          {{ statusLabel }}
          <span
            v-if="live && store.micEnabled && !store.muted"
            class="ml-1 text-[10px] uppercase text-rose-400"
          >
            mic on
          </span>
          <span
            v-if="live && !store.micEnabled"
            class="ml-1 text-[10px] uppercase text-neutral-500"
          >
            text only
          </span>
        </div>

        <!-- Head selector -->
        <div
          class="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-md"
        >
          <button
            v-for="id in HEAD_IDS"
            :key="id"
            @click="store.setHead(id)"
            class="rounded-full px-3 py-1.5 text-xs font-medium transition"
            :class="
              store.head === id
                ? 'bg-white text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-200'
            "
          >
            {{ HEADS[id].label }}
          </button>
        </div>

        <!-- Hair colour (procedural only) -->
        <div
          v-if="isProceduralHead(store.head) && activeHair"
          class="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-2 backdrop-blur-md"
        >
          <button
            v-for="{ value, label } in HAIR_COLORS"
            :key="value"
            @click="store.setHairColor(value)"
            :title="label"
            :aria-label="label"
            :aria-pressed="activeHair.toLowerCase() === value.toLowerCase()"
            :style="{ backgroundColor: value }"
            class="size-4 rounded-full border transition"
            :class="
              activeHair.toLowerCase() === value.toLowerCase()
                ? 'scale-125 border-white'
                : 'border-white/25 hover:border-white/60'
            "
          />

          <label
            title="Custom colour"
            class="relative size-4 cursor-pointer overflow-hidden rounded-full border border-white/25"
            :style="{
              background:
                'conic-gradient(#ef4444,#eab308,#22c55e,#06b6d4,#6366f1,#ec4899,#ef4444)',
            }"
          >
            <input
              type="color"
              :value="activeHair"
              @input="
                (e) => store.setHairColor((e.target as HTMLInputElement).value)
              "
              class="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>

          <button
            v-if="store.hairColor"
            @click="store.setHairColor(null)"
            title="Back to this character's default"
            class="ml-0.5 text-[10px] uppercase tracking-wide text-neutral-500 transition hover:text-neutral-300"
          >
            reset
          </button>
        </div>

        <!-- Hair length (procedural long hair only) -->
        <label
          v-if="isProceduralHead(store.head) && HEAD_PRESETS[store.head].longHair"
          class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-neutral-400 backdrop-blur-md"
        >
          length
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="store.hairLength"
            @input="
              (e) => store.setHairLength(Number((e.target as HTMLInputElement).value))
            "
            class="w-24 accent-sky-400"
            aria-label="Hair length"
          />
        </label>
      </div>

      <!-- Right side controls -->
      <div class="pointer-events-auto flex items-center gap-2">
        <select
          :value="store.voice"
          :disabled="live"
          @change="store.setVoice(($event.target as HTMLSelectElement).value as Voice)"
          class="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs text-neutral-300 backdrop-blur-md disabled:opacity-40"
        >
          <option
            v-for="v in VOICES"
            :key="v"
            :value="v"
            class="bg-neutral-900"
          >
            {{ v }}
          </option>
        </select>

        <label
          class="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-neutral-400 backdrop-blur-md"
        >
          <span title="How long a pause has to be before your turn counts as over">
            patience
          </span>
          <input
            type="range"
            min="200"
            max="1200"
            step="50"
            :value="store.patienceMs"
            :disabled="live"
            @input="
              (e) => store.setPatienceMs(Number((e.target as HTMLInputElement).value))
            "
            class="w-20 accent-sky-400 disabled:opacity-40"
          />
          <span class="w-10 tabular-nums text-neutral-500">
            {{ store.patienceMs }}ms
          </span>
        </label>
      </div>
    </div>

    <!-- Error -->
    <div
      v-if="store.error"
      class="absolute inset-x-0 top-20 mx-auto w-fit max-w-lg rounded-lg border border-rose-500/30 bg-rose-950/60 px-4 py-2 text-center text-sm text-rose-200 backdrop-blur-md"
    >
      {{ store.error }}
    </div>

    <!-- API key (stored in localStorage; spend limited by the OpenAI account) -->
    <div
      class="pointer-events-auto absolute right-5 top-44 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-md"
    >
      <label class="text-xs text-neutral-400">
        OpenAI API key
        <input
          type="password"
          :value="store.apiKey ?? ''"
          @input="
            (e) => store.setApiKey((e.target as HTMLInputElement).value || null)
          "
          placeholder="sk-..."
          class="mt-1 w-48 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-sky-400/40"
        />
      </label>
      <p class="max-w-48 text-[10px] text-neutral-500">
        Stored in your browser. Usage is billed to that OpenAI account.
      </p>
    </div>

    <!-- Bottom controls -->
    <div class="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6">
      <form @submit.prevent="submit" class="flex w-full max-w-xl items-center gap-2">
        <input
          v-model="draft"
          :disabled="store.status === 'connecting'"
          :placeholder="live && store.micEnabled ? 'Or type instead…' : 'Type a message…'"
          class="flex-1 rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 backdrop-blur-md outline-none focus:border-sky-400/40 disabled:opacity-40"
        />
      </form>

      <div class="flex items-center gap-3">
        <template v-if="live">
          <button
            v-if="store.micEnabled"
            @click="realtime.setMuted(!store.muted)"
            class="rounded-full border px-5 py-3 text-sm font-medium backdrop-blur-md transition"
            :class="
              store.muted
                ? 'border-rose-400/40 bg-rose-500/20 text-rose-200'
                : 'border-white/10 bg-black/40 text-neutral-300 hover:border-white/25'
            "
          >
            {{ store.muted ? "Unmute" : "Mute" }}
          </button>
          <button
            @click="realtime.disconnect()"
            class="rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm font-medium text-neutral-300 backdrop-blur-md transition hover:border-white/25"
          >
            End
          </button>
        </template>
        <button
          v-else
          @click="realtime.connect()"
          :disabled="store.status === 'connecting'"
          class="rounded-full bg-white px-7 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-50"
        >
          {{ store.status === "connecting" ? "Connecting…" : "Start talking" }}
        </button>
        <button
          v-if="demoAvailable"
          @click="toggleDemo"
          class="rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm font-medium text-neutral-400 backdrop-blur-md transition hover:border-white/25"
        >
          {{ demoRunning ? "Stop demo" : "Demo voice" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { HAIR_COLORS, HEAD_IDS, HEAD_PRESETS, HEADS, isProceduralHead } from "@/lib/heads";
import { realtime } from "@/lib/realtime";
import { startDemoVoice } from "@/lib/demo";
import { useTalkStore, VOICES, type Status, type Voice } from "@/lib/store";

const store = useTalkStore();
const draft = ref("");
const demoRunning = ref(false);
let stopDemo: (() => void) | null = null;

const demoAvailable = computed(() => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("demo");
});

const live = computed(
  () => store.status !== "offline" && store.status !== "connecting",
);

const activeHair = computed(() =>
  isProceduralHead(store.head)
    ? (store.hairColor ?? HEAD_PRESETS[store.head].palette.hair)
    : null,
);

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

const statusLabel = computed(() => STATUS_LABEL[store.status]);
const statusDot = computed(() => STATUS_DOT[store.status]);

function toggleDemo() {
  if (stopDemo) {
    stopDemo();
    stopDemo = null;
    demoRunning.value = false;
    return;
  }
  stopDemo = startDemoVoice();
  demoRunning.value = true;
}

async function submit() {
  const text = draft.value.trim();
  if (!text || store.status === "connecting") return;
  draft.value = "";
  if (!live.value) await realtime.connect({ mic: false });
  realtime.sendText(text);
}
</script>
