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
  <section v-if="device" class="device-detail">
    <header class="device-detail__hero">
      <BulbVisual class="device-detail__bulb" :level="isOnline ? brightness : 'off'" size="lg" />
      <div class="device-detail__info">
        <div class="device-detail__eyebrow-row">
          <p class="device-detail__eyebrow">device_id</p>
          <span
            class="device-detail__status"
            :class="{
              'device-detail__status--online': isOnline,
              'device-detail__status--offline': !isOnline,
            }"
          >
            <span class="device-detail__status-dot" />
            {{ isOnline ? 'ออนไลน์' : 'ออฟไลน์' }}
          </span>
          <span
            v-if="isOnline && brightness !== 'off'"
            class="device-detail__brightness"
            :class="`device-detail__brightness--${brightness}`"
          >
            {{ BRIGHTNESS_LABELS[brightness] }}
            <span v-if="deviceMode === 'auto'" class="device-detail__brightness-auto">· อัตโนมัติ</span>
          </span>
        </div>
        <h1 class="device-detail__id">{{ device.id }}</h1>
        <p class="device-detail__location">{{ device.location }}</p>
        <p class="device-detail__created">ลงทะเบียนเมื่อ · {{ formatThaiDate(device.createdAt) }}</p>
      </div>
    </header>

    <div class="device-detail__tabs" role="tablist">
      <button
        type="button"
        class="device-detail__tab"
        :class="{ 'device-detail__tab--active': activeTab === 'control' }"
        role="tab"
        :aria-selected="activeTab === 'control'"
        @click="activeTab = 'control'"
      >
        ควบคุม
      </button>
      <button
        type="button"
        class="device-detail__tab"
        :class="{ 'device-detail__tab--active': activeTab === 'history' }"
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
.device-detail {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 30rem;
  margin: 0 auto;
}

.device-detail__hero {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.15rem 0;
}

.device-detail__bulb {
  flex-shrink: 0;
}

.device-detail__info {
  min-width: 0;
  flex: 1;
}

.device-detail__eyebrow-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.35rem;
  flex-wrap: wrap;
}

.device-detail__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.95);
}

.device-detail__status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: 1px solid transparent;
}

.device-detail__status-dot {
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 999px;
  background: currentColor;
}

.device-detail__status--online {
  color: #bbf7d0;
  background: rgba(74, 222, 128, 0.14);
  border-color: rgba(74, 222, 128, 0.4);
}

.device-detail__status--offline {
  color: #fecaca;
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.42);
}

.device-detail__brightness {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  border: 1px solid transparent;
}

.device-detail__brightness--low {
  color: #fde68a;
  background: rgba(250, 204, 21, 0.16);
  border-color: rgba(250, 204, 21, 0.38);
}

.device-detail__brightness--high {
  color: #bbf7d0;
  background: rgba(74, 222, 128, 0.16);
  border-color: rgba(74, 222, 128, 0.4);
}

.device-detail__brightness-auto {
  opacity: 0.85;
  font-weight: 500;
}

.device-detail__id {
  margin: 0;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: clamp(1.25rem, 4vw, 1.55rem);
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  word-break: break-all;
}

.device-detail__location {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.95rem;
}

.device-detail__created {
  margin: 0.2rem 0 0;
  font-size: 0.76rem;
  color: rgba(148, 163, 184, 0.85);
}

.device-detail__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.3rem;
  padding: 0.28rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.device-detail__tab {
  padding: 0.5rem 0.7rem;
  border: 0;
  background: transparent;
  border-radius: 999px;
  color: rgba(226, 232, 240, 0.75);
  font-family: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.device-detail__tab--active {
  color: var(--text);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 8px 22px rgba(0, 0, 0, 0.3);
}

.device-detail__tab:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.55);
  outline-offset: 2px;
}

.not-found {
  max-width: 30rem;
  margin: 2rem auto;
  padding: 1.6rem;
  text-align: center;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px dashed rgba(255, 255, 255, 0.14);
}

.not-found__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
}

.not-found__body {
  margin: 0.55rem 0 1.1rem;
  color: var(--muted);
  font-size: 0.9rem;
}

.not-found__link {
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.not-found__link:hover {
  text-decoration: underline;
}
</style>
