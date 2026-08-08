<template>
  <div
    class="pointer-events-none absolute inset-x-0 bottom-32 flex flex-col items-center gap-1 px-6 text-center"
  >
    <div
      v-for="msg in visibleMessages"
      :key="msg.id"
      class="max-w-xl rounded-full px-4 py-1.5 text-sm backdrop-blur-md"
      :class="
        msg.role === 'user'
          ? 'bg-sky-500/15 text-sky-100'
          : 'bg-white/10 text-neutral-100'
      "
    >
      {{ msg.text }}
      <span v-if="!msg.done" class="ml-1 animate-pulse">▍</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTalkStore } from "@/lib/store";

const store = useTalkStore();
const visibleMessages = computed(() =>
  store.messages.filter((m) => m.text.trim() || !m.done).slice(-3),
);
</script>
