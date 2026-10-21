<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import { groupHistory, type Burst, type BurstCause, type BurstRow } from '@/lib/historyBursts'
import {
  BRIGHTNESS_LABELS,
  type BrightnessLevel,
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
  hb_sync: 'ปรับตามสถานะจริงของอุปกรณ์',
  paired: 'จับคู่สำเร็จ',
}

const DIRECTION_GLYPH: Record<LogDirection, string> = {
  out: 'ส่งไปอุปกรณ์',
  in: 'จากอุปกรณ์',
  internal: 'ระบบ',
}
const DIRECTION_TOOLTIP: Record<LogDirection, string> = {
  out: 'ส่งคำสั่งไปยังอุปกรณ์',
  in: 'รับจากอุปกรณ์',
  internal: 'ภายในระบบ (ไม่ผ่าน MQTT)',
}

// ring colour for standalone (non-command) rows
const ringTone = (type: LogType) => {
  if (type === 'device_online' || type === 'paired') return 'good'
  if (type === 'device_offline' || type === 'cmd_timeout') return 'bad'
  return 'neutral'
}

// one name per relay, used everywhere in the history (out1 = หรี่, out2 = สว่าง)
const RELAY_NAME: Record<OutputId, string> = { out1: 'หลอดหรี่', out2: 'หลอดสว่าง' }

const standaloneDetail = (log: DeviceLog) => {
  if (!log.output) return ''
  const name = RELAY_NAME[log.output]
  if (log.isOn === null) return name
  // hb_sync reports what the device really is, so say it as a state, not an action
  if (log.type === 'hb_sync') return `${name} ${log.isOn ? 'เปิดอยู่' : 'ปิดอยู่'}`
  return `${name} ${onOff(log.isOn)}`
}

const CAUSE_LABEL: Record<BurstCause, string> = {
  command: 'สั่งงาน',
  auto: 'อัตโนมัติ',
  timer: 'ตัวจับเวลา',
}

const onOff = (isOn: boolean | null) => (isOn === null ? '' : isOn ? 'เปิด' : 'ปิด')

// Level a burst ended at, assuming the app's canonical levels (low = out1 only, high = out1 + out2).
// Rows only hold relays that changed, so a lone out2 row means out1 was already on.
const burstLevel = (rows: BurstRow[]): BrightnessLevel | null => {
  const on = (o: OutputId) => rows.find((r) => r.output === o)?.isOn
  const out1 = on('out1')
  const out2 = on('out2')
  if (out1 === true && out2 === true) return 'high'
  if (out1 === false && out2 === false) return 'off'
  if (out1 === true && out2 === false) return 'low'
  // canonical levels never have out2 on without out1, so a lone out1 off means everything is off
  if (out2 === undefined && out1 === false) return 'off'
  if (out1 === undefined && out2 !== undefined && out2 !== null) return out2 ? 'high' : 'low'
  if (out2 === undefined && out1 === true) return 'low'
  return null
}

const burstLampClass = (b: Burst) => `lamp--${burstLevel(b.rows) ?? 'unknown'}`

const burstHeadline = (b: Burst) => {
  const level = burstLevel(b.rows)
  if (level) return BRIGHTNESS_LABELS[level]
  return b.rows.map((r) => `${RELAY_NAME[r.output]} ${onOff(r.isOn)}`).join(' · ')
}

const burstStatus = (b: Burst): { text: string; tone: 'ok' | 'bad' | 'wait' } => {
  if (b.rows.some((r) => r.timedOut && !r.acked)) {
    return { text: 'ไม่ได้รับการตอบรับ', tone: 'bad' }
  }
  if (b.rows.every((r) => r.acked)) return { text: 'อุปกรณ์ตอบรับแล้ว', tone: 'ok' }
  return { text: 'รอการตอบรับ', tone: 'wait' }
}

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
  type: 'separator' | 'log' | 'burst'
  key: string
  log?: DeviceLog
  burst?: Burst
  separatorLabel?: string
}

