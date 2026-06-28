<template>
  <div class="splash" role="img" aria-label="Lumen registry splash">
    <div class="splash__box">
      <div class="splash__logo" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <defs>
            <linearGradient id="g" x1="0" x2="1">
              <stop offset="0" stop-color="#fcd34d" />
              <stop offset="1" stop-color="#f97316" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="44" fill="url(#g)" />
          <g stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">
            <path d="M60 20v18" />
            <path d="M60 82v18" />
            <path d="M20 60h18" />
            <path d="M82 60h18" />
            <path d="M34 34l12 12" />
            <path d="M76 76l12 12" />
          </g>
        </svg>
      </div>

      <div class="splash__title">Lumen.registry</div>
      <div class="splash__sub">ควบคุมหลอดไฟผ่าน MQTT</div>

      <div class="splash__loader" aria-hidden>
        <span></span><span></span><span></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// purely presentational
</script>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, rgba(2,6,23,0.9), rgba(6,8,30,0.93));
  z-index: 9999;
  -webkit-font-smoothing: antialiased;
}

:root {
  --splash-pop: 900ms;
  --splash-fade-leave: 700ms;
  --logo-spin: 2000ms;
  --loader-duration: 700ms;
}

.splash__box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  transform: translateY(0);
  animation: splash-pop var(--splash-pop) cubic-bezier(.16,.84,.26,1);
}

.splash__logo { 
  width: 120px; height: 120px; 
  filter: drop-shadow(0 10px 30px rgba(0,0,0,0.55));
  animation: logo-spin var(--logo-spin) ease-in-out infinite;
}

.splash__title {
  font-weight: 800;
  color: #fff;
  font-size: 1.2rem;
  letter-spacing: -0.02em;
}

.splash__sub {
  color: rgba(255,255,255,0.72);
  font-size: 0.85rem;
}

.splash__loader {
  display: flex;
  gap: 0.45rem;
  margin-top: 0.6rem;
}
.splash__loader span {
  width: 8px; height: 8px; border-radius: 50%; background: #ffd54a; display: inline-block;
  animation: loader var(--loader-duration) ease-in-out infinite;
}
.splash__loader span:nth-child(2){ animation-delay: calc(var(--loader-duration) / 6) }
.splash__loader span:nth-child(3){ animation-delay: calc(var(--loader-duration) / 3) }

@keyframes loader{
  0%, 100% { transform: translateY(0); opacity: 0.8 }
  50% { transform: translateY(-10px); opacity: 1 }
}

@keyframes logo-spin{
  0% { transform: rotate(0deg) scale(1) }
  25% { transform: rotate(6deg) scale(1.02) }
  50% { transform: rotate(0deg) scale(1) }
  75% { transform: rotate(-6deg) scale(0.98) }
  100% { transform: rotate(0deg) scale(1) }
}

@keyframes splash-pop{
  0% { opacity: 0; transform: translateY(8px) scale(0.96) }
  60% { opacity: 1; transform: translateY(0) scale(1.03) }
  100% { transform: translateY(0) scale(1) }
}

.splash--exiting {
  animation: splash-exit var(--splash-fade-leave) ease forwards;
}

@keyframes splash-exit{
  0% { opacity: 1; transform: scale(1) }
  100% { opacity: 0; transform: scale(0.98) translateY(-6px) }
}
</style>
