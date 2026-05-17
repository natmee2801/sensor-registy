<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import {
  BRIGHTNESS_LABELS,
  BRIGHTNESS_LEVELS,
  type BrightnessLevel,
} from '@/types/device'
import BulbVisual from '@/components/BulbVisual.vue'

const props = defineProps<{ deviceId: string }>()
const emit = defineEmits<{ (e: 'removed'): void }>()

const store = useDevicesStore()
const { states } = storeToRefs(store)

const state = computed(() => states.value[props.deviceId])
const isOnline = computed(() => state.value?.isOnline ?? false)
const brightness = computed<BrightnessLevel>(() => store.getBrightness(props.deviceId))
const deviceMode = computed(() => store.getDeviceMode(props.deviceId))
const autoCfg = computed(() => store.getDeviceAutoTimes(props.deviceId))
const timerEndsAt = computed(() => store.getDeviceOffTimer(props.deviceId))
const anyOn = computed(() => brightness.value !== 'off')

const draftLevel = ref<'low' | 'high'>(autoCfg.value?.level ?? 'high')
const draftOn = ref<string>(autoCfg.value?.autoOnTime ?? '18:00')
const draftOff = ref<string>(autoCfg.value?.autoOffTime ?? '23:00')

watch(autoCfg, (cfg) => {
  if (cfg) {
    draftLevel.value = cfg.level
    draftOn.value = cfg.autoOnTime
    draftOff.value = cfg.autoOffTime
  }
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
  () => timerEndsAt.value !== null,
  (active) => {
    if (active && nowInterval === null) {
      now.value = Date.now()
      nowInterval = setInterval(() => {
        now.value = Date.now()
      }, 1000)
    } else if (!active) {
      stopInterval()
    }
  },
  { immediate: true },
)

onUnmounted(stopInterval)

const remainingMs = computed(() => {
  const end = timerEndsAt.value
  return end === null ? 0 : Math.max(0, end.getTime() - now.value)
})
const timerActive = computed(() => timerEndsAt.value !== null && remainingMs.value > 0)

const formatRemaining = (ms: number) => {
  const totalSec = Math.ceil(ms / 1000)
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
}

const sameTimeWarning = computed(
  () => deviceMode.value === 'auto' && draftOn.value === draftOff.value,
)

const handleBrightness = (level: BrightnessLevel) => {
  store.setBrightness(props.deviceId, level).catch(() => {})
}

const handleModeChange = (mode: 'manual' | 'auto') => {
  if (mode === 'manual') {
    store.setManualMode(props.deviceId).catch(() => {})
  } else {
    store
      .setAutoBrightness(props.deviceId, draftLevel.value, draftOn.value, draftOff.value)
      .catch(() => {})
  }
}

const handleScheduleChange = () => {
  store
    .setAutoBrightness(props.deviceId, draftLevel.value, draftOn.value, draftOff.value)
    .catch(() => {})
}

const handleStartTimer = (minutes: number) => {
  store.startBrightnessTimer(props.deviceId, minutes * 60 * 1000).catch(() => {})
}
const handleCancelTimer = () => {
  store.cancelBrightnessTimer(props.deviceId).catch(() => {})
}

const handleRemove = async () => {
  if (!window.confirm(`ลบอุปกรณ์ ${props.deviceId}?`)) return
  try {
    await store.removeDevice(props.deviceId)
    emit('removed')
  } catch {
    // ignore
  }
}
</script>

<template>
  <div v-if="state" class="device-control">
    <section class="control-section">
      <div class="brightness-head">
        <p class="section-label">ระดับความสว่าง</p>
        <BulbVisual :level="isOnline ? brightness : 'off'" size="md" />
      </div>
      <div class="segmented" role="radiogroup" aria-label="ระดับความสว่าง">
        <button
          v-for="level in BRIGHTNESS_LEVELS"
          :key="level"
          type="button"
          class="segmented__btn"
          :class="{
            'segmented__btn--active': brightness === level,
            [`segmented__btn--${level}`]: brightness === level,
          }"
          :disabled="!isOnline || deviceMode === 'auto'"
          @click="handleBrightness(level)"
        >
          {{ BRIGHTNESS_LABELS[level] }}
        </button>
      </div>
      <p v-if="!isOnline" class="section-hint">อุปกรณ์ออฟไลน์ — สั่งงานไม่ได้</p>
      <p v-else-if="deviceMode === 'auto'" class="section-hint">
        โหมดอัตโนมัติกำลังควบคุมอยู่
      </p>
    </section>

    <section class="control-section">
      <p class="section-label">โหมด</p>
      <div class="segmented" role="radiogroup" aria-label="โหมด">
        <button
          type="button"
          class="segmented__btn"
          :class="{ 'segmented__btn--active': deviceMode === 'manual' }"
          @click="handleModeChange('manual')"
        >
          ควบคุมเอง
        </button>
        <button
          type="button"
          class="segmented__btn"
          :class="{ 'segmented__btn--active': deviceMode === 'auto' }"
          @click="handleModeChange('auto')"
        >
          อัตโนมัติ
        </button>
      </div>
    </section>

    <section v-if="deviceMode === 'auto'" class="control-section">
      <p class="section-label">ตั้งเวลา</p>
      <div class="schedule-row">
        <input
          v-model="draftOn"
          class="time-input"
          type="time"
          aria-label="เวลาเปิด"
          @change="handleScheduleChange"
        />
        <span class="schedule-dash">—</span>
        <input
          v-model="draftOff"
          class="time-input"
          type="time"
          aria-label="เวลาปิด"
          @change="handleScheduleChange"
        />
      </div>
      <div class="segmented segmented--compact" role="radiogroup" aria-label="ระดับเมื่อเปิด">
        <button
          type="button"
          class="segmented__btn"
          :class="{
            'segmented__btn--active': draftLevel === 'low',
            'segmented__btn--low': draftLevel === 'low',
          }"
          @click="(draftLevel = 'low'), handleScheduleChange()"
        >
          หรี่
        </button>
        <button
          type="button"
          class="segmented__btn"
          :class="{
            'segmented__btn--active': draftLevel === 'high',
            'segmented__btn--high': draftLevel === 'high',
          }"
          @click="(draftLevel = 'high'), handleScheduleChange()"
        >
          สว่าง
        </button>
      </div>
      <p v-if="sameTimeWarning" class="section-hint section-hint--warn">
        เวลาเปิดและเวลาปิดเหมือนกัน — ระบบจะไม่ทำงาน
      </p>
    </section>

    <section v-if="anyOn && deviceMode === 'manual'" class="control-section">
      <p class="section-label">จับเวลาปิด</p>
      <div v-if="!timerActive" class="timer-presets">
        <button
          v-for="preset in timerPresets"
          :key="preset.label"
          type="button"
          class="chip"
          @click="handleStartTimer(preset.minutes)"
        >
          {{ preset.label }}
        </button>
      </div>
      <div v-else class="timer-active">
        <span class="timer-value">{{ formatRemaining(remainingMs) }}</span>
        <span class="timer-label">ก่อนปิด</span>
        <button type="button" class="chip chip--cancel" @click="handleCancelTimer">
          ยกเลิก
        </button>
      </div>
    </section>

    <button type="button" class="remove-link" @click="handleRemove">ลบอุปกรณ์</button>
  </div>
