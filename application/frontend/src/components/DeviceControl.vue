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
  <div v-if="state" class="control">
    <section class="control__section">
      <div class="control__row">
        <p class="control__label">ระดับความสว่าง</p>
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
      <p v-if="!isOnline" class="control__hint">อุปกรณ์ออฟไลน์ — สั่งงานไม่ได้</p>
      <p v-else-if="deviceMode === 'auto'" class="control__hint">
        โหมดอัตโนมัติกำลังควบคุมอยู่
      </p>
    </section>

    <section class="control__section">
      <p class="control__label">โหมด</p>
      <div class="segmented segmented--two" role="radiogroup" aria-label="โหมด">
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

    <section v-if="deviceMode === 'auto'" class="control__section">
      <p class="control__label">ตั้งเวลา</p>
      <div class="schedule">
        <input
          v-model="draftOn"
          class="schedule__time"
          type="time"
          aria-label="เวลาเปิด"
          @change="handleScheduleChange"
        />
        <span class="schedule__dash">—</span>
        <input
          v-model="draftOff"
          class="schedule__time"
          type="time"
          aria-label="เวลาปิด"
          @change="handleScheduleChange"
        />
      </div>
      <div class="segmented segmented--two segmented--gap" role="radiogroup" aria-label="ระดับเมื่อเปิด">
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
      <p v-if="sameTimeWarning" class="control__hint control__hint--warn">
        เวลาเปิดและเวลาปิดเหมือนกัน — ระบบจะไม่ทำงาน
      </p>
    </section>

    <section v-if="anyOn && deviceMode === 'manual'" class="control__section">
      <p class="control__label">จับเวลาปิด</p>
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
        <div class="timer-active__main">
          <span class="timer-active__value">{{ formatRemaining(remainingMs) }}</span>
          <span class="timer-active__label">ก่อนปิด</span>
        </div>
        <button type="button" class="chip chip--cancel" @click="handleCancelTimer">
          ยกเลิก
        </button>
      </div>
    </section>

    <button type="button" class="control__remove" @click="handleRemove">
      <span aria-hidden="true">✕</span> ลบอุปกรณ์นี้
    </button>
  </div>
</template>

<style scoped>
.control {
  padding: 0.95rem 1rem 0.75rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
}

.control__section + .control__section {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--stroke);
}

.control__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.control__label {
  margin: 0 0 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.control__row .control__label { margin: 0; }

.control__hint {
  margin: 0.45rem 0 0;
  font-size: 0.76rem;
  color: var(--text-2);
}

.control__hint--warn {
  color: var(--accent-strong);
  font-weight: 500;
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.22rem;
  padding: 0.22rem;
  border-radius: var(--radius-md);
  background: var(--surface-sunk);
  border: 1px solid var(--stroke);
}

.segmented--two {
  grid-template-columns: 1fr 1fr;
}

.segmented--gap { margin-top: 0.4rem; }

.segmented__btn {
  padding: 0.48rem 0.55rem;
  border: 0;
  border-radius: calc(var(--radius-md) - 0.22rem);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.83rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.segmented__btn:hover:not(:disabled):not(.segmented__btn--active) {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}

.segmented__btn--active {
  color: var(--text);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 6px 16px rgba(0, 0, 0, 0.32);
}

.segmented__btn--low.segmented__btn--active {
  color: var(--warm);
  background: linear-gradient(180deg, rgba(252, 211, 77, 0.24), rgba(252, 211, 77, 0.06));
  box-shadow:
    inset 0 1px 0 rgba(253, 224, 71, 0.2),
    0 6px 18px rgba(252, 211, 77, 0.14);
}

.segmented__btn--high.segmented__btn--active {
  color: var(--warm-strong);
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.3), rgba(245, 158, 11, 0.08));
  box-shadow:
    inset 0 1px 0 rgba(253, 230, 138, 0.22),
    0 6px 18px rgba(245, 158, 11, 0.22);
}

.segmented__btn--off.segmented__btn--active { color: var(--text-2); }

.segmented__btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.segmented__btn:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}

.schedule {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.schedule__time {
  flex: 1;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
  background: var(--surface-sunk);
  color: var(--text);
  font-family: inherit;
  font-size: 0.9rem;
  color-scheme: dark;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.schedule__time:focus {
  outline: none;
  border-color: rgba(245, 158, 11, 0.5);
  box-shadow: 0 0 0 4px var(--accent-tint);
}

.schedule__dash {
  color: var(--muted);
  font-weight: 600;
}

.timer-presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.2rem, 1fr));
  gap: 0.45rem;
}

.chip {
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--stroke-strong);
  background: var(--surface-sunk);
  color: var(--text);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.chip:hover {
  background: var(--accent-soft);
  border-color: rgba(245, 158, 11, 0.4);
  color: var(--warm-strong);
}

.chip--cancel {
  border-color: rgba(248, 113, 113, 0.32);
  background: var(--danger-soft);
  color: var(--danger);
}

.chip--cancel:hover {
  background: rgba(248, 113, 113, 0.2);
  border-color: rgba(248, 113, 113, 0.5);
  color: #fecaca;
}

.timer-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.16) 0%, rgba(252, 211, 77, 0.08) 100%);
  border: 1px solid rgba(245, 158, 11, 0.32);
  box-shadow: inset 0 1px 0 rgba(253, 230, 138, 0.18);
}

.timer-active__main {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
}

.timer-active__value {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--warm-strong);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 12px rgba(252, 211, 77, 0.3);
}

.timer-active__label {
  font-size: 0.75rem;
  color: var(--warm);
  font-weight: 600;
}

.control__remove {
  align-self: center;
  margin-top: 0.75rem;
  padding: 0.35rem 0.85rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-family: inherit;
  font-size: 0.76rem;
  font-weight: 500;
  cursor: pointer;
  border-radius: 999px;
  transition: color 0.18s ease, background 0.18s ease;
}

.control__remove:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
</style>
