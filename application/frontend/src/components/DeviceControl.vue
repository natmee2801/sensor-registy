<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import BulbVisual from '@/components/BulbVisual.vue'

const props = defineProps<{ deviceId: string }>()
const emit = defineEmits<{ (e: 'removed'): void }>()

const store = useDevicesStore()
const { states } = storeToRefs(store)

const state = computed(() => states.value[props.deviceId])
const isOn = computed(() => state.value?.isOn ?? false)
const controlMode = computed(() => state.value?.controlMode ?? 'manual')
const autoOnTime = computed({
  get: () => state.value?.autoOnTime ?? '18:00',
  set: (value) => {
    if (!state.value) return
    store.setAutoTimes(props.deviceId, value, state.value.autoOffTime).catch(() => {})
  },
})
const autoOffTime = computed({
  get: () => state.value?.autoOffTime ?? '23:00',
  set: (value) => {
    if (!state.value) return
    store.setAutoTimes(props.deviceId, state.value.autoOnTime, value).catch(() => {})
  },
})

const timerPresets = [
  { label: '5 นาที', minutes: 5 },
  { label: '15 นาที', minutes: 15 },
  { label: '30 นาที', minutes: 30 },
  { label: '1 ชม.', minutes: 60 },
]

const now = ref(Date.now())
let nowInterval: ReturnType<typeof setInterval> | null = null

const stopInterval = () => {
  if (nowInterval !== null) {
    clearInterval(nowInterval)
    nowInterval = null
  }
}

watch(
  () => state.value?.offTimerEndsAt ?? null,
  (endsAt) => {
    if (endsAt !== null && nowInterval === null) {
      now.value = Date.now()
      nowInterval = setInterval(() => {
        now.value = Date.now()
      }, 1000)
    } else if (endsAt === null) {
      stopInterval()
    }
  },
  { immediate: true },
)

onUnmounted(stopInterval)

const timerEndMs = computed(() =>
  state.value?.offTimerEndsAt ? new Date(state.value.offTimerEndsAt).getTime() : null,
)
const remainingMs = computed(() =>
  timerEndMs.value === null ? 0 : Math.max(0, timerEndMs.value - now.value),
)
const timerActive = computed(() => timerEndMs.value !== null && remainingMs.value > 0)

const formatRemaining = (ms: number) => {
  const totalSec = Math.ceil(ms / 1000)
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
}

const handleStartTimer = (minutes: number) => {
  store.startOffTimer(props.deviceId, minutes * 60 * 1000).catch(() => {})
}

const handleCancelTimer = () => {
  store.cancelOffTimer(props.deviceId).catch(() => {})
}

const sameTimeWarning = computed(
  () => controlMode.value === 'auto' && autoOnTime.value === autoOffTime.value,
)

const handleModeChange = (event: Event) => {
  const value = (event.target as HTMLInputElement).value
  if (value === 'manual' || value === 'auto') {
    store.setMode(props.deviceId, value).catch(() => {})
  }
}

const formatThaiDateTime = (isoDate: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'medium' }).format(
    new Date(isoDate),
  )

const handleRemove = async () => {
  if (!window.confirm(`ลบอุปกรณ์ ${props.deviceId}?`)) return
  try {
    await store.removeDevice(props.deviceId)
    emit('removed')
  } catch {
    // store keeps device if delete fails; surface via lastError if needed
  }
}

</script>

