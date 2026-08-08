<template>
  <main class="relative h-dvh w-full overflow-hidden bg-neutral-950">
    <div
      class="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,#1e293b_0%,#0a0a0b_65%)]"
    />
    <div class="absolute inset-0">
      <Scene />
    </div>
    <Transcript />
    <Controls />
  </main>
</template>

<script setup lang="ts">
import Scene from "./components/Scene.vue";
import Transcript from "./components/Transcript.vue";
import Controls from "./components/Controls.vue";
</script>
