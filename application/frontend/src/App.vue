<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
import SplashScreen from '@/components/SplashScreen.vue'
import { useDevicesStore } from '@/stores/devices'

const store = useDevicesStore()
const showSplash = ref(true)

onMounted(() => {
  // Ensure the splash shows for at least `minSplashMs`, with a max fallback.
  const minSplashMs = 2500
  const maxFallbackMs = 8000
  const start = Date.now()
  const fallback = setTimeout(() => (showSplash.value = false), maxFallbackMs)

  store.refreshAll()
    .catch(() => {})
    .finally(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, minSplashMs - elapsed)
      // small post-load easing time
      setTimeout(() => {
        showSplash.value = false
        clearTimeout(fallback)
      }, remaining + 420)
    })

  store.subscribeEvents()
})

onUnmounted(() => {
  store.unsubscribeEvents()
})
</script>

<template>
  <main class="page">
    <transition name="fade" appear>
      <SplashScreen v-if="showSplash" class="splash-root" />
    </transition>
    <div class="page__wash page__wash--1" aria-hidden="true" />
    <div class="page__wash page__wash--2" aria-hidden="true" />

    <div class="page__shell">
      <AppNav />
      <RouterView />
    </div>
  </main>
</template>

<style scoped>
.fade-enter-active { transition: opacity 360ms cubic-bezier(.16,.84,.26,1); }
.fade-leave-active { transition: opacity 700ms cubic-bezier(.16,.84,.26,1), transform 700ms cubic-bezier(.16,.84,.26,1); }
.fade-enter-from, .fade-leave-to { opacity: 0 }
.fade-leave-to { transform: scale(0.98) translateY(-6px) }

.page {
  position: relative;
  isolation: isolate;
  padding: clamp(0.75rem, 2.5vw, 1.4rem) clamp(1rem, 3vw, 1.6rem) clamp(1.25rem, 3vw, 2rem);
  font-family: var(--font);
  color: var(--text);
  overflow-x: clip;
}

.page__shell {
  position: relative;
  width: min(100%, 46rem);
  margin: 0 auto;
}

.page__wash {
  position: fixed;
  border-radius: 50%;
  filter: blur(120px);
  z-index: -1;
  pointer-events: none;
}

.page__wash--1 {
  top: -22vh;
  left: -12vw;
  width: min(48rem, 95vw);
  height: min(48rem, 95vw);
  background: radial-gradient(circle, rgba(252, 211, 77, 0.22), transparent 65%);
  opacity: 0.85;
}

.page__wash--2 {
  bottom: -24vh;
  right: -16vw;
  width: min(42rem, 90vw);
  height: min(42rem, 90vw);
  background: radial-gradient(circle, rgba(234, 88, 12, 0.18), transparent 65%);
  opacity: 0.85;
}
</style>
