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
    class="device-card"
    :class="[
      isOnline ? `device-card--${brightness}` : 'device-card--offline',
    ]"
  >
    <div class="device-card__head">
      <div class="device-card__identity">
        <span
          class="device-card__dot"
          :class="{ 'device-card__dot--online': isOnline }"
          :title="isOnline ? 'online' : 'offline'"
        />
        <span class="device-card__id">{{ device.id }}</span>
      </div>
      <span
        class="device-card__badge"
        :class="[
          isOnline ? `device-card__badge--${brightness}` : 'device-card__badge--offline',
        ]"
      >
        <BulbVisual :level="isOnline ? brightness : 'off'" size="sm" />
        {{ badgeLabel }}
      </span>
    </div>

    <div class="device-card__meta">
      <span class="device-card__location">{{ device.location }}</span>
      <span v-if="lastUpdate" class="device-card__time">
        {{ formatThaiDateTime(lastUpdate) }}
      </span>
    </div>

    <div class="device-card__segmented">
      <button
        v-for="level in BRIGHTNESS_LEVELS"
        :key="level"
        type="button"
        class="device-card__btn"
        :class="{
          'device-card__btn--active': brightness === level,
          [`device-card__btn--${level}`]: brightness === level,
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
.device-card {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1rem 1.05rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  text-decoration: none;
  color: var(--text);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 14px 38px rgba(0, 0, 0, 0.3);
  transition:
    border-color 0.25s ease,
    transform 0.2s ease,
    box-shadow 0.25s ease;
}

.device-card:hover {
  transform: translateY(-1px);
  border-color: rgba(56, 189, 248, 0.35);
}

.device-card--low {
  border-color: rgba(250, 204, 21, 0.32);
}

.device-card--high {
  border-color: rgba(74, 222, 128, 0.4);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 0 24px rgba(74, 222, 128, 0.12),
    0 14px 38px rgba(0, 0, 0, 0.3);
}

.device-card--offline {
  opacity: 0.78;
}

.device-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
}

.device-card__identity {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.device-card__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.5);
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.12);
  flex-shrink: 0;
}

.device-card__dot--online {
  background: #4ade80;
  box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.2);
}

.device-card__id {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.95rem;
  font-weight: 600;
  word-break: break-all;
}

.device-card__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem 0.2rem 0.4rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.15);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.device-card__badge--low {
  background: rgba(250, 204, 21, 0.18);
  color: #fde68a;
  border-color: rgba(250, 204, 21, 0.4);
}

.device-card__badge--high {
  background: rgba(74, 222, 128, 0.18);
  color: #bbf7d0;
  border-color: rgba(74, 222, 128, 0.4);
}

.device-card__badge--offline {
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.4);
}

.device-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.78rem;
  color: rgba(148, 163, 184, 0.95);
}

.device-card__location {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-card__time {
  flex-shrink: 0;
}

.device-card__segmented {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.25rem;
  padding: 0.22rem;
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.device-card__btn {
  padding: 0.45rem 0.4rem;
  border: 0;
  border-radius: calc(var(--radius-md) - 0.2rem);
  background: transparent;
  color: rgba(226, 232, 240, 0.72);
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease;
}

.device-card__btn:hover:not(:disabled):not(.device-card__btn--active) {
  color: var(--text);
}

.device-card__btn--active {
  color: var(--text);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 6px 16px rgba(0, 0, 0, 0.25);
}

.device-card__btn--low.device-card__btn--active {
  color: #fde68a;
  background: linear-gradient(180deg, rgba(250, 204, 21, 0.22), rgba(250, 204, 21, 0.08));
}

.device-card__btn--high.device-card__btn--active {
  color: #bbf7d0;
  background: linear-gradient(180deg, rgba(74, 222, 128, 0.25), rgba(74, 222, 128, 0.08));
}

.device-card__btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
