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
  <article class="pair-card" :class="{ 'pair-card--stale': isStale }">
    <header class="pair-card__head">
      <div class="pair-card__identity">
        <span class="pair-card__id">{{ session.proposedId }}</span>
        <span class="pair-card__mac">{{ session.mac }}</span>
      </div>
      <span
        class="pair-card__badge"
        :class="{ 'pair-card__badge--stale': isStale }"
      >
        {{ isStale ? 'ไม่ตอบสนอง' : 'พร้อม pair' }}
      </span>
    </header>

    <dl class="pair-card__meta">
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

    <button type="button" class="pair-card__claim" @click="handleClaim">
      Claim
    </button>
  </article>
</template>

<style scoped>
.pair-card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.1rem 1.15rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  color: var(--text);
  transition: opacity 0.25s ease, border-color 0.25s ease;
}

.pair-card--stale {
  opacity: 0.55;
  border-color: rgba(251, 146, 60, 0.45);
}

.pair-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.pair-card__identity {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.pair-card__id {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.95rem;
  font-weight: 600;
  word-break: break-all;
}

.pair-card__mac {
  font-size: 0.78rem;
  color: var(--muted);
  font-family: ui-monospace, monospace;
}

.pair-card__badge {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.18);
  color: #bae6fd;
  border: 1px solid rgba(56, 189, 248, 0.4);
}

.pair-card__badge--stale {
  background: rgba(251, 146, 60, 0.18);
  color: #fed7aa;
  border-color: rgba(251, 146, 60, 0.45);
}

.pair-card__meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin: 0;
  font-size: 0.78rem;
}

.pair-card__meta dt {
  color: rgba(148, 163, 184, 0.85);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.pair-card__meta dd {
  margin: 0.15rem 0 0;
  color: var(--text);
}

.pair-card__claim {
  width: 100%;
  padding: 0.6rem 0.9rem;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  color: #042f1a;
  background: linear-gradient(100deg, #4ade80 0%, #22c55e 100%);
  box-shadow: 0 8px 24px rgba(34, 197, 94, 0.3);
  transition: transform 0.18s ease, filter 0.18s ease;
}

.pair-card__claim:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}
</style>
