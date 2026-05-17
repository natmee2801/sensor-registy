<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import type { Device } from '@/types/device'
import BulbVisual from '@/components/BulbVisual.vue'

const props = defineProps<{ device: Device }>()

const store = useDevicesStore()
const { states } = storeToRefs(store)

const state = computed(() => states.value[props.device.id])
const isOn = computed(() => state.value?.isOn ?? false)
const isOnline = computed(() => state.value?.isOnline ?? false)
const controlMode = computed(() => state.value?.controlMode ?? 'manual')

const formatThaiDateTime = (isoDate: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(isoDate),
  )

const handleQuickToggle = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
  store.toggleDevice(props.device.id).catch(() => {})
}
</script>

<template>
  <RouterLink
    :to="{ name: 'device-detail', params: { id: device.id } }"
    class="device-card"
    :class="{ 'device-card--on': isOn }"
  >
    <div class="device-card__head">
      <div class="device-card__identity">
        <div class="device-card__id-row">
          <span
            class="device-card__dot"
            :class="{ 'device-card__dot--online': isOnline }"
            :title="isOnline ? 'online' : 'offline'"
          />
          <span class="device-card__id">{{ device.id }}</span>
        </div>
        <span class="device-card__location">{{ device.location }}</span>
      </div>
      <span class="device-card__badge" :class="{ 'device-card__badge--on': isOn }">
        {{ isOn ? 'เปิด' : 'ปิด' }}
      </span>
    </div>

    <div class="device-card__meta">
      <span class="device-card__mode">
        {{ controlMode === 'auto' ? 'อัตโนมัติ' : 'ควบคุมเอง' }}
      </span>
      <span v-if="state?.lastUpdatedAt" class="device-card__time">
        {{ formatThaiDateTime(state.lastUpdatedAt) }}
      </span>
    </div>

    <div class="device-card__stage" :class="{ 'device-card__stage--on': isOn }">
      <BulbVisual :on="isOn" size="md" />
    </div>

    <button
      type="button"
      class="device-card__toggle"
      :class="{ 'device-card__toggle--off': !isOn }"
      :disabled="controlMode === 'auto'"
      @click="handleQuickToggle"
    >
      {{
        controlMode === 'auto'
          ? 'อัตโนมัติ'
          : isOn
            ? 'ปิดหลอดไฟ'
            : 'เปิดหลอดไฟ'
      }}
    </button>
  </RouterLink>
</template>

<style scoped>
.device-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.1rem 1.15rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  text-decoration: none;
  color: var(--text);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 18px 50px rgba(0, 0, 0, 0.32);
  transition:
    border-color 0.25s ease,
    transform 0.2s ease,
    box-shadow 0.25s ease;
}

.device-card:hover {
  transform: translateY(-1px);
  border-color: rgba(56, 189, 248, 0.35);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.08) inset,
    0 22px 60px rgba(0, 0, 0, 0.4);
}

.device-card--on {
  border-color: rgba(74, 222, 128, 0.35);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.08) inset,
    0 0 32px rgba(74, 222, 128, 0.15),
    0 18px 50px rgba(0, 0, 0, 0.32);
}

.device-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.device-card__identity {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.device-card__id-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
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
  color: var(--text);
  word-break: break-all;
}

.device-card__location {
  font-size: 0.82rem;
  color: var(--muted);
}

.device-card__badge {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.15);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.device-card__badge--on {
  background: rgba(74, 222, 128, 0.18);
  color: #bbf7d0;
  border-color: rgba(74, 222, 128, 0.4);
}

.device-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.76rem;
  color: rgba(148, 163, 184, 0.95);
}

.device-card__stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 6rem;
  padding: 0.55rem 0.5rem 0.35rem;
  border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 50% 30%, rgba(148, 163, 184, 0.18), rgba(2, 6, 23, 0.55) 70%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.85), rgba(2, 6, 23, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  transition: background 0.45s ease;
}

.device-card__stage::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 14px 14px;
  mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
  opacity: 0.3;
  pointer-events: none;
}

.device-card__stage--on {
  background:
    radial-gradient(circle at 50% 32%, rgba(250, 204, 21, 0.2), rgba(2, 6, 23, 0.55) 65%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.85), rgba(2, 6, 23, 0.95));
}

.device-card__toggle {
  width: 100%;
  padding: 0.6rem 0.9rem;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: #042f1a;
  background: linear-gradient(100deg, #4ade80 0%, #22c55e 100%);
  box-shadow: 0 8px 24px rgba(34, 197, 94, 0.3);
  transition:
    transform 0.18s ease,
    filter 0.18s ease;
}

.device-card__toggle--off {
  color: #f8fafc;
  background: linear-gradient(100deg, rgba(56, 189, 248, 0.95), rgba(99, 102, 241, 0.95));
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
}

.device-card__toggle:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.device-card__toggle:disabled {
  cursor: not-allowed;
  background: rgba(51, 65, 85, 0.55);
  color: rgba(226, 232, 240, 0.7);
  box-shadow: none;
}

</style>
