<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BrightnessLevel } from '@/types/device'

const props = withDefaults(
  defineProps<{
    level?: BrightnessLevel
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { level: 'off', size: 'md' },
)

// each change to a lit level mounts a fresh ring, so the bloom plays once per change
const bloomKey = ref(0)
watch(
  () => props.level,
  (next, prev) => {
    if (next !== 'off' && next !== prev) bloomKey.value++
  },
)
</script>

<template>
  <svg
    class="bulb"
    :class="[`bulb--${size}`, `bulb--${level}`]"
    viewBox="0 0 24 28"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle
      v-if="bloomKey > 0 && level !== 'off'"
      :key="bloomKey"
      class="bulb__bloom"
      cx="12"
      cy="11"
      r="6"
    />

    <g class="bulb__rays">
      <line x1="12" y1="1.5" x2="12" y2="3" />
      <line x1="2.5" y1="11" x2="4" y2="11" />
      <line x1="21.5" y1="11" x2="20" y2="11" />
      <line x1="4.8" y1="3.8" x2="5.8" y2="4.8" />
      <line x1="19.2" y1="3.8" x2="18.2" y2="4.8" />
    </g>

    <ellipse class="bulb__fill" cx="12" cy="11" rx="5.5" ry="6" />

    <path
      class="bulb__outline"
      d="M12 4.5a6.5 6.5 0 0 0-4 11.7v2.3h8v-2.3A6.5 6.5 0 0 0 12 4.5Z"
    />
    <line class="bulb__base" x1="9" y1="20" x2="15" y2="20" />
    <line class="bulb__base" x1="10" y1="22.5" x2="14" y2="22.5" />
    <line class="bulb__base" x1="10.5" y1="25" x2="13.5" y2="25" />
  </svg>
</template>

<style scoped>
.bulb {
  display: block;
  color: #6a6354;
  transition: color 0.3s ease, filter 0.3s ease;
}

.bulb--sm {
  width: 1.25rem;
  height: 1.45rem;
}

.bulb--md {
  width: 1.75rem;
  height: 2rem;
}

.bulb--lg {
  width: 2.6rem;
  height: 3rem;
}

.bulb__outline,
.bulb__base,
.bulb__rays line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.bulb__fill {
  fill: currentColor;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.bulb--low {
  color: #fcd34d;
  filter: drop-shadow(0 0 6px rgba(252, 211, 77, 0.35));
}

.bulb--low .bulb__fill {
  fill: #fbbf24;
  opacity: 0.55;
}

.bulb--high {
  color: #fde68a;
  filter: drop-shadow(0 0 10px rgba(252, 211, 77, 0.7));
}

.bulb--high .bulb__fill {
  fill: #fcd34d;
  opacity: 0.95;
}

.bulb__rays {
  opacity: 0;
  transform: scale(0.7);
  transform-origin: 12px 11px;
}

.bulb--high .bulb__rays {
  stroke: #fde68a;
  opacity: 1;
  transform: scale(1);
}

.bulb__bloom {
  fill: none;
  stroke: #fde68a;
  stroke-width: 1.2;
  opacity: 0;
  transform-origin: 12px 11px;
  pointer-events: none;
}

@keyframes bulb-bloom {
  0% { opacity: 0.75; transform: scale(0.7); }
  100% { opacity: 0; transform: scale(1.9); }
}

@media (prefers-reduced-motion: no-preference) {
  .bulb__rays {
    transition:
      opacity var(--dur-base) var(--ease-out),
      transform var(--dur-slow) var(--ease-spring);
  }
  .bulb__bloom { animation: bulb-bloom 900ms var(--ease-out) forwards; }
}

@media (prefers-reduced-motion: reduce) {
  .bulb { transition: none; }
  .bulb__fill { transition: none; }
}
</style>
