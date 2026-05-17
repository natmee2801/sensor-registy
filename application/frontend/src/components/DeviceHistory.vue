<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import type { DeviceLog, LogType } from '@/types/device'

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
  paired: 'จับคู่สำเร็จ',
}

const isOnEvent = (type: LogType) =>
  type === 'toggle' || type === 'auto_on' || type === 'auto_off' || type === 'timer_expired'

const formatThaiDateTime = (isoDate: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'medium' }).format(
    new Date(isoDate),
  )

const loadLogs = async (reset = false) => {
  if (logsLoading.value) return
  logsLoading.value = true
  try {
    const before = reset ? undefined : logsCursor.value ?? undefined
    const res = await store.fetchLogs(props.deviceId, { limit: 5, before })
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

watch(
  () => state.value?.lastUpdatedAt,
  (next, prev) => {
    if (next !== prev && next !== undefined) loadLogs(true)
  },
)
</script>

<template>
  <div class="light-history-card">
    <h2 class="card-title card-title--solo">ประวัติการเปลี่ยนสถานะ</h2>
    <ul v-if="logs.length > 0" class="history-list">
      <li
        v-for="log in logs"
        :key="log._id"
        class="history-item"
      >
        <span
          class="history-dot"
          :class="{ 'history-dot--on': isOnEvent(log.type) && log.isOn === true }"
          aria-hidden="true"
        />
        <div class="history-main">
          <span
            class="history-status"
            :class="{ 'history-status--on': isOnEvent(log.type) && log.isOn === true }"
          >
            {{ LOG_LABEL[log.type] }}{{ log.isOn !== null ? ` · ${log.isOn ? 'เปิด' : 'ปิด'}` : '' }}
          </span>
          <span class="history-time">{{ formatThaiDateTime(log.createdAt) }}</span>
        </div>
      </li>
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

.history-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.history-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.65rem 0;
}

.history-item + .history-item {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.history-dot {
  margin-top: 0.35rem;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgba(248, 113, 113, 0.85);
  box-shadow: 0 0 12px rgba(248, 113, 113, 0.45);
}

.history-dot--on {
  background: rgba(74, 222, 128, 0.95);
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.45);
}

.history-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.history-status {
  font-size: 0.92rem;
  font-weight: 600;
  color: #fecaca;
}

.history-status--on {
  color: #bbf7d0;
}

.history-time {
  font-size: 0.78rem;
  color: rgba(148, 163, 184, 0.95);
}

.history-empty {
  margin: 0;
  padding: 0.35rem 0 0.15rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.5;
}

.history-load-more {
  margin-top: 0.75rem;
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
