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
const onlineCount = computed(
  () => deviceList.value.filter((d) => store.states[d.id]?.isOnline).length,
)

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
    <header class="hero">
      <div class="hero__lead">
        <h1 class="hero__title">อุปกรณ์ทั้งหมด</h1>
        <span class="hero__pulse">
          <span class="hero__pulse-dot" />
          live
        </span>
      </div>
      <div class="hero__metrics">
        <span class="hero__metric">
          <span class="hero__metric-num">{{ onlineCount }}</span>
          <span class="hero__metric-label">/ {{ totalCount }} ออนไลน์</span>
        </span>
        <span
          v-if="pairingCount > 0"
          class="hero__metric hero__metric--pair"
        >
          <span class="hero__metric-num">{{ pairingCount }}</span>
          <span class="hero__metric-label">รอ pair</span>
        </span>
      </div>
    </header>

    <div class="tabs" role="tablist">
      <button
        type="button"
        class="tabs__item"
        :class="{ 'tabs__item--active': tab === 'devices' }"
        role="tab"
        :aria-selected="tab === 'devices'"
        @click="tab = 'devices'"
      >
        <span>Devices</span>
        <span class="tabs__count">{{ totalCount }}</span>
      </button>
      <button
        type="button"
        class="tabs__item"
        :class="{
          'tabs__item--active': tab === 'pairing',
          'tabs__item--alert': pairingCount > 0 && tab !== 'pairing',
        }"
        role="tab"
        :aria-selected="tab === 'pairing'"
        @click="tab = 'pairing'"
      >
        <span>Pairing</span>
        <span class="tabs__count">{{ pairingCount }}</span>
      </button>
    </div>

    <template v-if="tab === 'devices'">
      <div class="search">
        <svg class="search__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
        <input
          v-model="query"
          class="search__input"
          type="search"
          placeholder="ค้นหาด้วย device_id หรือตำแหน่ง"
          autocomplete="off"
        />
        <span v-if="query" class="search__count">{{ filtered.length }} / {{ totalCount }}</span>
      </div>

      <div v-if="totalCount === 0" class="empty">
        <span class="empty__icon" aria-hidden="true">○</span>
        <p class="empty__title">ยังไม่มีอุปกรณ์</p>
        <p class="empty__body">
          เปิดสวิตช์อุปกรณ์ตัวแรก แล้วไปที่แท็บ Pairing เพื่อ claim
        </p>
      </div>

      <div v-else-if="filtered.length === 0" class="empty">
        <span class="empty__icon" aria-hidden="true">⌕</span>
        <p class="empty__title">ไม่พบอุปกรณ์ที่ตรงกับคำค้น</p>
        <p class="empty__body">ลองค้นด้วย device_id หรือชื่อห้องอื่น</p>
      </div>

      <div v-else class="grid">
        <DeviceCard v-for="device in filtered" :key="device.id" :device="device" />
      </div>
    </template>

    <template v-else>
      <div v-if="pairingCount === 0" class="empty">
        <span class="empty__icon" aria-hidden="true">⌁</span>
        <p class="empty__title">ยังไม่มีอุปกรณ์รอ pair</p>
        <p class="empty__body">
          เสียบไฟอุปกรณ์ตัวใหม่ — ภายในไม่กี่วินาทีจะปรากฏที่นี่
        </p>
      </div>
      <div v-else class="grid">
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
  gap: 0.85rem;
}

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  flex-wrap: wrap;
  padding: 0.3rem 0.2rem 0.1rem;
}

.hero__lead {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.hero__pulse {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  background: var(--on-soft);
  color: var(--on-text);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid rgba(163, 230, 53, 0.28);
}

.hero__pulse-dot {
  width: 0.36rem;
  height: 0.36rem;
  border-radius: 50%;
  background: var(--on);
  animation: heroPulse 1.8s ease-out infinite;
}

@keyframes heroPulse {
  0% { box-shadow: 0 0 0 0 rgba(163, 230, 53, 0.55); }
  100% { box-shadow: 0 0 0 6px rgba(163, 230, 53, 0); }
}

.hero__title {
  margin: 0;
  font-size: clamp(1.35rem, 3.5vw, 1.7rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  line-height: 1.15;
}

.hero__metrics {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.hero__metric {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--stroke);
  font-size: 0.78rem;
  color: var(--text-2);
}

.hero__metric-num {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.hero__metric-label {
  font-size: 0.74rem;
  color: var(--muted);
}

.hero__metric--pair {
  background: var(--accent-soft);
  border-color: rgba(245, 158, 11, 0.32);
  animation: metricPulse 1.8s ease-in-out infinite;
}

.hero__metric--pair .hero__metric-num { color: var(--warm-strong); }
.hero__metric--pair .hero__metric-label { color: var(--accent-strong); }

@keyframes metricPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
  50% { box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.18); }
}

.tabs {
  display: inline-flex;
  gap: 0.2rem;
  padding: 0.22rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  width: fit-content;
}

.tabs__item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.38rem 0.85rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.tabs__item:hover { color: var(--text); }

.tabs__item--active {
  color: var(--warm-strong);
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.28);
}

.tabs__count {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--surface-sunk);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.tabs__item--active .tabs__count {
  background: rgba(245, 158, 11, 0.18);
  color: var(--warm-strong);
}

.tabs__item--alert {
  animation: alertPulse 1.6s ease-in-out infinite;
}

@keyframes alertPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
  50% { box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.18); }
}

.search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search:focus-within {
  border-color: rgba(245, 158, 11, 0.45);
  box-shadow: var(--shadow-sm), 0 0 0 4px var(--accent-tint);
}

.search__icon { color: var(--muted); flex-shrink: 0; }

.search__input {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 0.95rem;
  outline: none;
}

.search__input::placeholder { color: var(--muted); }

.search__count {
  font-size: 0.74rem;
  color: var(--muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.empty {
  padding: 1.4rem 1.25rem 1.5rem;
  border-radius: var(--radius-xl);
  background: var(--surface);
  border: 1px dashed var(--stroke-strong);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.empty__icon {
  display: inline-grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  background: var(--surface-sunk);
  color: var(--muted);
  font-size: 1.15rem;
  margin-bottom: 0.25rem;
}

.empty__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
}

.empty__body {
  margin: 0;
  color: var(--text-2);
  font-size: 0.9rem;
  line-height: 1.55;
  max-width: 26rem;
}

.grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}
</style>