<template>
  <div v-if="state" class="device-control">
    <div class="light-status-card">
      <div class="card-head">
        <h2 class="card-title">สถานะล่าสุด</h2>
        <span class="card-badge" :class="{ 'card-badge--on': isOn }">
          {{ isOn ? 'กำลังทำงาน' : 'พักอยู่' }}
        </span>
      </div>
      <div class="status-showcase">
        <div class="status-stage" :class="{ 'status-stage--on': isOn }">
          <BulbVisual :on="isOn" size="md" />
        </div>
        <div class="status-body">
          <p class="status-label">สถานะปัจจุบัน</p>
          <p class="status-headline" :class="{ 'status-headline--on': isOn }">
            {{ isOn ? 'เปิดอยู่' : 'ปิดอยู่' }}
          </p>
          <p v-if="state.lastUpdatedAt" class="updated-time">
            อัปเดตล่าสุด · {{ formatThaiDateTime(state.lastUpdatedAt) }}
          </p>
        </div>
      </div>
    </div>

    <div class="light-control-card">
      <h2 class="card-title card-title--solo">การควบคุม</h2>

      <div class="segmented" role="radiogroup" aria-label="โหมดการทำงาน">
        <label
          class="segmented__option"
          :class="{ 'segmented__option--active': controlMode === 'manual' }"
        >
          <input
            class="segmented__input"
            type="radio"
            :checked="controlMode === 'manual'"
            value="manual"
            @change="handleModeChange"
          />
          <span class="segmented__label">ควบคุมเอง</span>
        </label>
        <label
          class="segmented__option"
          :class="{ 'segmented__option--active': controlMode === 'auto' }"
        >
          <input
            class="segmented__input"
            type="radio"
            :checked="controlMode === 'auto'"
            value="auto"
            @change="handleModeChange"
          />
          <span class="segmented__label">ตั้งเวลาอัตโนมัติ</span>
        </label>
      </div>

      <div class="schedule-block" :class="{ 'schedule-block--disabled': controlMode !== 'auto' }">
        <p class="schedule-hint">ใช้เมื่อเลือกโหมดตั้งเวลา — ระบบจะตรวจทุก ๆ 30 วินาที</p>
        <div class="schedule-grid">
          <label class="time-field">
            <span class="time-field__label">เวลาเปิด</span>
            <input
              v-model="autoOnTime"
              class="time-field__input"
              type="time"
              :disabled="controlMode !== 'auto'"
            />
          </label>
          <label class="time-field">
            <span class="time-field__label">เวลาปิด</span>
            <input
              v-model="autoOffTime"
              class="time-field__input"
              type="time"
              :disabled="controlMode !== 'auto'"
            />
          </label>
        </div>
        <p v-if="sameTimeWarning" class="schedule-warning">
          เวลาเปิดและเวลาปิดเหมือนกัน — ระบบจะไม่เปิดไฟอัตโนมัติ
        </p>
      </div>

      <button
        type="button"
        class="toggle-button"
        :class="{ 'toggle-button--off': !isOn && controlMode !== 'auto' }"
        :disabled="controlMode === 'auto'"
        @click="store.toggleDevice(deviceId)"
      >
        <span class="toggle-button__shine" aria-hidden="true" />
        <span class="toggle-button__text">
          {{
            controlMode === 'auto'
              ? 'โหมดอัตโนมัติกำลังควบคุมอยู่'
              : isOn
                ? 'ปิดหลอดไฟ'
                : 'เปิดหลอดไฟ'
          }}
        </span>
      </button>
    </div>

    <div v-if="isOn && controlMode === 'manual'" class="light-timer-card">
      <div class="card-head">
        <h2 class="card-title">ตัวจับเวลาปิด</h2>
        <span v-if="timerActive" class="card-badge card-badge--timer">
          {{ formatRemaining(remainingMs) }}
        </span>
      </div>

      <div v-if="!timerActive" class="timer-presets">
        <button
          v-for="preset in timerPresets"
          :key="preset.label"
          type="button"
          class="timer-preset"
          @click="handleStartTimer(preset.minutes)"
        >
          {{ preset.label }}
        </button>
      </div>

      <div v-else class="timer-active">
        <div class="timer-display">
          <span class="timer-display__value">{{ formatRemaining(remainingMs) }}</span>
          <span class="timer-display__label">ก่อนปิดอัตโนมัติ</span>
        </div>
        <button type="button" class="timer-cancel" @click="handleCancelTimer">
          ยกเลิกตัวจับเวลา
        </button>
      </div>
    </div>

    <button type="button" class="remove-button" @click="handleRemove">
      ลบอุปกรณ์นี้
    </button>
  </div>
</template>

<style scoped>
.device-control {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.light-status-card,
.light-control-card,
.light-timer-card {
  padding: 1.15rem 1.2rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 24px 60px rgba(0, 0, 0, 0.35);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.card-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(203, 213, 225, 0.92);
}

.card-title--solo {
  margin-bottom: 1rem;
}

.card-badge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.28rem 0.65rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.15);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.card-badge--on {
  background: rgba(74, 222, 128, 0.15);
  color: #bbf7d0;
  border-color: rgba(74, 222, 128, 0.35);
}

.status-showcase {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status-stage {
  position: relative;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 4.6rem;
  height: 5.6rem;
  border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 50% 32%, rgba(148, 163, 184, 0.18), rgba(2, 6, 23, 0.55) 70%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.85), rgba(2, 6, 23, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  transition: background 0.45s ease;
}

.status-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 14px 14px;
  mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
  opacity: 0.32;
  pointer-events: none;
}

.status-stage--on {
  background:
    radial-gradient(circle at 50% 34%, rgba(250, 204, 21, 0.22), rgba(2, 6, 23, 0.55) 65%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.85), rgba(2, 6, 23, 0.95));
}

.status-body {
  min-width: 0;
}

.status-label {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
}

.status-headline {
  margin: 0.2rem 0 0;
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #e2e8f0;
}

