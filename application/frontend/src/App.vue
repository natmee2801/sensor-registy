<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
import { useDevicesStore } from '@/stores/devices'

const store = useDevicesStore()

onMounted(() => {
  store.refreshAll().catch(() => {})
  store.subscribeEvents()
})

onUnmounted(() => {
  store.unsubscribeEvents()
})
</script>

<template>
  <main class="page">
    <div class="page__glow page__glow--1" aria-hidden="true" />
    <div class="page__glow page__glow--2" aria-hidden="true" />
    <div class="page__grid" aria-hidden="true" />

    <div class="page__shell">
      <AppNav />
      <RouterView />
    </div>
  </main>
</template>

<style scoped>
.page {
  position: relative;
  isolation: isolate;
  padding: clamp(1rem, 4vw, 2.5rem);
  font-family: var(--font);
  color: var(--text);
  overflow-x: clip;
}

.page__shell {
  position: relative;
  width: min(100%, 44rem);
  margin: 0 auto;
}

.page__glow {
  position: fixed;
  width: min(42rem, 90vw);
  height: min(42rem, 90vw);
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.55;
  z-index: -1;
  pointer-events: none;
}

.page__glow--1 {
  top: -10vh;
  left: -10vw;
  background: rgba(56, 189, 248, 0.35);
}

.page__glow--2 {
  bottom: -15vh;
  right: -12vw;
  background: rgba(167, 139, 250, 0.32);
}

.page__grid {
  position: fixed;
  inset: 0;
  z-index: -1;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at 50% 0%, black 0%, transparent 68%);
  pointer-events: none;
}
</style>
