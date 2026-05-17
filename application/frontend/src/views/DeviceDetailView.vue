<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import DeviceControl from '@/components/DeviceControl.vue'
import DeviceHistory from '@/components/DeviceHistory.vue'
import BulbVisual from '@/components/BulbVisual.vue'

const props = defineProps<{ id: string }>()

const router = useRouter()
const store = useDevicesStore()
const { devices, states } = storeToRefs(store)

const device = computed(() => devices.value[props.id] ?? null)
const isOn = computed(() => states.value[props.id]?.isOn ?? false)

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
      <div class="device-detail__stage" :class="{ 'device-detail__stage--on': isOn }">
        <BulbVisual :on="isOn" size="lg" />
      </div>
      <div class="device-detail__info">
        <p class="device-detail__eyebrow">device_id</p>
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
  gap: 1.25rem;
  max-width: 32rem;
  margin: 0 auto;
}

.device-detail__hero {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.device-detail__stage {
  display: grid;
  place-items: center;
  width: 6.5rem;
  height: 8rem;
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 50% 30%, rgba(148, 163, 184, 0.18), rgba(2, 6, 23, 0.5) 70%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.85), rgba(2, 6, 23, 0.95));
  border: 1px solid var(--stroke);
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  transition: background 0.45s ease;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 18px 44px rgba(0, 0, 0, 0.4);
}

.device-detail__stage::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 16px 16px;
  mask-image: radial-gradient(ellipse at center, black 0%, transparent 72%);
  opacity: 0.32;
  pointer-events: none;
}

.device-detail__stage--on {
  background:
    radial-gradient(circle at 50% 32%, rgba(250, 204, 21, 0.22), rgba(2, 6, 23, 0.5) 65%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.85), rgba(2, 6, 23, 0.95));
}

.device-detail__info {
  min-width: 0;
}

.device-detail__eyebrow {
  margin: 0 0 0.2rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.95);
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
  margin: 0.3rem 0 0;
  color: var(--muted);
  font-size: 0.95rem;
}

.device-detail__created {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: rgba(148, 163, 184, 0.85);
}

.device-detail__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  padding: 0.3rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.device-detail__tab {
  padding: 0.55rem 0.75rem;
  border: 0;
  background: transparent;
  border-radius: 999px;
  color: rgba(226, 232, 240, 0.75);
  font-family: inherit;
  font-size: 0.85rem;
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
    0 10px 28px rgba(0, 0, 0, 0.35);
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
