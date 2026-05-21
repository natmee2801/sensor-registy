import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/services/api'
import { ApiError } from '@/services/api'
import {
  OUTPUT_IDS,
  type BrightnessLevel,
  type ControlMode,
  type Device,
  type DeviceLog,
  type DeviceState,
  type OutputId,
  type OutputState,
  type PairingSession,
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
  const getOutput = (id: string, outputId: OutputId): OutputState | null =>
    devices.value[id]?.state.outputs[outputId] ?? null

  const onCount = (id: string): { on: number; total: number } => {
    const state = devices.value[id]?.state
    if (!state) return { on: 0, total: OUTPUT_IDS.length }
    let on = 0
    for (const o of OUTPUT_IDS) if (state.outputs[o].isOn) on++
    return { on, total: OUTPUT_IDS.length }
  }
  const anyOn = (id: string) => onCount(id).on > 0
  const allOn = (id: string) => {
    const c = onCount(id)
    return c.on === c.total
  }
  const allAuto = (id: string): boolean => {
    const state = devices.value[id]?.state
    if (!state) return false
    return OUTPUT_IDS.every((o) => state.outputs[o].controlMode === 'auto')
  }

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

  const toggleOutput = async (id: string, outputId: OutputId) => {
    const device = await api.toggleOutput(id, outputId)
    upsertDevice(device)
  }

  const toggleAll = async (id: string, isOn: boolean) => {
    const device = await api.toggleAll(id, isOn)
    upsertDevice(device)
  }

  const setMode = async (id: string, outputId: OutputId, mode: ControlMode) => {
    const device = await api.setMode(id, outputId, mode)
    upsertDevice(device)
  }

  const setAutoTimes = async (
    id: string,
    outputId: OutputId,
    autoOnTime: string,
    autoOffTime: string,
  ) => {
    const device = await api.setAutoTimes(id, outputId, autoOnTime, autoOffTime)
    upsertDevice(device)
  }

  const startOffTimer = async (id: string, outputId: OutputId, durationMs: number) => {
    const device = await api.startOffTimer(id, outputId, durationMs)
    upsertDevice(device)
  }

  const cancelOffTimer = async (id: string, outputId: OutputId) => {
    const device = await api.cancelOffTimer(id, outputId)
    upsertDevice(device)
  }

  const getBrightness = (id: string): BrightnessLevel => {
    const s = devices.value[id]?.state
    if (!s) return 'off'
    const o1 = s.outputs.out1.isOn
    const o2 = s.outputs.out2.isOn
    if (!o1 && !o2) return 'off'
    if (o1 && o2) return 'high'
    return 'low'
  }

  const getDeviceMode = (id: string): ControlMode => {
    const s = devices.value[id]?.state
    if (!s) return 'manual'
    return OUTPUT_IDS.some((o) => s.outputs[o].controlMode === 'auto') ? 'auto' : 'manual'
  }

  const getDeviceAutoTimes = (
    id: string,
  ): { autoOnTime: string; autoOffTime: string; level: Exclude<BrightnessLevel, 'off'> } | null => {
    const s = devices.value[id]?.state
    if (!s) return null
    const o1 = s.outputs.out1
    const o2 = s.outputs.out2
    if (o1.controlMode !== 'auto' && o2.controlMode !== 'auto') return null
    const src = o1.controlMode === 'auto' ? o1 : o2
    const level: 'low' | 'high' =
      o1.controlMode === 'auto' &&
      o2.controlMode === 'auto' &&
      o1.autoOnTime === o2.autoOnTime &&
      o1.autoOffTime === o2.autoOffTime
        ? 'high'
        : 'low'
    return { autoOnTime: src.autoOnTime, autoOffTime: src.autoOffTime, level }
  }

  const getDeviceOffTimer = (id: string): Date | null => {
    const s = devices.value[id]?.state
    if (!s) return null
    const ends = OUTPUT_IDS.map((o) => s.outputs[o].offTimerEndsAt).filter(
      (v): v is string => !!v,
    )
    if (ends.length === 0) return null
    return new Date(Math.max(...ends.map((v) => new Date(v).getTime())))
  }

  const setBrightness = async (id: string, level: BrightnessLevel) => {
    const s = devices.value[id]?.state
    if (!s) return
    for (const o of OUTPUT_IDS) {
      if (s.outputs[o].offTimerEndsAt) await cancelOffTimer(id, o)
    }
    const o1 = devices.value[id]?.state.outputs.out1.isOn ?? false
    const o2 = devices.value[id]?.state.outputs.out2.isOn ?? false
    if (level === 'off') {
      if (o1 || o2) await toggleAll(id, false)
      return
    }
    if (level === 'high') {
      if (!o1 && !o2) {
        await toggleAll(id, true)
        return
      }
      if (!o1) await toggleOutput(id, 'out1')
      if (!devices.value[id]?.state.outputs.out2.isOn) await toggleOutput(id, 'out2')
      return
    }
    // low — canonical: out1 on, out2 off
    if (o2) await toggleOutput(id, 'out2')
    if (!devices.value[id]?.state.outputs.out1.isOn) await toggleOutput(id, 'out1')
  }

  const setManualMode = async (id: string) => {
    for (const o of OUTPUT_IDS) {
      if (devices.value[id]?.state.outputs[o].controlMode !== 'manual') {
        await setMode(id, o, 'manual')
      }
    }
  }

  const setAutoBrightness = async (
    id: string,
    level: 'low' | 'high',
    autoOnTime: string,
    autoOffTime: string,
  ) => {
    for (const o of OUTPUT_IDS) {
      if (devices.value[id]?.state.outputs[o].offTimerEndsAt) await cancelOffTimer(id, o)
    }
    if (level === 'low') {
      if (devices.value[id]?.state.outputs.out2.controlMode !== 'manual') {
        await setMode(id, 'out2', 'manual')
      }
      if (devices.value[id]?.state.outputs.out2.isOn) {
        await toggleOutput(id, 'out2')
      }
      await setAutoTimes(id, 'out1', autoOnTime, autoOffTime)
      await setMode(id, 'out1', 'auto')
      return
    }
    await setAutoTimes(id, 'out1', autoOnTime, autoOffTime)
    await setAutoTimes(id, 'out2', autoOnTime, autoOffTime)
    await setMode(id, 'out1', 'auto')
    await setMode(id, 'out2', 'auto')
  }

  const startBrightnessTimer = async (id: string, durationMs: number) => {
    const s = devices.value[id]?.state
    if (!s) return
    for (const o of OUTPUT_IDS) {
      if (s.outputs[o].isOn && s.outputs[o].controlMode === 'manual') {
        await startOffTimer(id, o, durationMs)
      }
    }
  }

  const cancelBrightnessTimer = async (id: string) => {
    const s = devices.value[id]?.state
    if (!s) return
    for (const o of OUTPUT_IDS) {
      if (s.outputs[o].offTimerEndsAt) await cancelOffTimer(id, o)
    }
  }

  const fetchLogs = async (
    id: string,
    opts?: { limit?: number; before?: string; output?: OutputId },
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
    getOutput,
    onCount,
    anyOn,
    allOn,
    allAuto,
    searchDevices,
    refreshAll,
    refreshDevice,
    fetchUnclaimed,
    claimDevice,
    removeDevice,
    toggleOutput,
    toggleAll,
    setMode,
    setAutoTimes,
    startOffTimer,
    cancelOffTimer,
    getBrightness,
    getDeviceMode,
    getDeviceAutoTimes,
    getDeviceOffTimer,
    setBrightness,
    setManualMode,
    setAutoBrightness,
    startBrightnessTimer,
    cancelBrightnessTimer,
    fetchLogs,
    subscribeEvents,
    unsubscribeEvents,
  }
})