.status-headline--on {
  color: #bbf7d0;
  text-shadow: 0 0 28px rgba(74, 222, 128, 0.35);
}

.updated-time {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: rgba(148, 163, 184, 0.95);
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  padding: 0.3rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 1rem;
}

.segmented__option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 0.5rem;
  border-radius: 999px;
  cursor: pointer;
  color: rgba(226, 232, 240, 0.75);
  font-size: 0.82rem;
  font-weight: 600;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.segmented__option--active {
  color: var(--text);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 10px 28px rgba(0, 0, 0, 0.35);
}

.segmented__input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.segmented__option:focus-within {
  outline: 2px solid rgba(56, 189, 248, 0.55);
  outline-offset: 2px;
}

.schedule-block {
  margin-bottom: 0.25rem;
  transition: opacity 0.25s ease;
}

.schedule-block--disabled {
  opacity: 0.48;
  pointer-events: none;
}

.schedule-hint {
  margin: 0 0 0.65rem;
  font-size: 0.76rem;
  line-height: 1.45;
  color: rgba(148, 163, 184, 0.9);
}

.schedule-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.schedule-warning {
  margin: 0.65rem 0 0;
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--amber);
}

.time-field {
  display: grid;
  gap: 0.4rem;
}

.time-field__label {
  font-size: 0.76rem;
  font-weight: 500;
  color: rgba(203, 213, 225, 0.95);
}

.time-field__input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-md);
  padding: 0.55rem 0.65rem;
  background: rgba(6, 9, 18, 0.65);
  color: var(--text);
  font-family: inherit;
  font-size: 0.9rem;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.time-field__input:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.45);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
}

.time-field__input:disabled {
  opacity: 0.55;
}

.toggle-button {
  position: relative;
  margin-top: 1rem;
  width: 100%;
  overflow: hidden;
  padding: 0.85rem 1rem;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  color: #042f1a;
  background: linear-gradient(100deg, #4ade80 0%, #22c55e 45%, #16a34a 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.35) inset,
    0 18px 40px rgba(34, 197, 94, 0.35);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    filter 0.2s ease;
}

.toggle-button--off {
  color: #f8fafc;
  background: linear-gradient(100deg, rgba(56, 189, 248, 0.95) 0%, rgba(99, 102, 241, 0.95) 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.2) inset,
    0 18px 40px rgba(99, 102, 241, 0.35);
}

.toggle-button__shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.22) 48%, transparent 62%);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}

.toggle-button:hover:not(:disabled) .toggle-button__shine {
  opacity: 1;
}

.toggle-button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.04);
}

.toggle-button:active:not(:disabled) {
  transform: translateY(0);
}

.toggle-button:disabled {
  cursor: not-allowed;
  color: rgba(226, 232, 240, 0.75);
  background: rgba(51, 65, 85, 0.55);
  box-shadow: none;
  filter: none;
}

.toggle-button:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.75);
  outline-offset: 3px;
}

.toggle-button__text {
  position: relative;
}

.remove-button {
  align-self: flex-end;
  padding: 0.5rem 0.95rem;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.08);
  color: #fecaca;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.remove-button:hover {
  background: rgba(248, 113, 113, 0.18);
  border-color: rgba(248, 113, 113, 0.55);
  color: #fee2e2;
}

.remove-button:focus-visible {
  outline: 2px solid rgba(248, 113, 113, 0.65);
  outline-offset: 2px;
}

.card-badge--timer {
  font-variant-numeric: tabular-nums;
  background: rgba(56, 189, 248, 0.18);
  color: #bae6fd;
  border-color: rgba(56, 189, 248, 0.4);
}

.timer-presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.2rem, 1fr));
  gap: 0.5rem;
}

.timer-preset {
  padding: 0.65rem 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.55);
  color: rgba(226, 232, 240, 0.92);
  font-family: inherit;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.timer-preset:hover {
  background: rgba(56, 189, 248, 0.14);
  border-color: rgba(56, 189, 248, 0.45);
  transform: translateY(-1px);
}

.timer-preset:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.65);
  outline-offset: 2px;
}

.timer-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.timer-display {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.timer-display__value {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #bae6fd;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 28px rgba(56, 189, 248, 0.35);
}

.timer-display__label {
  font-size: 0.78rem;
  color: rgba(148, 163, 184, 0.95);
}

.timer-cancel {
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.08);
  color: #fecaca;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.timer-cancel:hover {
  background: rgba(248, 113, 113, 0.18);
  border-color: rgba(248, 113, 113, 0.55);
}

@media (prefers-reduced-motion: reduce) {
  .toggle-button {
    transition: none;
  }
}
</style>
