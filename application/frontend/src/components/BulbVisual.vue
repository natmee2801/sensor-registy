<script setup lang="ts">
import type { BrightnessLevel } from '@/types/device'

withDefaults(
  defineProps<{
    level?: BrightnessLevel
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { level: 'off', size: 'md' },
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
    <g v-if="level === 'high'" class="bulb__rays">
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
  color: rgba(203, 213, 225, 0.65);
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
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.bulb__fill {
  fill: currentColor;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.bulb--low {
  color: #fde68a;
}

.bulb--low .bulb__fill {
  opacity: 0.32;
}

.bulb--high {
  color: #fde047;
  filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.45));
}

.bulb--high .bulb__fill {
  opacity: 0.7;
}

.bulb--high .bulb__rays {
  stroke: currentColor;
}

@media (prefers-reduced-motion: reduce) {
  .bulb {
    transition: none;
  }
  .bulb__fill {
    transition: none;
  }
}
</style>
