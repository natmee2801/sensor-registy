<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDevicesStore, type ValidationError } from '@/stores/devices'
import type { PairingSession } from '@/types/device'

const props = defineProps<{ session: PairingSession | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const store = useDevicesStore()

const location = ref('')
const errors = ref<ValidationError[]>([])
const submitted = ref(false)
const submitting = ref(false)

watch(
  () => props.session,
  (s) => {
    if (s) {
      location.value = ''
      errors.value = []
      submitted.value = false
    }
  },
)

const locationError = computed(
  () => errors.value.find((e) => e.field === 'location')?.message ?? null,
)

const handleClose = () => {
  if (submitting.value) return
  emit('close')
}

const handleSubmit = async () => {
  if (!props.session || submitting.value) return
  submitted.value = true
  submitting.value = true
  try {
    const result = await store.claimDevice(props.session.mac, location.value)
    if (!result.ok) {
      errors.value = result.errors
      return
    }
    emit('close')
    router.push({ name: 'device-detail', params: { id: result.id } })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="session" class="claim-modal" role="dialog" aria-modal="true" @click.self="handleClose">
    <div class="claim-modal__panel">
      <header class="claim-modal__head">
        <p class="claim-modal__eyebrow">Claim device</p>
        <h2 class="claim-modal__title">{{ session.proposedId }}</h2>
        <p class="claim-modal__mac">{{ session.mac }}</p>
      </header>

      <form class="claim-modal__form" @submit.prevent="handleSubmit">
        <label class="claim-modal__field">
          <span class="claim-modal__label">ตำแหน่ง / ห้อง</span>
          <input
            v-model="location"
            class="claim-modal__input"
            :class="{ 'claim-modal__input--error': submitted && locationError }"
            type="text"
            autocomplete="off"
            placeholder="เช่น ห้องนอน, โรงรถ"
            maxlength="80"
            autofocus
          />
          <span v-if="submitted && locationError" class="claim-modal__error">
            {{ locationError }}
          </span>
          <span v-else class="claim-modal__hint">ใช้สำหรับค้นหาในหน้ารายการ</span>
        </label>

        <div class="claim-modal__actions">
          <button
            type="button"
            class="claim-modal__button claim-modal__button--ghost"
            :disabled="submitting"
            @click="handleClose"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            class="claim-modal__button claim-modal__button--primary"
            :disabled="submitting"
          >
            {{ submitting ? 'กำลัง claim…' : 'Claim' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.claim-modal {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(2, 6, 23, 0.7);
  backdrop-filter: blur(6px);
}

.claim-modal__panel {
  width: 100%;
  max-width: 28rem;
  padding: 1.4rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--stroke);
  color: var(--text);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}

.claim-modal__head {
  margin-bottom: 1rem;
}

.claim-modal__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.95);
}

.claim-modal__title {
  margin: 0.2rem 0 0.15rem;
  font-family: ui-monospace, monospace;
  font-size: 1.15rem;
  font-weight: 700;
}

.claim-modal__mac {
  margin: 0;
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  color: var(--muted);
}

.claim-modal__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.claim-modal__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.claim-modal__label {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(203, 213, 225, 0.95);
}

.claim-modal__input {
  width: 100%;
  padding: 0.7rem 0.85rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(6, 9, 18, 0.65);
  color: var(--text);
  font-family: inherit;
  font-size: 0.95rem;
}

.claim-modal__input:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
}

.claim-modal__input--error {
  border-color: rgba(248, 113, 113, 0.55);
}

.claim-modal__hint {
  font-size: 0.74rem;
  color: rgba(148, 163, 184, 0.85);
}

.claim-modal__error {
  font-size: 0.78rem;
  color: #fecaca;
}

.claim-modal__actions {
  display: flex;
  gap: 0.6rem;
}

.claim-modal__button {
  flex: 1;
  padding: 0.7rem 1rem;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease;
}

.claim-modal__button--primary {
  border: 0;
  color: #042f1a;
  background: linear-gradient(100deg, #4ade80 0%, #22c55e 100%);
  box-shadow: 0 12px 32px rgba(34, 197, 94, 0.3);
}

.claim-modal__button--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.claim-modal__button--ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(226, 232, 240, 0.85);
}

.claim-modal__button--ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.claim-modal__button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
