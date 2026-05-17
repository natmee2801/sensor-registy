<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDevicesStore } from '@/stores/devices'
import DeviceCard from '@/components/DeviceCard.vue'
import PairingCard from '@/components/PairingCard.vue'
import ClaimDeviceModal from '@/components/ClaimDeviceModal.vue'
import type { PairingSession } from '@/types/device'

const store = useDevicesStore()
const { deviceList, unclaimedList } = storeToRefs(store)

const tab = ref<'devices' | 'pairing'>('devices')

const query = ref('')
const filtered = computed(() => store.searchDevices(query.value))
const totalCount = computed(() => deviceList.value.length)

const STALE_HIDE_MS = 5 * 60 * 1000
const nowTick = ref(Date.now())
setInterval(() => {
  nowTick.value = Date.now()
}, 10_000)
const visibleUnclaimed = computed(() =>
  unclaimedList.value.filter(
    (s) => nowTick.value - new Date(s.lastSeenAt).getTime() < STALE_HIDE_MS,
  ),
)
const pairingCount = computed(() => visibleUnclaimed.value.length)

const selectedSession = ref<PairingSession | null>(null)
const openClaim = (session: PairingSession) => {
  selectedSession.value = session
}
const closeClaim = () => {
  selectedSession.value = null
}
</script>

<template>
  <section class="devices-view">
    <header class="devices-view__hero">
      <div>
        <p class="devices-view__eyebrow">Smart lighting</p>
        <h1 class="devices-view__title">อุปกรณ์ทั้งหมด</h1>
        <p class="devices-view__subtitle">
          เปิดอุปกรณ์ใหม่ให้ประกาศตัวผ่าน MQTT แล้ว claim จากแท็บ Pairing
        </p>
      </div>
    </header>

    <div class="devices-view__tabs" role="tablist">
      <button
        type="button"
        class="devices-view__tab"
        :class="{ 'devices-view__tab--active': tab === 'devices' }"
        role="tab"
        :aria-selected="tab === 'devices'"
        @click="tab = 'devices'"
      >
        Devices <span class="devices-view__tab-count">({{ totalCount }})</span>
      </button>
      <button
        type="button"
        class="devices-view__tab"
        :class="{
          'devices-view__tab--active': tab === 'pairing',
          'devices-view__tab--pulse': pairingCount > 0 && tab !== 'pairing',
        }"
        role="tab"
        :aria-selected="tab === 'pairing'"
        @click="tab = 'pairing'"
      >
        Pairing <span class="devices-view__tab-count">({{ pairingCount }})</span>
      </button>
    </div>

    <template v-if="tab === 'devices'">
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
          เปิดสวิตช์อุปกรณ์ตัวแรก แล้วไปที่แท็บ Pairing เพื่อ claim
        </p>
      </div>

      <div v-else-if="filtered.length === 0" class="devices-view__empty">
        <p class="devices-view__empty-title">ไม่พบอุปกรณ์ที่ตรงกับคำค้น</p>
        <p class="devices-view__empty-body">ลองค้นด้วย device_id หรือชื่อห้องอื่น</p>
      </div>

      <div v-else class="devices-view__grid">
        <DeviceCard v-for="device in filtered" :key="device.id" :device="device" />
      </div>
    </template>

    <template v-else>
      <div v-if="pairingCount === 0" class="devices-view__empty">
        <p class="devices-view__empty-title">ยังไม่มีอุปกรณ์รอ pair</p>
        <p class="devices-view__empty-body">
          เสียบไฟอุปกรณ์ตัวใหม่ — ภายในไม่กี่วินาทีจะปรากฏที่นี่
        </p>
      </div>
      <div v-else class="devices-view__grid">
        <PairingCard
          v-for="session in visibleUnclaimed"
          :key="session.mac"
          :session="session"
          @claim="openClaim"
        />
      </div>
    </template>

    <ClaimDeviceModal :session="selectedSession" @close="closeClaim" />
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

.devices-view__tabs {
  display: inline-flex;
  gap: 0.3rem;
  padding: 0.3rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--stroke);
  width: fit-content;
}

.devices-view__tab {
  padding: 0.5rem 1.1rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(203, 213, 225, 0.85);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.devices-view__tab:hover {
  color: var(--text);
}

.devices-view__tab--active {
  background: linear-gradient(100deg, var(--accent) 0%, var(--accent-2) 100%);
  color: #0b1326;
}

.devices-view__tab--pulse {
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
  50% { box-shadow: 0 0 0 6px rgba(74, 222, 128, 0.15); }
}

.devices-view__tab-count {
  font-size: 0.75rem;
  opacity: 0.85;
  margin-left: 0.15rem;
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
