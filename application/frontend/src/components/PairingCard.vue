<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PairingSession } from '@/types/device'

const props = defineProps<{ session: PairingSession }>()
const emit = defineEmits<{ (e: 'claim', session: PairingSession): void }>()

const nowTick = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    nowTick.value = Date.now()
  }, 10_000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const staleMs = computed(
  () => nowTick.value - new Date(props.session.lastSeenAt).getTime(),
)
const isStale = computed(() => staleMs.value > 30_000)

const lastSeenLabel = computed(() => {
  const s = Math.max(0, Math.floor(staleMs.value / 1000))
  if (s < 5) return 'เพิ่งเห็น'
  if (s < 60) return `${s} วิที่แล้ว`
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`
  return `${Math.floor(s / 3600)} ชม.ที่แล้ว`
})

const handleClaim = () => emit('claim', props.session)
</script>

<template>
  <article class="pair" :class="{ 'pair--stale': isStale }">
    <div class="pair__sweep" aria-hidden="true" />

    <header class="pair__head">
      <div class="pair__identity">
        <span class="pair__id">{{ session.proposedId }}</span>
        <span class="pair__mac">{{ session.mac }}</span>
      </div>
      <span
        class="pair__badge"
        :class="{ 'pair__badge--stale': isStale }"
      >
        <span class="pair__badge-dot" />
        {{ isStale ? 'ไม่ตอบสนอง' : 'พร้อม pair' }}
      </span>
    </header>

    <dl class="pair__meta">
      <div>
        <dt>รุ่น</dt>
        <dd>{{ session.model ?? '—' }}</dd>
      </div>
      <div>
        <dt>เฟิร์มแวร์</dt>
        <dd>{{ session.fw ?? '—' }}</dd>
      </div>
      <div>
        <dt>เห็นล่าสุด</dt>
        <dd>{{ lastSeenLabel }}</dd>
      </div>
    </dl>

    <button type="button" class="pair__claim" @click="handleClaim">
      <span>Claim อุปกรณ์</span>
      <span aria-hidden="true">→</span>
    </button>
  </article>
</template>

<style scoped>
.pair {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
  padding: 1.15rem 1.2rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  color: var(--text);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow: hidden;
  transition: opacity 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
}

.pair:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: rgba(245, 158, 11, 0.3);
}

.pair__sweep {
  position: absolute;
  top: 0;
  left: -40%;
  width: 30%;
  height: 100%;
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(252, 211, 77, 0.12) 50%,
    transparent 100%
  );
  animation: pairSweep 3.5s ease-in-out infinite;
  pointer-events: none;
}

@keyframes pairSweep {
  0% { left: -40%; }
  60% { left: 130%; }
  100% { left: 130%; }
}

.pair--stale {
  opacity: 0.55;
  border-color: rgba(251, 146, 60, 0.32);
}

.pair--stale .pair__sweep { animation-play-state: paused; opacity: 0; }

.pair__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.pair__identity {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.pair__id {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.95rem;
  font-weight: 700;
  word-break: break-all;
  letter-spacing: -0.01em;
}

.pair__mac {
  font-size: 0.76rem;
  color: var(--muted);
  font-family: ui-monospace, monospace;
}

.pair__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.22rem 0.6rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  border: 1px solid rgba(245, 158, 11, 0.32);
  letter-spacing: 0.02em;
}

.pair__badge-dot {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 999px;
  background: var(--accent-strong);
  box-shadow: 0 0 0 0 currentColor;
  animation: pairDot 1.6s ease-in-out infinite;
}

@keyframes pairDot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
  50% { box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.28); }
}

.pair__badge--stale {
  background: var(--offline-soft);
  color: var(--offline-text);
  border-color: rgba(251, 146, 60, 0.32);
}

.pair__badge--stale .pair__badge-dot {
  background: var(--offline);
  animation: none;
}

.pair__meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.65rem;
  margin: 0;
  padding: 0.65rem 0.8rem;
  border-radius: var(--radius-md);
  background: var(--surface-sunk);
  border: 1px solid var(--stroke);
}

.pair__meta dt {
  color: var(--muted);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pair__meta dd {
  margin: 0.2rem 0 0;
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 600;
}

.pair__claim {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 0.95rem;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  color: #1a1206;
  background: linear-gradient(100deg, #fcd34d 0%, #f59e0b 60%, #ea580c 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 8px 22px rgba(245, 158, 11, 0.32);
  transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
}

.pair__claim:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 12px 30px rgba(245, 158, 11, 0.4);
}
</style>
