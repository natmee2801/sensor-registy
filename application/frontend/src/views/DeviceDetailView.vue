<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import DeviceControl from '@/components/DeviceControl.vue'
import DeviceHistory from '@/components/DeviceHistory.vue'
import BulbVisual from '@/components/BulbVisual.vue'
import { BRIGHTNESS_LABELS, type BrightnessLevel } from '@/types/device'

const props = defineProps<{ id: string }>()

const router = useRouter()
const store = useDevicesStore()
const { devices, states } = storeToRefs(store)

const device = computed(() => devices.value[props.id] ?? null)
const state = computed(() => states.value[props.id] ?? null)
const isOnline = computed(() => state.value?.isOnline ?? false)
const brightness = computed<BrightnessLevel>(() => store.getBrightness(props.id))
const deviceMode = computed(() => store.getDeviceMode(props.id))

const activeTab = ref<'control' | 'history'>('control')

onMounted(() => {
  if (!device.value) store.refreshDevice(props.id).catch(() => {})
})

const handleRemoved = () => {
  router.push({ name: 'devices' })
}

const formatThaiDate = (isoDate: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(isoDate))
</script>

<template>
  <section v-if="device" class="detail">
    <RouterLink to="/" class="detail__back">
      <span aria-hidden="true">←</span>
      <span>กลับ</span>
    </RouterLink>

    <header class="detail__hero">
      <div class="detail__bulb-frame" :class="{ 'detail__bulb-frame--lit': isOnline && brightness !== 'off' }">
        <BulbVisual :level="isOnline ? brightness : 'off'" size="lg" />
      </div>
      <div class="detail__info">
        <div class="detail__chip-row">
          <span
            class="chip"
            :class="isOnline ? 'chip--online' : 'chip--offline'"
          >
            <span class="chip__dot" />
            {{ isOnline ? 'ออนไลน์' : 'ออฟไลน์' }}
          </span>
          <span
            v-if="isOnline && brightness !== 'off'"
            class="chip"
            :class="`chip--${brightness}`"
          >
            {{ BRIGHTNESS_LABELS[brightness] }}
            <span v-if="deviceMode === 'auto'" class="chip__suffix">· อัตโนมัติ</span>
          </span>
        </div>
        <h1 class="detail__id">{{ device.id }}</h1>
        <p class="detail__location">{{ device.location }}</p>
        <p class="detail__created">ลงทะเบียนเมื่อ · {{ formatThaiDate(device.createdAt) }}</p>
      </div>
    </header>

    <div class="detail__tabs" role="tablist">
      <button
        type="button"
        class="detail__tab"
        :class="{ 'detail__tab--active': activeTab === 'control' }"
        role="tab"
        :aria-selected="activeTab === 'control'"
        @click="activeTab = 'control'"
      >
        ควบคุม
      </button>
      <button
        type="button"
        class="detail__tab"
        :class="{ 'detail__tab--active': activeTab === 'history' }"
        role="tab"
        :aria-selected="activeTab === 'history'"
        @click="activeTab = 'history'"
      >
        ประวัติ
      </button>
    </div>

    <DeviceControl
      v-if="activeTab === 'control'"
      :device-id="device.id"
      @removed="handleRemoved"
    />
    <DeviceHistory v-else :device-id="device.id" />
  </section>

  <section v-else class="not-found">
    <p class="not-found__title">ไม่พบอุปกรณ์</p>
    <p class="not-found__body">device_id "{{ id }}" อาจถูกลบหรือยังไม่ได้ลงทะเบียน</p>
    <RouterLink to="/" class="not-found__link">← กลับไปยังรายการอุปกรณ์</RouterLink>
  </section>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  max-width: 32rem;
  margin: 0 auto;
}

.detail__back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  align-self: flex-start;
  padding: 0.3rem 0.75rem 0.3rem 0.55rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--stroke);
  color: var(--text-2);
  text-decoration: none;
  font-size: 0.78rem;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transition: color 0.18s ease, transform 0.18s ease;
}

.detail__back:hover {
  color: var(--accent-strong);
  transform: translateX(-2px);
}

.detail__hero {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.detail__bulb-frame {
  display: grid;
  place-items: center;
  width: 3.4rem;
  height: 3.4rem;
  border-radius: 50%;
  background: var(--surface-sunk);
  border: 1px solid var(--stroke);
  flex-shrink: 0;
  transition: background 0.3s ease, box-shadow 0.3s ease;
}

.detail__bulb-frame--lit {
  background: radial-gradient(circle, rgba(252, 211, 77, 0.32) 0%, rgba(245, 158, 11, 0.16) 55%, var(--surface-sunk) 100%);
  box-shadow:
    0 0 0 4px rgba(245, 158, 11, 0.16),
    0 0 24px rgba(252, 211, 77, 0.22);
  border-color: rgba(245, 158, 11, 0.32);
}

.detail__info {
  min-width: 0;
  flex: 1;
}

.detail__chip-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 0.3rem;
  flex-wrap: wrap;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.18rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}

.chip__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: currentColor;
}

.chip--online {
  color: var(--on-text);
  background: var(--on-soft);
  border-color: rgba(163, 230, 53, 0.28);
}

.chip--offline {
  color: var(--offline-text);
  background: var(--offline-soft);
  border-color: rgba(251, 146, 60, 0.32);
}

.chip--low {
  color: var(--warm);
  background: var(--warm-soft);
  border-color: rgba(252, 211, 77, 0.32);
}

.chip--high {
  color: var(--warm-strong);
  background: var(--accent-soft);
  border-color: rgba(245, 158, 11, 0.38);
}

.chip__suffix {
  opacity: 0.85;
  font-weight: 500;
}

.detail__id {
  margin: 0;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: clamp(1.05rem, 3vw, 1.25rem);
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  word-break: break-all;
}

.detail__location {
  margin: 0.15rem 0 0;
  color: var(--text-2);
  font-size: 0.85rem;
  font-weight: 500;
}

.detail__created {
  margin: 0.1rem 0 0;
  font-size: 0.7rem;
  color: var(--muted);
}

.detail__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.22rem;
  padding: 0.22rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.detail__tab {
  padding: 0.42rem 0.7rem;
  border: 0;
  background: transparent;
  border-radius: 999px;
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease;
}

.detail__tab:hover { color: var(--text); }

.detail__tab--active {
  color: var(--warm-strong);
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.28);
}

.detail__tab:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}

.not-found {
  max-width: 30rem;
  margin: 2rem auto;
  padding: 1.8rem;
  text-align: center;
  border-radius: var(--radius-xl);
  background: var(--surface);
  border: 1px dashed var(--stroke-strong);
}

.not-found__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
}

.not-found__body {
  margin: 0.55rem 0 1.1rem;
  color: var(--text-2);
  font-size: 0.9rem;
}

.not-found__link {
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.not-found__link:hover { text-decoration: underline; }
</style>
