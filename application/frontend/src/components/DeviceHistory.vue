<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import {
  OUTPUT_BRIGHTNESS_CHIP,
  type DeviceLog,
  type LogDirection,
  type LogType,
  type OutputId,
} from '@/types/device'

const props = defineProps<{ deviceId: string }>()

const store = useDevicesStore()
const { states } = storeToRefs(store)

const state = computed(() => states.value[props.deviceId])

const logs = ref<DeviceLog[]>([])
const logsCursor = ref<string | null>(null)
const logsLoading = ref(false)

const LOG_LABEL: Record<LogType, string> = {
  toggle: 'สลับสถานะ',
  mode_change: 'เปลี่ยนโหมด',
  timer_set: 'ตั้งเวลาปิด',
  timer_cancel: 'ยกเลิกตัวจับเวลา',
  auto_on: 'อัตโนมัติเปิด',
  auto_off: 'อัตโนมัติปิด',
  timer_expired: 'ตัวจับเวลาหมด',
  cmd_ack: 'อุปกรณ์ตอบรับ',
  cmd_timeout: 'ไม่ได้รับการตอบรับ',
  device_online: 'ออนไลน์',
  device_offline: 'ออฟไลน์',
  hb_sync: 'sync จาก heartbeat',
  paired: 'จับคู่สำเร็จ',
}

const DIRECTION_GLYPH: Record<LogDirection, string> = {
  out: '→ ESP',
  in: '← ESP',
  internal: '• ระบบ',
}
const DIRECTION_TOOLTIP: Record<LogDirection, string> = {
  out: 'ส่งคำสั่งไปยังอุปกรณ์',
  in: 'รับจากอุปกรณ์',
  internal: 'ภายในระบบ (ไม่ผ่าน MQTT)',
}

const isOnEvent = (type: LogType) =>
  type === 'toggle' ||
  type === 'auto_on' ||
  type === 'auto_off' ||
  type === 'timer_expired' ||
  type === 'cmd_ack' ||
  type === 'hb_sync'

const outputLabel = (output: OutputId | null) =>
  output ? OUTPUT_BRIGHTNESS_CHIP[output] : null

const formatThaiDate = (isoDate: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(isoDate))
const formatTime = (isoDate: string) =>
  new Intl.DateTimeFormat('th-TH', { timeStyle: 'medium', hour12: false }).format(
    new Date(isoDate),
  )

const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const TODAY_KEY = dayKey(new Date().toISOString())
const YESTERDAY_KEY = (() => {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return dayKey(y.toISOString())
})()

const dayLabel = (iso: string) => {
  const k = dayKey(iso)
  if (k === TODAY_KEY) return 'วันนี้'
  if (k === YESTERDAY_KEY) return 'เมื่อวาน'
  return formatThaiDate(iso)
}

interface TimelineItem {
  type: 'separator' | 'log'
  key: string
  log?: DeviceLog
  separatorLabel?: string
}

const timeline = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = []
  let lastDay = ''
  for (const log of logs.value) {
    const k = dayKey(log.createdAt)
    if (k !== lastDay) {
      items.push({ type: 'separator', key: `sep-${k}`, separatorLabel: dayLabel(log.createdAt) })
      lastDay = k
    }
    items.push({ type: 'log', key: log._id, log })
  }
  return items
})

const loadLogs = async (reset = false) => {
  if (logsLoading.value) return
  logsLoading.value = true
  try {
    const before = reset ? undefined : logsCursor.value ?? undefined
    const res = await store.fetchLogs(props.deviceId, { limit: 10, before })
    logs.value = reset ? res.items : [...logs.value, ...res.items]
    logsCursor.value = res.nextCursor
  } catch {
    // ignore — empty state will be shown
  } finally {
    logsLoading.value = false
  }
}

onMounted(() => {
  loadLogs(true)
})

const refreshKey = computed(() => {
  const s = state.value
  if (!s) return ''
  return [
    s.isOnline ? '1' : '0',
    s.lastSeenAt ?? '-',
    s.outputs.out1.isOn ? '1' : '0',
    s.outputs.out1.lastUpdatedAt ?? '-',
    s.outputs.out2.isOn ? '1' : '0',
    s.outputs.out2.lastUpdatedAt ?? '-',
  ].join('|')
})

watch(refreshKey, (next, prev) => {
  if (next && next !== prev) loadLogs(true)
})
</script>

