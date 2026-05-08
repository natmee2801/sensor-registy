<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import DeviceCard from '@/components/DeviceCard.vue'

const store = useDevicesStore()
const { deviceList } = storeToRefs(store)

const query = ref('')
const filtered = computed(() => store.searchDevices(query.value))
const totalCount = computed(() => deviceList.value.length)
</script>

<template>
  <section class="devices-view">
    <header class="devices-view__hero">
      <div>
        <p class="devices-view__eyebrow">Smart lighting</p>
        <h1 class="devices-view__title">อุปกรณ์ทั้งหมด</h1>
        <p class="devices-view__subtitle">
          ลงทะเบียน device_id เพื่อควบคุมหลอดไฟแยกตามอุปกรณ์
        </p>
      </div>
      <RouterLink to="/register" class="devices-view__cta">+ ลงทะเบียนอุปกรณ์</RouterLink>
    </header>

    <div class="devices-view__search">
      <span class="devices-view__search-icon" aria-hidden="true">⌕</span>
      <input
        v-model="query"
        class="devices-view__search-input"
        type="search"
        placeholder="ค้นหาด้วย device_id หรือตำแหน่ง"
        autocomplete="off"
      />
      <span v-if="query" class="devices-view__search-count">
        {{ filtered.length }} / {{ totalCount }}
      </span>
    </div>

    <div v-if="totalCount === 0" class="devices-view__empty">
      <p class="devices-view__empty-title">ยังไม่มีอุปกรณ์</p>
      <p class="devices-view__empty-body">
        เริ่มต้นด้วยการลงทะเบียนอุปกรณ์ตัวแรก แล้วคุณจะสามารถเปิด–ปิดไฟได้จากหน้านี้
      </p>
      <RouterLink to="/register" class="devices-view__cta devices-view__cta--block">
        ลงทะเบียนอุปกรณ์ใหม่
      </RouterLink>
    </div>

    <div v-else-if="filtered.length === 0" class="devices-view__empty">
      <p class="devices-view__empty-title">ไม่พบอุปกรณ์ที่ตรงกับคำค้น</p>
      <p class="devices-view__empty-body">ลองค้นด้วย device_id หรือชื่อห้องอื่น</p>
    </div>

    <div v-else class="devices-view__grid">
      <DeviceCard v-for="device in filtered" :key="device.id" :device="device" />
    </div>
  </section>
</template>

<style scoped>
.devices-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.devices-view__hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.devices-view__eyebrow {
  margin: 0 0 0.2rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.95);
}

.devices-view__title {
  margin: 0;
  font-size: clamp(1.6rem, 4.5vw, 2.1rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(90deg, #f8fafc 0%, #cbd5e1 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.devices-view__subtitle {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.55;
}

.devices-view__cta {
  padding: 0.65rem 1.05rem;
  border-radius: 999px;
  background: linear-gradient(100deg, var(--accent) 0%, var(--accent-2) 100%);
  color: #0b1326;
  font-size: 0.86rem;
  font-weight: 700;
  text-decoration: none;
  box-shadow: 0 12px 32px rgba(56, 189, 248, 0.32);
  transition:
    transform 0.18s ease,
    filter 0.18s ease;
}

.devices-view__cta:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.devices-view__cta--block {
  margin-top: 0.9rem;
  display: inline-block;
}

.devices-view__search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 1rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.devices-view__search-icon {
  color: rgba(148, 163, 184, 0.85);
  font-size: 1.05rem;
}

.devices-view__search-input {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 0.95rem;
  outline: none;
}

.devices-view__search-input::placeholder {
  color: rgba(148, 163, 184, 0.7);
}

.devices-view__search-count {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.85);
  white-space: nowrap;
}

.devices-view__empty {
  padding: 1.5rem 1.4rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  text-align: center;
}

.devices-view__empty-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
}

.devices-view__empty-body {
  margin: 0.5rem 0 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.55;
}

.devices-view__grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}
</style>
