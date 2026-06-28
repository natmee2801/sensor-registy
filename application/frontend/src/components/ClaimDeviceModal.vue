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
  <div v-if="session" class="modal" role="dialog" aria-modal="true" @click.self="handleClose">
    <div class="modal__panel">
      <header class="modal__head">
        <p class="modal__eyebrow">Claim device</p>
        <h2 class="modal__title">{{ session.proposedId }}</h2>
        <p class="modal__mac">{{ session.mac }}</p>
      </header>

      <form class="modal__form" @submit.prevent="handleSubmit">
        <label class="modal__field">
          <span class="modal__label">ตำแหน่ง / ห้อง</span>
          <input
            v-model="location"
            class="modal__input"
            :class="{ 'modal__input--error': submitted && locationError }"
            type="text"
            autocomplete="off"
            placeholder="เช่น ห้องนอน, โรงรถ"
            maxlength="80"
            autofocus
          />
          <span v-if="submitted && locationError" class="modal__error">
            {{ locationError }}
          </span>
          <span v-else class="modal__hint">ใช้สำหรับค้นหาในหน้ารายการ</span>
        </label>

        <div class="modal__actions">
          <button
            type="button"
            class="modal__button modal__button--ghost"
            :disabled="submitting"
            @click="handleClose"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            class="modal__button modal__button--primary"
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
.modal {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(2, 4, 10, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: modalFadeIn 0.18s ease-out;
}

@keyframes modalFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal__panel {
  width: 100%;
  max-width: 28rem;
  padding: 1.55rem;
  border-radius: var(--radius-xl);
  background: linear-gradient(180deg, rgba(28, 30, 41, 0.96), rgba(20, 22, 31, 0.96));
  border: 1px solid var(--stroke-strong);
  color: var(--text);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.05) inset,
    0 32px 80px rgba(0, 0, 0, 0.6);
  animation: modalRise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes modalRise {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.modal__head { margin-bottom: 1.1rem; }

.modal__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-strong);
}

.modal__title {
  margin: 0.35rem 0 0.2rem;
  font-family: ui-monospace, monospace;
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.modal__mac {
  margin: 0;
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  color: var(--muted);
}

.modal__form {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.modal__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.modal__label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-2);
}

.modal__input {
  width: 100%;
  padding: 0.78rem 0.95rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--stroke-strong);
  background: var(--surface-sunk);
  color: var(--text);
  font-family: inherit;
  font-size: 0.95rem;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.modal__input:focus {
  outline: none;
  border-color: rgba(245, 158, 11, 0.5);
  box-shadow: 0 0 0 4px var(--accent-tint);
}

.modal__input--error {
  border-color: rgba(248, 113, 113, 0.5);
}

.modal__hint {
  font-size: 0.76rem;
  color: var(--muted);
}

.modal__error {
  font-size: 0.78rem;
  color: var(--danger);
  font-weight: 500;
}

.modal__actions {
  display: flex;
  gap: 0.6rem;
}

.modal__button {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease, background 0.18s ease;
}

.modal__button--primary {
  border: 0;
  color: #1a1206;
  background: linear-gradient(100deg, #fcd34d 0%, #f59e0b 60%, #ea580c 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 10px 24px rgba(245, 158, 11, 0.32);
}

.modal__button--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.06);
}

.modal__button--ghost {
  background: var(--surface-sunk);
  border: 1px solid var(--stroke-strong);
  color: var(--text-2);
}

.modal__button--ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
}

.modal__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