<template>
  <div class="history">
    <h2 class="history__title">ประวัติการเปลี่ยนสถานะ</h2>

    <ul v-if="timeline.length > 0" class="timeline">
      <template v-for="item in timeline" :key="item.key">
        <li v-if="item.type === 'separator'" class="timeline__sep">
          <span class="timeline__sep-line" aria-hidden="true" />
          <span class="timeline__sep-label">{{ item.separatorLabel }}</span>
          <span class="timeline__sep-line" aria-hidden="true" />
        </li>
        <li v-else-if="item.log" class="timeline__item">
          <span
            class="timeline__node"
            :class="[`timeline__node--${item.log.direction}`]"
            aria-hidden="true"
          />
          <div class="timeline__content">
            <div class="timeline__meta">
              <span
                class="timeline__direction"
                :class="[`timeline__direction--${item.log.direction}`]"
                :title="DIRECTION_TOOLTIP[item.log.direction]"
              >
                {{ DIRECTION_GLYPH[item.log.direction] }}
              </span>
              <span v-if="outputLabel(item.log.output)" class="timeline__output">
                {{ outputLabel(item.log.output) }}
              </span>
              <span class="timeline__time">{{ formatTime(item.log.createdAt) }}</span>
            </div>
            <div
              class="timeline__event"
              :class="{
                'timeline__event--on': isOnEvent(item.log.type) && item.log.isOn === true,
                'timeline__event--off': isOnEvent(item.log.type) && item.log.isOn === false,
              }"
            >
              {{ LOG_LABEL[item.log.type] }}<span
                v-if="item.log.isOn !== null"
                class="timeline__event-suffix"
              > · {{ item.log.isOn ? 'เปิด' : 'ปิด' }}</span>
            </div>
          </div>
        </li>
      </template>
    </ul>
    <p v-else-if="!logsLoading" class="history__empty">
      ยังไม่มีประวัติ — ลองสลับสถานะเพื่อดูรายการที่นี่
    </p>
    <p v-else class="history__empty">กำลังโหลด…</p>

    <button
      type="button"
      class="history__more"
      :disabled="!logsCursor || logsLoading"
      @click="loadLogs(false)"
    >
      {{ logsLoading ? 'กำลังโหลด…' : 'โหลดเพิ่ม' }}
    </button>
  </div>
</template>

<style scoped>
.history {
  padding: 0.95rem 1rem 0.85rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.history__title {
  margin: 0 0 0.75rem;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.timeline {
  position: relative;
  list-style: none;
  margin: 0 -0.25rem;
  padding: 0.15rem 0.25rem 0.15rem 1.35rem;
  border-left: 2px solid var(--stroke);
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: clamp(12rem, 34vh, 22rem);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(245, 158, 11, 0.32) transparent;
}

.timeline::-webkit-scrollbar {
  width: 6px;
  background: transparent;
}

.timeline::-webkit-scrollbar-thumb {
  background: rgba(245, 158, 11, 0.32);
  border-radius: 999px;
}

.timeline::-webkit-scrollbar-thumb:hover {
  background: rgba(245, 158, 11, 0.5);
}

.timeline__item {
  position: relative;
  padding: 0.32rem 0;
}

.timeline__node {
  position: absolute;
  left: -1.78rem;
  top: 0.62rem;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: #4a4538;
  box-shadow: 0 0 0 3px rgba(20, 22, 31, 0.95);
}

.timeline__node--out {
  background: var(--accent-strong);
  box-shadow:
    0 0 0 3px rgba(20, 22, 31, 0.95),
    0 0 0 4px rgba(245, 158, 11, 0.28),
    0 0 10px rgba(245, 158, 11, 0.5);
}

.timeline__node--in {
  background: var(--on);
  box-shadow:
    0 0 0 3px rgba(20, 22, 31, 0.95),
    0 0 0 4px rgba(163, 230, 53, 0.28),
    0 0 10px rgba(163, 230, 53, 0.45);
}

.timeline__node--internal {
  background: #4a4538;
}

.timeline__content {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.timeline__meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.7rem;
  flex-wrap: wrap;
}

.timeline__direction {
  display: inline-flex;
  align-items: center;
  padding: 0.06rem 0.42rem;
  border-radius: 999px;
  background: var(--surface-sunk);
  border: 1px solid var(--stroke);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-2);
  cursor: help;
}

.timeline__direction--out {
  color: var(--warm-strong);
  background: var(--accent-soft);
  border-color: rgba(245, 158, 11, 0.32);
}

.timeline__direction--in {
  color: var(--on-text);
  background: var(--on-soft);
  border-color: rgba(163, 230, 53, 0.32);
}

.timeline__output {
  display: inline-flex;
  padding: 0.06rem 0.42rem;
  border-radius: 999px;
  background: var(--warm-soft);
  border: 1px solid rgba(252, 211, 77, 0.28);
  color: var(--warm);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.timeline__time {
  margin-left: auto;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.68rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.timeline__event {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
}

.timeline__event--on { color: var(--on-text); }
.timeline__event--off { color: var(--offline-text); }

.timeline__event-suffix {
  font-weight: 500;
  opacity: 0.9;
}

.timeline__sep {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.5rem 0 0.15rem;
  margin-left: -1.35rem;
  padding-left: 0.4rem;
}

.timeline__sep:first-child { margin-top: 0; }

.timeline__sep-line {
  flex: 1;
  height: 1px;
  background: var(--stroke);
}

.timeline__sep-label {
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.history__empty {
  margin: 0;
  padding: 0.4rem 0 0.2rem;
  color: var(--text-2);
  font-size: 0.9rem;
  line-height: 1.5;
}

.history__more {
  margin-top: 0.7rem;
  width: 100%;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--stroke-strong);
  background: var(--surface-sunk);
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.history__more:hover:not(:disabled) {
  background: var(--accent-soft);
  border-color: rgba(245, 158, 11, 0.32);
  color: var(--warm-strong);
}

.history__more:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