const timeline = computed<TimelineItem[]>(() => {
  const items: TimelineItem[] = []
  let lastDay = ''
  for (const entry of groupHistory(logs.value)) {
    const at = entry.kind === 'burst' ? entry.burst.at : entry.log.createdAt
    const k = dayKey(at)
    if (k !== lastDay) {
      items.push({ type: 'separator', key: `sep-${k}`, separatorLabel: dayLabel(at) })
      lastDay = k
    }
    if (entry.kind === 'burst') {
      items.push({ type: 'burst', key: entry.burst.key, burst: entry.burst })
    } else {
      items.push({ type: 'log', key: entry.log._id, log: entry.log })
    }
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
  <section class="history" aria-labelledby="history-title">
    <h2 id="history-title" class="history__title">ประวัติการเปลี่ยนสถานะ</h2>

    <ol v-if="timeline.length > 0" class="timeline">
      <template v-for="item in timeline" :key="item.key">
        <li v-if="item.type === 'separator'" class="timeline__day">
          {{ item.separatorLabel }}
        </li>

        <li v-else-if="item.burst" class="entry">
          <span class="lamp" :class="burstLampClass(item.burst)" aria-hidden="true">
            <i class="lamp__pip" />
            <i class="lamp__pip" />
          </span>
          <div class="entry__head">
            <span class="entry__level">{{ burstHeadline(item.burst) }}</span>
            <time class="entry__time" :datetime="item.burst.at">{{ formatTime(item.burst.at) }}</time>
          </div>
          <p class="entry__sub">
            <span>{{ CAUSE_LABEL[item.burst.cause] }}</span>
            <span class="ack" :class="`ack--${burstStatus(item.burst).tone}`">
              <svg class="ack__icon" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  v-if="burstStatus(item.burst).tone === 'ok'"
                  d="M2.5 6.4 5 8.8l4.6-5"
                />
                <path
                  v-else-if="burstStatus(item.burst).tone === 'bad'"
                  d="M6 2.6v4M6 9.2v.1"
                />
                <path v-else d="M6 2.8V6l2.2 1.4" />
              </svg>
              {{ burstStatus(item.burst).text }}
            </span>
          </p>
        </li>

        <li v-else-if="item.log" class="entry entry--event">
          <span class="ring" :class="`ring--${ringTone(item.log.type)}`" aria-hidden="true" />
          <div class="entry__head">
            <span class="entry__title">{{ LOG_LABEL[item.log.type] }}</span>
            <time class="entry__time" :datetime="item.log.createdAt">
              {{ formatTime(item.log.createdAt) }}
            </time>
          </div>
          <p class="entry__sub">
            <span :title="DIRECTION_TOOLTIP[item.log.direction]">
              {{ DIRECTION_GLYPH[item.log.direction] }}
            </span>
            <span v-if="standaloneDetail(item.log)">{{ standaloneDetail(item.log) }}</span>
          </p>
        </li>
      </template>
    </ol>
    <p v-else-if="!logsLoading" class="history__empty">
      ยังไม่มีประวัติ ลองสลับสถานะเพื่อดูรายการที่นี่
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
  </section>
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
  margin: 0 0 0.7rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-2);
}

/* rail: the lamp glyph / ring of each entry sits on this line */
.timeline {
  --rail-x: 0.5rem;
  --gutter: 1.9rem;
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0 0.35rem 0 0;
  max-height: clamp(12rem, 36vh, 24rem);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(245, 158, 11, 0.32) transparent;
}

.timeline::before {
  content: '';
  position: absolute;
  left: var(--rail-x);
  top: 0.4rem;
  bottom: 0.4rem;
  width: 1px;
  background: var(--stroke-strong);
}

.timeline::-webkit-scrollbar { width: 6px; background: transparent; }
.timeline::-webkit-scrollbar-thumb {
  background: rgba(245, 158, 11, 0.32);
  border-radius: 999px;
}

.timeline__day {
  position: relative;
  margin: 0.65rem 0 0.25rem;
  padding-left: var(--gutter);
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--muted);
}
.timeline__day:first-child { margin-top: 0; }

.entry {
  position: relative;
  padding: 0.42rem 0 0.42rem var(--gutter);
}

.entry__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

/* the level is the one thing meant to be read first */
.entry__level {
  font-size: 1.12rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text);
}

.entry__title {
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-2);
}

.entry__time {
  flex: none;
  font-size: 0.72rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.entry__sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem 0.75rem;
  margin: 0.12rem 0 0;
  font-size: 0.74rem;
  color: var(--muted);
}

/* ---- lamp glyph: two pips = the two relays (top สว่าง, bottom หรี่) ---- */
.lamp {
  position: absolute;
  left: calc(var(--rail-x) - 0.45rem);
  top: 0.62rem;
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  width: 0.9rem;
  padding: 0.22rem 0.2rem;
  border-radius: 0.45rem;
  background: var(--bg-2);
  box-shadow: 0 0 0 1px var(--stroke-strong);
}

.lamp__pip {
  display: block;
  height: 0.3rem;
  border-radius: 999px;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--stroke-strong);
}

.lamp--high .lamp__pip {
  background: var(--warm);
  box-shadow: 0 0 8px rgba(252, 211, 77, 0.55);
}
.lamp--low .lamp__pip:last-child {
  background: var(--accent);
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
}
.lamp--high { box-shadow: 0 0 0 1px rgba(252, 211, 77, 0.35), 0 0 14px rgba(252, 211, 77, 0.18); }
.lamp--unknown .lamp__pip { box-shadow: inset 0 0 0 1px var(--muted); opacity: 0.6; }

.entry:has(.lamp--high) .entry__level { color: var(--warm-strong); }
.entry:has(.lamp--low) .entry__level { color: var(--accent-strong); }
.entry:has(.lamp--off) .entry__level { color: var(--text-2); }

/* ---- ring: system events that are not a command ---- */
.ring {
  position: absolute;
  left: calc(var(--rail-x) - 0.2rem);
  top: 0.78rem;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--bg-2);
  box-shadow: 0 0 0 1.5px var(--muted);
}
.ring--good { box-shadow: 0 0 0 1.5px var(--on); }
.ring--bad { box-shadow: 0 0 0 1.5px var(--offline); }

/* ---- ack status ---- */
.ack {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  font-weight: 600;
}
.ack__icon {
  width: 0.78rem;
  height: 0.78rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ack--ok { color: var(--on-text); }
.ack--bad { color: var(--offline-text); }
.ack--wait { color: var(--muted); }

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

.history__more:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}

.history__more:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
