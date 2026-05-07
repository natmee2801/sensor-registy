<script setup lang="ts">
withDefaults(
  defineProps<{
    on?: boolean
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { on: false, size: 'md' },
)
</script>

<template>
  <div class="bulb" :class="[`bulb--${size}`, { 'bulb--on': on }]" aria-hidden="true">
    <div class="bulb__halo" />
    <svg class="bulb__svg" viewBox="0 0 64 88" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bulb-glass-on" cx="38%" cy="34%" r="65%">
          <stop offset="0%" stop-color="rgba(255, 255, 235, 0.98)" />
          <stop offset="40%" stop-color="rgba(254, 240, 138, 0.85)" />
          <stop offset="80%" stop-color="rgba(250, 204, 21, 0.7)" />
          <stop offset="100%" stop-color="rgba(202, 138, 4, 0.45)" />
        </radialGradient>
        <radialGradient id="bulb-glass-off" cx="38%" cy="34%" r="65%">
          <stop offset="0%" stop-color="rgba(226, 232, 240, 0.45)" />
          <stop offset="60%" stop-color="rgba(148, 163, 184, 0.28)" />
          <stop offset="100%" stop-color="rgba(51, 65, 85, 0.22)" />
        </radialGradient>
        <linearGradient id="bulb-base-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(148, 163, 184, 0.95)" />
          <stop offset="50%" stop-color="rgba(100, 116, 139, 0.95)" />
          <stop offset="100%" stop-color="rgba(51, 65, 85, 0.95)" />
        </linearGradient>
      </defs>

      <path
        class="bulb__glass"
        d="M32 4 C17 4, 10 16, 10 28 C10 38, 14 44, 19 50 C21 52, 22 54, 22 56 L42 56 C42 54, 43 52, 45 50 C50 44, 54 38, 54 28 C54 16, 47 4, 32 4 Z"
      />

      <ellipse class="bulb__highlight" cx="22" cy="22" rx="4" ry="7" />

      <path
        class="bulb__filament"
        d="M22 38 Q25 32, 28 38 Q31 44, 32 38 Q33 32, 36 38 Q39 44, 42 38"
      />

      <rect class="bulb__band" x="22" y="58" width="20" height="3" rx="0.6" />
      <rect class="bulb__band" x="22.5" y="62" width="19" height="3" rx="0.6" />
      <rect class="bulb__band" x="23" y="66" width="18" height="3" rx="0.6" />
      <rect class="bulb__band" x="23.5" y="70" width="17" height="3" rx="0.6" />

      <path class="bulb__tip" d="M26 73.5 L38 73.5 L35 80 L29 80 Z" />
    </svg>
  </div>
</template>

<style scoped>
.bulb {
  position: relative;
  display: grid;
  place-items: center;
}

.bulb--sm {
  width: 2.4rem;
  height: 3.2rem;
}

.bulb--md {
  width: 3.4rem;
  height: 4.6rem;
}

.bulb--lg {
  width: 5.2rem;
  height: 7rem;
}

.bulb__svg {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 6px 10px rgba(2, 6, 23, 0.45));
  transition: filter 0.4s ease;
}

.bulb--on .bulb__svg {
  filter: drop-shadow(0 0 18px rgba(250, 204, 21, 0.55))
    drop-shadow(0 4px 8px rgba(202, 138, 4, 0.35));
}

.bulb__glass {
  fill: url(#bulb-glass-off);
  stroke: rgba(255, 255, 255, 0.35);
  stroke-width: 0.9;
  transition:
    fill 0.4s ease,
    stroke 0.4s ease;
}

.bulb--on .bulb__glass {
  fill: url(#bulb-glass-on);
  stroke: rgba(254, 249, 195, 0.85);
}

.bulb__highlight {
  fill: rgba(255, 255, 255, 0.32);
  transition: fill 0.4s ease;
}

.bulb--on .bulb__highlight {
  fill: rgba(255, 255, 255, 0.78);
}

.bulb__filament {
  fill: none;
  stroke: rgba(120, 113, 108, 0.65);
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition:
    stroke 0.4s ease,
    filter 0.4s ease;
}

.bulb--on .bulb__filament {
  stroke: #fde047;
  filter: drop-shadow(0 0 4px rgba(250, 204, 21, 0.95));
  animation: bulb-flicker 2.6s ease-in-out infinite;
}

.bulb__band {
  fill: url(#bulb-base-grad);
  stroke: rgba(255, 255, 255, 0.18);
  stroke-width: 0.4;
}

.bulb__tip {
  fill: rgba(30, 41, 59, 0.95);
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 0.4;
}

.bulb__halo {
  position: absolute;
  inset: -10%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 38%, rgba(250, 204, 21, 0.55), transparent 60%);
  opacity: 0;
  transform: scale(0.7);
  transition:
    opacity 0.45s ease,
    transform 0.45s ease;
  pointer-events: none;
}

.bulb--on .bulb__halo {
  opacity: 1;
  transform: scale(1.35);
  animation: bulb-pulse 2.6s ease-in-out infinite;
}

@keyframes bulb-pulse {
  0%,
  100% {
    opacity: 0.82;
    transform: scale(1.3);
  }
  50% {
    opacity: 1;
    transform: scale(1.5);
  }
}

@keyframes bulb-flicker {
  0%,
  100% {
    opacity: 1;
  }
  48% {
    opacity: 0.92;
  }
  52% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bulb--on .bulb__halo,
  .bulb--on .bulb__filament {
    animation: none;
  }
}
</style>