</template>

<style scoped>
.device-control {
  padding: 1.2rem 1.25rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 18px 50px rgba(0, 0, 0, 0.32);
  display: flex;
  flex-direction: column;
}

.control-section + .control-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.section-label {
  margin: 0 0 0.55rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.92);
}

.brightness-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}

.brightness-head .section-label {
  margin: 0;
}

.section-hint {
  margin: 0.5rem 0 0;
  font-size: 0.76rem;
  color: rgba(148, 163, 184, 0.85);
}

.section-hint--warn {
  color: var(--amber);
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.3rem;
  padding: 0.25rem;
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.segmented[aria-label='โหมด'] {
  grid-template-columns: 1fr 1fr;
}

.segmented--compact {
  grid-template-columns: 1fr 1fr;
  margin-top: 0.55rem;
}

.segmented__btn {
  padding: 0.65rem 0.5rem;
  border: 0;
  border-radius: calc(var(--radius-md) - 0.2rem);
  background: transparent;
  color: rgba(226, 232, 240, 0.72);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.segmented__btn:hover:not(:disabled):not(.segmented__btn--active) {
  color: var(--text);
}

.segmented__btn--active {
  color: var(--text);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 8px 22px rgba(0, 0, 0, 0.3);
}

.segmented__btn--low.segmented__btn--active {
  color: #fde68a;
  background: linear-gradient(180deg, rgba(250, 204, 21, 0.22), rgba(250, 204, 21, 0.08));
  box-shadow:
    0 1px 0 rgba(254, 240, 138, 0.2) inset,
    0 8px 22px rgba(250, 204, 21, 0.18);
}

.segmented__btn--high.segmented__btn--active {
  color: #bbf7d0;
  background: linear-gradient(180deg, rgba(74, 222, 128, 0.25), rgba(74, 222, 128, 0.08));
  box-shadow:
    0 1px 0 rgba(187, 247, 208, 0.22) inset,
    0 8px 22px rgba(74, 222, 128, 0.2);
}

.segmented__btn--off.segmented__btn--active {
  color: #cbd5e1;
}

.segmented__btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.segmented__btn:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.55);
  outline-offset: 2px;
}

.schedule-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.time-input {
  flex: 1;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-md);
  padding: 0.55rem 0.65rem;
  background: rgba(6, 9, 18, 0.65);
  color: var(--text);
  font-family: inherit;
  font-size: 0.92rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.time-input:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.45);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
}

.schedule-dash {
  color: rgba(148, 163, 184, 0.7);
  font-weight: 600;
}

.timer-presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(4.8rem, 1fr));
  gap: 0.4rem;
}

.chip {
  padding: 0.55rem 0.6rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.55);
  color: rgba(226, 232, 240, 0.92);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.chip:hover {
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(56, 189, 248, 0.4);
}

.chip--cancel {
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.08);
  color: #fecaca;
}

.chip--cancel:hover {
  background: rgba(248, 113, 113, 0.18);
  border-color: rgba(248, 113, 113, 0.55);
}

.timer-active {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.timer-value {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #bae6fd;
  font-variant-numeric: tabular-nums;
}

.timer-label {
  flex: 1;
  font-size: 0.78rem;
  color: rgba(148, 163, 184, 0.95);
}

.remove-link {
  align-self: flex-end;
  margin-top: 1rem;
  padding: 0.3rem 0.6rem;
  border: 0;
  background: transparent;
  color: rgba(248, 113, 113, 0.75);
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
}

.remove-link:hover {
  color: #fecaca;
  text-decoration: underline;
}
</style>
