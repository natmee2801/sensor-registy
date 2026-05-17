import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/services/api'
import { ApiError } from '@/services/api'
import type {
  ControlMode,
  Device,
  DeviceLog,
  DeviceState,
  PairingSession,
} from '@/types/device'

const LOCATION_MAX = 80

export interface ValidationError {
  field: 'location' | 'mac'
  message: string
}

export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<Record<string, Device>>({})
  const unclaimed = ref<Record<string, PairingSession>>({})
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  const deviceList = computed<Device[]>(() =>
    Object.values(devices.value).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  )

  const unclaimedList = computed<PairingSession[]>(() =>
    Object.values(unclaimed.value).sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt)),
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

  const upsertDevice = (device: Device) => {
    devices.value = { ...devices.value, [device.id]: device }
  }

  const removeFromState = (id: string) => {
    if (!hasDevice(id)) return
    const next = { ...devices.value }
    delete next[id]
    devices.value = next
  }

  const upsertUnclaimed = (session: PairingSession) => {
    unclaimed.value = { ...unclaimed.value, [session.mac]: session }
  }

  const removeUnclaimed = (mac: string) => {
    if (!Object.prototype.hasOwnProperty.call(unclaimed.value, mac)) return
    const next = { ...unclaimed.value }
    delete next[mac]
    unclaimed.value = next
  }

  const refreshAll = async () => {
    loading.value = true
    try {
      const [list, pairings] = await Promise.all([api.listDevices(), api.listUnclaimed()])
      const map: Record<string, Device> = {}
      for (const d of list) map[d.id] = d
      devices.value = map
      const pmap: Record<string, PairingSession> = {}
      for (const p of pairings) pmap[p.mac] = p
      unclaimed.value = pmap
      lastError.value = null
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : 'unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  const fetchUnclaimed = async () => {
    const list = await api.listUnclaimed()
    const map: Record<string, PairingSession> = {}
    for (const p of list) map[p.mac] = p
    unclaimed.value = map
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

  const claimDevice = async (
    mac: string,
    rawLocation: string,
  ): Promise<{ ok: true; id: string } | { ok: false; errors: ValidationError[] }> => {
    const location = rawLocation.trim()
    const localErrors: ValidationError[] = []
    if (!location) {
      localErrors.push({ field: 'location', message: 'กรุณากรอกตำแหน่ง/ห้อง' })
    } else if (location.length > LOCATION_MAX) {
      localErrors.push({ field: 'location', message: `ตำแหน่งต้องไม่เกิน ${LOCATION_MAX} ตัวอักษร` })
    }
    if (localErrors.length > 0) return { ok: false, errors: localErrors }

    try {
      const device = await api.claimDevice({ mac, location })
      upsertDevice(device)
      removeUnclaimed(mac)
      return { ok: true, id: device.id }
    } catch (err) {
      if (err instanceof ApiError) {
        const errors: ValidationError[] = []
        if (err.fields && err.fields.length > 0) {
          for (const f of err.fields) {
            const field = f.field === 'location' || f.field === 'mac' ? f.field : 'location'
            errors.push({ field, message: f.message })
          }
        } else {
          errors.push({ field: 'location', message: err.message })
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
      } else if (evt.type === 'pair_announced') {
        upsertUnclaimed(evt.session)
      } else if (evt.type === 'pair_claimed') {
        removeUnclaimed(evt.mac)
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
    unclaimed,
    states,
    deviceList,
    unclaimedList,
    loading,
    lastError,
    hasDevice,
    getDevice,
    getState,
    searchDevices,
    refreshAll,
    refreshDevice,
    fetchUnclaimed,
    claimDevice,
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
