<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import DeviceControl from '@/components/DeviceControl.vue'

const props = defineProps<{ id: string }>()

const router = useRouter()
const store = useDevicesStore()
const { devices } = storeToRefs(store)

const device = computed(() => devices.value[props.id] ?? null)

const handleRemoved = () => {
  router.push({ name: 'devices' })
}

const formatThaiDate = (isoDate: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(isoDate))
</script>

<template>
  <section v-if="device" class="device-detail">
    <header class="device-detail__hero">
      <div class="device-detail__bulb" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          class="device-detail__bulb-svg"
        >
          <path
            d="M9 21h6M10 18h4M12 3a5 5 0 0 0-2.5 9.33V17a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-4.67A5 5 0 0 0 12 3Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path d="M12 9v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </div>
      <div class="device-detail__info">
        <p class="device-detail__eyebrow">device_id</p>
        <h1 class="device-detail__id">{{ device.id }}</h1>
        <p class="device-detail__location">{{ device.location }}</p>
        <p class="device-detail__created">ลงทะเบียนเมื่อ · {{ formatThaiDate(device.createdAt) }}</p>
      </div>
    </header>

    <DeviceControl :device-id="device.id" @removed="handleRemoved" />
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

.device-detail__bulb {
  display: grid;
  place-items: center;
  width: 4rem;
  height: 4rem;
  border-radius: 1.1rem;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
  border: 1px solid var(--stroke);
  color: rgba(226, 232, 240, 0.85);
  flex-shrink: 0;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 18px 44px rgba(0, 0, 0, 0.4);
}

.device-detail__bulb-svg {
  width: 2rem;
  height: 2rem;
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
