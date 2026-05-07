<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDevicesStore } from '@/stores/devices'
import type { ValidationError } from '@/stores/devices'

const router = useRouter()
const store = useDevicesStore()

const deviceId = ref('')
const location = ref('')
const errors = ref<ValidationError[]>([])
const submitted = ref(false)

const idError = computed(() => errors.value.find((e) => e.field === 'id')?.message ?? null)
const locationError = computed(
  () => errors.value.find((e) => e.field === 'location')?.message ?? null,
)

const handleSubmit = () => {
  submitted.value = true
  const result = store.registerDevice(deviceId.value, location.value)
  if (!result.ok) {
    errors.value = result.errors
    return
  }
  router.push({ name: 'device-detail', params: { id: result.id } })
}

const handleCancel = () => {
  router.push({ name: 'devices' })
}
</script>

<template>
  <section class="register-view">
    <header class="register-view__hero">
      <p class="register-view__eyebrow">New device</p>
      <h1 class="register-view__title">ลงทะเบียนอุปกรณ์ใหม่</h1>
      <p class="register-view__subtitle">
        กรอก device_id และตำแหน่งของอุปกรณ์เพื่อเริ่มควบคุม
      </p>
    </header>

    <form class="register-view__form" @submit.prevent="handleSubmit">
      <label class="register-view__field">
        <span class="register-view__label">device_id</span>
        <input
          v-model="deviceId"
          class="register-view__input"
          :class="{ 'register-view__input--error': submitted && idError }"
          type="text"
          autocomplete="off"
          placeholder="เช่น living-room-01"
          maxlength="64"
        />
        <span v-if="submitted && idError" class="register-view__error">{{ idError }}</span>
        <span v-else class="register-view__hint">A-Z, a-z, 0-9, "-", "_" สูงสุด 64 ตัวอักษร</span>
      </label>

      <label class="register-view__field">
        <span class="register-view__label">ตำแหน่ง / ห้อง</span>
        <input
          v-model="location"
          class="register-view__input"
          :class="{ 'register-view__input--error': submitted && locationError }"
          type="text"
          autocomplete="off"
          placeholder="เช่น ห้องนอน, โรงรถ"
          maxlength="80"
        />
        <span v-if="submitted && locationError" class="register-view__error">
          {{ locationError }}
        </span>
        <span v-else class="register-view__hint">ใช้ในการค้นหาในหน้ารายการ</span>
      </label>

      <div class="register-view__actions">
        <button type="button" class="register-view__button register-view__button--ghost" @click="handleCancel">
          ยกเลิก
        </button>
        <button type="submit" class="register-view__button register-view__button--primary">
          ลงทะเบียน
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.register-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 32rem;
  margin: 0 auto;
}

.register-view__hero {
  text-align: center;
}

.register-view__eyebrow {
  margin: 0 0 0.2rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.95);
}

.register-view__title {
  margin: 0;
  font-size: clamp(1.5rem, 4.5vw, 1.9rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(90deg, #f8fafc 0%, #cbd5e1 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.register-view__subtitle {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.55;
}

.register-view__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.4rem 1.4rem 1.2rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 22px 60px rgba(0, 0, 0, 0.35);
}

.register-view__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.register-view__label {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(203, 213, 225, 0.95);
}

.register-view__input {
  width: 100%;
  padding: 0.7rem 0.85rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(6, 9, 18, 0.65);
  color: var(--text);
  font-family: inherit;
  font-size: 0.95rem;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.register-view__input::placeholder {
  color: rgba(148, 163, 184, 0.6);
}

.register-view__input:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
}

.register-view__input--error {
  border-color: rgba(248, 113, 113, 0.55);
}

.register-view__input--error:focus {
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.22);
}

.register-view__hint {
  font-size: 0.74rem;
  color: rgba(148, 163, 184, 0.85);
}

.register-view__error {
  font-size: 0.78rem;
  color: #fecaca;
}

.register-view__actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.4rem;
}

.register-view__button {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    filter 0.18s ease,
    background 0.18s ease;
}

.register-view__button--primary {
  border: 0;
  color: #042f1a;
  background: linear-gradient(100deg, #4ade80 0%, #22c55e 100%);
  box-shadow: 0 12px 32px rgba(34, 197, 94, 0.3);
}

.register-view__button--primary:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.register-view__button--ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(226, 232, 240, 0.85);
}

.register-view__button--ghost:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}
</style>
