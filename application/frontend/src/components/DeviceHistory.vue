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
  internal: '• ภายในระบบ',
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
  <div class="light-history-card">
    <h2 class="card-title">ประวัติการเปลี่ยนสถานะ</h2>

    <ul v-if="timeline.length > 0" class="history-timeline">
      <template v-for="item in timeline" :key="item.key">
        <li v-if="item.type === 'separator'" class="history-separator">
          <span class="history-separator__line" aria-hidden="true" />
          <span class="history-separator__label">{{ item.separatorLabel }}</span>
          <span class="history-separator__line" aria-hidden="true" />
        </li>
        <li v-else-if="item.log" class="history-item">
          <span
            class="history-node"
            :class="[`history-node--${item.log.direction}`]"
            aria-hidden="true"
          />
          <div class="history-content">
            <div class="history-meta">
              <span
                class="history-direction"
                :class="[`history-direction--${item.log.direction}`]"
                :title="DIRECTION_TOOLTIP[item.log.direction]"
              >
                {{ DIRECTION_GLYPH[item.log.direction] }}
              </span>
              <span v-if="outputLabel(item.log.output)" class="history-output-chip">
                {{ outputLabel(item.log.output) }}
              </span>
              <span class="history-time">{{ formatTime(item.log.createdAt) }}</span>
            </div>
            <div
              class="history-event"
              :class="{
                'history-event--on': isOnEvent(item.log.type) && item.log.isOn === true,
                'history-event--off': isOnEvent(item.log.type) && item.log.isOn === false,
              }"
            >
              {{ LOG_LABEL[item.log.type] }}<span
                v-if="item.log.isOn !== null"
                class="history-event__suffix"
              > · {{ item.log.isOn ? 'เปิด' : 'ปิด' }}</span>
            </div>
          </div>
        </li>
      </template>
    </ul>
    <p v-else-if="!logsLoading" class="history-empty">
      ยังไม่มีประวัติ — ลองสลับสถานะเพื่อดูรายการที่นี่
    </p>
    <p v-else class="history-empty">กำลังโหลด…</p>

    <button
      type="button"
      class="history-load-more"
      :disabled="!logsCursor || logsLoading"
      @click="loadLogs(false)"
    >
      {{ logsLoading ? 'กำลังโหลด…' : 'โหลดเพิ่ม' }}
    </button>
  </div>
</template>

<style scoped>
.light-history-card {
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

.card-title {
  margin: 0 0 1rem;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(203, 213, 225, 0.92);
}

.history-timeline {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0 0 0 1.6rem;
  border-left: 2px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.history-item {
  position: relative;
  padding: 0.55rem 0;
}

.history-node {
  position: absolute;
  left: -2.05rem;
  top: 0.85rem;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.6);
  box-shadow:
    0 0 0 3px var(--surface),
    0 0 0 4px rgba(255, 255, 255, 0.05);
}

.history-node--out {
  background: #38bdf8;
  box-shadow:
    0 0 0 3px var(--surface),
    0 0 0 4px rgba(56, 189, 248, 0.4),
    0 0 10px rgba(56, 189, 248, 0.5);
}

.history-node--in {
  background: #a78bfa;
  box-shadow:
    0 0 0 3px var(--surface),
    0 0 0 4px rgba(167, 139, 250, 0.4),
    0 0 10px rgba(167, 139, 250, 0.5);
}

.history-node--internal {
  background: rgba(148, 163, 184, 0.6);
  box-shadow:
    0 0 0 3px var(--surface),
    0 0 0 4px rgba(148, 163, 184, 0.18);
}

.history-content {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.history-meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.74rem;
  flex-wrap: wrap;
}

.history-direction {
  display: inline-flex;
  align-items: center;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgba(203, 213, 225, 0.85);
  cursor: help;
}

.history-direction--out {
  color: #bae6fd;
  background: rgba(56, 189, 248, 0.14);
  border-color: rgba(56, 189, 248, 0.32);
}

.history-direction--in {
  color: #ddd6fe;
  background: rgba(167, 139, 250, 0.14);
  border-color: rgba(167, 139, 250, 0.32);
}

.history-direction--internal {
  color: rgba(203, 213, 225, 0.85);
}

.history-output-chip {
  display: inline-flex;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.1);
  border: 1px solid rgba(250, 204, 21, 0.25);
  color: #fde68a;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.history-time {
  margin-left: auto;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.72rem;
  color: rgba(148, 163, 184, 0.85);
  font-variant-numeric: tabular-nums;
}

.history-event {
  font-size: 0.9rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.92);
}

.history-event--on {
  color: #bbf7d0;
}

.history-event--off {
  color: #fecaca;
}

.history-event__suffix {
  font-weight: 500;
  opacity: 0.92;
}

.history-separator {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0.85rem 0 0.2rem;
  margin-left: -1.6rem;
  padding-left: 0.4rem;
}

.history-separator__line {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
}

.history-separator__label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
}

.history-empty {
  margin: 0;
  padding: 0.35rem 0 0.15rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.5;
}

.history-load-more {
  margin-top: 0.95rem;
  width: 100%;
  padding: 0.55rem 0.95rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.55);
  color: rgba(226, 232, 240, 0.92);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.history-load-more:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(56, 189, 248, 0.4);
}

.history-load-more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
