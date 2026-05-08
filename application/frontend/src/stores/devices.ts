import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/services/api'
import { ApiError } from '@/services/api'
import type { ControlMode, Device, DeviceLog, DeviceState } from '@/types/device'

const ID_MAX = 64
const LOCATION_MAX = 80
const ID_PATTERN = /^[A-Za-z0-9_-]+$/

export interface ValidationError {
  field: 'id' | 'location'
  message: string
}

export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<Record<string, Device>>({})
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  const deviceList = computed<Device[]>(() =>
    Object.values(devices.value).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  )

  const states = computed<Record<string, DeviceState>>(() => {
    const out: Record<string, DeviceState> = {}
    for (const [id, device] of Object.entries(devices.value)) {
      out[id] = device.state
    }
    return out
  })

  const hasDevice = (id: string) => Object.prototype.hasOwnProperty.call(devices.value, id)
  const getDevice = (id: string): Device | null => devices.value[id] ?? null
  const getState = (id: string): DeviceState | null => devices.value[id]?.state ?? null

  const searchDevices = (query: string): Device[] => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return deviceList.value
    return deviceList.value.filter(
      (device) =>
        device.id.toLowerCase().includes(trimmed) ||
        device.location.toLowerCase().includes(trimmed),
    )
  }

  const validateRegistration = (rawId: string, rawLocation: string): ValidationError[] => {
    const errors: ValidationError[] = []
    const id = rawId.trim()
    const location = rawLocation.trim()

    if (!id) {
      errors.push({ field: 'id', message: 'กรุณากรอก device_id' })
    } else if (id.length > ID_MAX) {
      errors.push({ field: 'id', message: `device_id ต้องไม่เกิน ${ID_MAX} ตัวอักษร` })
    } else if (!ID_PATTERN.test(id)) {
      errors.push({
        field: 'id',
        message: 'device_id ใช้ได้เฉพาะ A-Z, a-z, 0-9, "-", "_"',
      })
    } else if (
      Object.keys(devices.value).some((existing) => existing.toLowerCase() === id.toLowerCase())
    ) {
      errors.push({ field: 'id', message: 'มี device_id นี้อยู่แล้ว' })
    }

    if (!location) {
      errors.push({ field: 'location', message: 'กรุณากรอกตำแหน่ง/ห้อง' })
    } else if (location.length > LOCATION_MAX) {
      errors.push({ field: 'location', message: `ตำแหน่งต้องไม่เกิน ${LOCATION_MAX} ตัวอักษร` })
    }

    return errors
  }

  const upsertDevice = (device: Device) => {
    devices.value = { ...devices.value, [device.id]: device }
  }

  const removeFromState = (id: string) => {
    if (!hasDevice(id)) return
    const next = { ...devices.value }
    delete next[id]
    devices.value = next
  }

  const refreshAll = async () => {
    loading.value = true
    try {
      const list = await api.listDevices()
      const map: Record<string, Device> = {}
      for (const d of list) map[d.id] = d
      devices.value = map
      lastError.value = null
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : 'unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  const refreshDevice = async (id: string) => {
    try {
      const device = await api.getDevice(id)
      upsertDevice(device)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        removeFromState(id)
        return
      }
      throw err
    }
  }

  const registerDevice = async (
    rawId: string,
    rawLocation: string,
  ): Promise<{ ok: true; id: string } | { ok: false; errors: ValidationError[] }> => {
    const localErrors = validateRegistration(rawId, rawLocation)
    if (localErrors.length > 0) return { ok: false, errors: localErrors }

    try {
      const device = await api.registerDevice({
        id: rawId.trim(),
        location: rawLocation.trim(),
      })
      upsertDevice(device)
      return { ok: true, id: device.id }
    } catch (err) {
      if (err instanceof ApiError) {
        const errors: ValidationError[] = []
        if (err.fields && err.fields.length > 0) {
          for (const f of err.fields) {
            const field = f.field === 'id' || f.field === 'location' ? f.field : null
            if (field) errors.push({ field, message: f.message })
          }
        } else if (err.code === 'conflict') {
          errors.push({ field: 'id', message: err.message })
        } else {
          errors.push({ field: 'id', message: err.message })
        }
        return { ok: false, errors }
      }
      throw err
    }
  }

  const removeDevice = async (id: string) => {
    await api.deleteDevice(id)
    removeFromState(id)
  }

  const toggleDevice = async (id: string) => {
    const device = await api.toggleDevice(id)
    upsertDevice(device)
  }

  const setMode = async (id: string, mode: ControlMode) => {
    const device = await api.setMode(id, mode)
    upsertDevice(device)
  }

  const setAutoTimes = async (id: string, autoOnTime: string, autoOffTime: string) => {
    const device = await api.setAutoTimes(id, autoOnTime, autoOffTime)
    upsertDevice(device)
  }

  const startOffTimer = async (id: string, durationMs: number) => {
    const device = await api.startOffTimer(id, durationMs)
    upsertDevice(device)
  }

  const cancelOffTimer = async (id: string) => {
    const device = await api.cancelOffTimer(id)
    upsertDevice(device)
  }

  const fetchLogs = async (
    id: string,
    opts?: { limit?: number; before?: string },
  ): Promise<{ items: DeviceLog[]; nextCursor: string | null }> => {
    return api.getLogs(id, opts)
  }

  let unsubscribe: (() => void) | null = null

  const subscribeEvents = () => {
    if (unsubscribe) return
    unsubscribe = api.subscribeToEvents((evt) => {
      if (evt.type === 'device_updated') {
        upsertDevice(evt.device)
      } else if (evt.type === 'device_removed') {
        removeFromState(evt.deviceId)
      }
    })
  }

  const unsubscribeEvents = () => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  return {
    devices,
    states,
    deviceList,
    loading,
    lastError,
    hasDevice,
    getDevice,
    getState,
    searchDevices,
    validateRegistration,
    refreshAll,
    refreshDevice,
    registerDevice,
    removeDevice,
    toggleDevice,
    setMode,
    setAutoTimes,
    startOffTimer,
    cancelOffTimer,
    fetchLogs,
    subscribeEvents,
    unsubscribeEvents,
  }
})
