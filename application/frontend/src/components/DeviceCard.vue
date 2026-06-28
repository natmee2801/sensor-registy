<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import {
  BRIGHTNESS_LABELS,
  BRIGHTNESS_LEVELS,
  type BrightnessLevel,
  type Device,
} from '@/types/device'
import BulbVisual from '@/components/BulbVisual.vue'

const props = defineProps<{ device: Device }>()

const store = useDevicesStore()
const { states } = storeToRefs(store)

const state = computed(() => states.value[props.device.id])
const isOnline = computed(() => state.value?.isOnline ?? false)
const brightness = computed<BrightnessLevel>(() => store.getBrightness(props.device.id))
const deviceMode = computed(() => store.getDeviceMode(props.device.id))

const lastUpdate = computed(() => {
  const s = state.value
  if (!s) return null
  const ts = [
    s.outputs.out1.lastUpdatedAt,
    s.outputs.out2.lastUpdatedAt,
  ].filter((v): v is string => !!v)
  if (ts.length === 0) return null
  return ts.sort().pop() as string
})

const formatThaiDateTime = (isoDate: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(isoDate),
  )

const badgeLabel = computed(() =>
  !isOnline.value ? 'ออฟไลน์' : BRIGHTNESS_LABELS[brightness.value],
)

const handleQuick = (level: BrightnessLevel, event: Event) => {
  event.preventDefault()
  event.stopPropagation()
  store.setBrightness(props.device.id, level).catch(() => {})
}
</script>

<template>
  <RouterLink
    :to="{ name: 'device-detail', params: { id: device.id } }"
    class="card"
    :class="[
      isOnline ? `card--${brightness}` : 'card--offline',
    ]"
  >
    <div class="card__halo" aria-hidden="true" />

    <div class="card__head">
      <div class="card__bulb">
        <BulbVisual :level="isOnline ? brightness : 'off'" size="md" />
      </div>
      <div class="card__identity">
        <span class="card__id">{{ device.id }}</span>
        <span class="card__location">{{ device.location }}</span>
      </div>
      <span
        class="card__badge"
        :class="[
          isOnline ? `card__badge--${brightness}` : 'card__badge--offline',
        ]"
      >
        <span class="card__badge-dot" />
        {{ badgeLabel }}
      </span>
    </div>

    <div class="card__meta">
      <span v-if="lastUpdate" class="card__time">
        <span aria-hidden="true">·</span> {{ formatThaiDateTime(lastUpdate) }}
      </span>
      <span v-else class="card__time card__time--muted">ยังไม่มีกิจกรรม</span>
    </div>

    <div class="card__segmented" :data-active="isOnline ? brightness : 'off'">
      <button
        v-for="level in BRIGHTNESS_LEVELS"
        :key="level"
        type="button"
        class="card__btn"
        :class="{
          'card__btn--active': brightness === level,
          [`card__btn--${level}`]: brightness === level,
        }"
        :disabled="!isOnline || deviceMode === 'auto'"
        @click="handleQuick(level, $event)"
      >
        {{ BRIGHTNESS_LABELS[level] }}
      </button>
    </div>
  </RouterLink>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.85rem 0.9rem 0.8rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  text-decoration: none;
  color: var(--text);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  transition:
    border-color 0.25s ease,
    transform 0.2s ease,
    box-shadow 0.25s ease;
  overflow: hidden;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: rgba(245, 158, 11, 0.28);
}

.card__halo {
  position: absolute;
  top: -40%;
  right: -25%;
  width: 14rem;
  height: 14rem;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(252, 211, 77, 0.12), transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.card--low .card__halo,
.card--high .card__halo {
  opacity: 1;
}

.card--high .card__halo {
  background: radial-gradient(circle, rgba(252, 211, 77, 0.24), transparent 70%);
}

.card--offline { opacity: 0.65; }

.card__head {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.card__bulb {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--surface-sunk);
  border: 1px solid var(--stroke);
  flex-shrink: 0;
}

.card--low .card__bulb,
.card--high .card__bulb {
  background: radial-gradient(circle, rgba(252, 211, 77, 0.28) 0%, rgba(245, 158, 11, 0.1) 100%);
  border-color: rgba(245, 158, 11, 0.28);
  box-shadow: 0 0 16px rgba(252, 211, 77, 0.18);
}

.card__identity {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  flex: 1;
}

.card__id {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  word-break: break-all;
}

.card__location {
  font-size: 0.82rem;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: var(--surface-sunk);
  color: var(--text-2);
  border: 1px solid var(--stroke);
  letter-spacing: 0.02em;
}

.card__badge-dot {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 999px;
  background: #6a6354;
}

.card__badge--low { background: var(--warm-soft); color: var(--warm); border-color: rgba(252, 211, 77, 0.32); }
.card__badge--low .card__badge-dot { background: var(--warm); box-shadow: 0 0 6px rgba(252, 211, 77, 0.6); }
.card__badge--high { background: var(--accent-soft); color: var(--warm-strong); border-color: rgba(245, 158, 11, 0.42); }
.card__badge--high .card__badge-dot { background: var(--accent-strong); box-shadow: 0 0 8px rgba(252, 211, 77, 0.7); }
.card__badge--offline { background: var(--offline-soft); color: var(--offline-text); border-color: rgba(251, 146, 60, 0.32); }
.card__badge--offline .card__badge-dot { background: var(--offline); }

.card__meta {
  font-size: 0.74rem;
  color: var(--muted);
  margin-top: -0.1rem;
}

.card__time--muted { font-style: italic; }

.card__segmented {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.25rem;
  padding: 0.22rem;
  border-radius: var(--radius-md);
  background: var(--surface-sunk);
  border: 1px solid var(--stroke);
}

.card__btn {
  padding: 0.38rem 0.4rem;
  border: 0;
  border-radius: calc(var(--radius-md) - 0.22rem);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease;
}

.card__btn:hover:not(:disabled):not(.card__btn--active) {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}

.card__btn--active {
  color: var(--text);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    var(--shadow-sm);
}

.card__btn--low.card__btn--active {
  color: var(--warm);
  background: linear-gradient(180deg, rgba(252, 211, 77, 0.22), rgba(252, 211, 77, 0.06));
}

.card__btn--high.card__btn--active {
  color: var(--warm-strong);
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.28), rgba(245, 158, 11, 0.08));
}

.card__btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
</style>
