import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  type ControlMode,
  type Device,
  type DeviceState,
  type HistoryEntry,
  createDefaultState,
} from '@/types/device'

const DEVICES_KEY = 'sensor-registry:devices'
const STATES_KEY = 'sensor-registry:device-states'

const LEGACY_KEYS = [
  'bulb-light-status',
  'bulb-light-updated-at',
  'bulb-light-history',
  'bulb-light-mode',
  'bulb-light-auto-on-time',
  'bulb-light-auto-off-time',
]

const HISTORY_LIMIT = 10
const ID_MAX = 64
const LOCATION_MAX = 80
const ID_PATTERN = /^[A-Za-z0-9_-]+$/

export interface ValidationError {
  field: 'id' | 'location'
  message: string
}

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const parseHourMinute = (time: string): number => {
  const [hourText = '0', minuteText = '0'] = time.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0
  return hour * 60 + minute
}

const computeShouldBeOn = (now: Date, onTime: string, offTime: string): boolean => {
  const onMinutes = parseHourMinute(onTime)
  const offMinutes = parseHourMinute(offTime)
  if (onMinutes === offMinutes) return false
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return onMinutes < offMinutes
    ? currentMinutes >= onMinutes && currentMinutes < offMinutes
    : currentMinutes >= onMinutes || currentMinutes < offMinutes
}

const normalizeState = (raw: Partial<DeviceState>): DeviceState => {
  const base = createDefaultState()
  return {
    isOn: raw.isOn ?? base.isOn,
    lastUpdatedAt: raw.lastUpdatedAt ?? base.lastUpdatedAt,
    controlMode: raw.controlMode ?? base.controlMode,
    autoOnTime: raw.autoOnTime ?? base.autoOnTime,
    autoOffTime: raw.autoOffTime ?? base.autoOffTime,
    history: raw.history ?? base.history,
    offTimerEndsAt: raw.offTimerEndsAt ?? base.offTimerEndsAt,
  }
}

const normalizeStates = (raw: Record<string, Partial<DeviceState>>): Record<string, DeviceState> => {
  const out: Record<string, DeviceState> = {}
  for (const [id, value] of Object.entries(raw)) {
    out[id] = normalizeState(value)
  }
  return out
}

const migrateLegacyIfPresent = (): {
  devices: Record<string, Device>
  states: Record<string, DeviceState>
} | null => {
  if (typeof window === 'undefined') return null
  if (localStorage.getItem(DEVICES_KEY) !== null) return null

  const hasLegacy = LEGACY_KEYS.some((key) => localStorage.getItem(key) !== null)
  if (!hasLegacy) return null

  const legacyStatus = localStorage.getItem('bulb-light-status') === 'true'
  const legacyUpdatedAt = localStorage.getItem('bulb-light-updated-at')
  const legacyHistory = safeParse<HistoryEntry[]>(
    localStorage.getItem('bulb-light-history'),
    [],
  )
  const legacyMode = localStorage.getItem('bulb-light-mode')
  const legacyOnTime = localStorage.getItem('bulb-light-auto-on-time') ?? '18:00'
  const legacyOffTime = localStorage.getItem('bulb-light-auto-off-time') ?? '23:00'

  const id = 'default'
  const device: Device = {
    id,
    location: 'อุปกรณ์เดิม',
    createdAt: legacyUpdatedAt ?? new Date().toISOString(),
  }
  const state: DeviceState = normalizeState({
    isOn: legacyStatus,
    lastUpdatedAt: legacyUpdatedAt,
    controlMode: legacyMode === 'auto' ? 'auto' : 'manual',
    autoOnTime: legacyOnTime,
    autoOffTime: legacyOffTime,
    history: legacyHistory.slice(0, HISTORY_LIMIT),
  })

  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key))
  return { devices: { [id]: device }, states: { [id]: state } }
}

const loadInitial = () => {
  if (typeof window === 'undefined') {
    return { devices: {} as Record<string, Device>, states: {} as Record<string, DeviceState> }
  }

  const migrated = migrateLegacyIfPresent()
  if (migrated) return migrated

  return {
    devices: safeParse<Record<string, Device>>(localStorage.getItem(DEVICES_KEY), {}),
    states: normalizeStates(
      safeParse<Record<string, Partial<DeviceState>>>(localStorage.getItem(STATES_KEY), {}),
    ),
  }
}

export const useDevicesStore = defineStore('devices', () => {
  const initial = loadInitial()
  const devices = ref<Record<string, Device>>(initial.devices)
  const states = ref<Record<string, DeviceState>>(initial.states)

  const deviceList = computed<Device[]>(() =>
    Object.values(devices.value).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  )

  const hasDevice = (id: string) => Object.prototype.hasOwnProperty.call(devices.value, id)

  const getDevice = (id: string): Device | null => devices.value[id] ?? null

  const getState = (id: string): DeviceState | null => states.value[id] ?? null

  const searchDevices = (query: string): Device[] => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return deviceList.value
    return deviceList.value.filter(
      (device) =>
        device.id.toLowerCase().includes(trimmed) ||
        device.location.toLowerCase().includes(trimmed),
    )
  }

  const validateRegistration = (
    rawId: string,
    rawLocation: string,
  ): ValidationError[] => {
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

  const applyAutoSchedule = (id: string, now: Date = new Date()) => {
    const state = states.value[id]
    if (!state || state.controlMode !== 'auto') return
    const shouldBeOn = computeShouldBeOn(now, state.autoOnTime, state.autoOffTime)
    if (state.isOn !== shouldBeOn) {
      applyToggle(id, shouldBeOn, now.toISOString())
    }
  }

  const applyToggle = (id: string, nextOn: boolean, timestamp: string) => {
    const state = states.value[id]
    if (!state) return
    state.isOn = nextOn
    state.lastUpdatedAt = timestamp
    state.history = [{ isOn: nextOn, updatedAt: timestamp }, ...state.history].slice(0, HISTORY_LIMIT)
    if (!nextOn) state.offTimerEndsAt = null
  }

  const processOffTimer = (id: string, now: Date) => {
    const state = states.value[id]
    if (!state || state.offTimerEndsAt === null) return
    if (new Date(state.offTimerEndsAt).getTime() <= now.getTime()) {
      if (state.isOn) {
        applyToggle(id, false, now.toISOString())
      } else {
        state.offTimerEndsAt = null
      }
    }
  }

  const registerDevice = (rawId: string, rawLocation: string): { ok: true; id: string } | { ok: false; errors: ValidationError[] } => {
    const errors = validateRegistration(rawId, rawLocation)
    if (errors.length > 0) return { ok: false, errors }

    const id = rawId.trim()
    const location = rawLocation.trim()
    const createdAt = new Date().toISOString()

    devices.value = { ...devices.value, [id]: { id, location, createdAt } }
    states.value = { ...states.value, [id]: createDefaultState() }
    applyAutoSchedule(id)
    return { ok: true, id }
  }

  const removeDevice = (id: string) => {
    if (!hasDevice(id)) return
    const nextDevices = { ...devices.value }
    delete nextDevices[id]
    devices.value = nextDevices

    const nextStates = { ...states.value }
    delete nextStates[id]
    states.value = nextStates
  }

  const toggleDevice = (id: string) => {
    const state = states.value[id]
    if (!state || state.controlMode === 'auto') return
    applyToggle(id, !state.isOn, new Date().toISOString())
  }

  const setMode = (id: string, mode: ControlMode) => {
    const state = states.value[id]
    if (!state) return
    state.controlMode = mode
    if (mode === 'auto') state.offTimerEndsAt = null
    applyAutoSchedule(id)
  }

  const setAutoTimes = (id: string, onTime: string, offTime: string) => {
    const state = states.value[id]
    if (!state) return
    state.autoOnTime = onTime
    state.autoOffTime = offTime
    applyAutoSchedule(id)
  }

  const startOffTimer = (id: string, durationMs: number) => {
    const state = states.value[id]
    if (!state || !state.isOn || state.controlMode !== 'manual') return
    state.offTimerEndsAt = new Date(Date.now() + durationMs).toISOString()
  }

  const cancelOffTimer = (id: string) => {
    const state = states.value[id]
    if (!state) return
    state.offTimerEndsAt = null
  }

  const tick = () => {
    const now = new Date()
    Object.keys(states.value).forEach((id) => {
      processOffTimer(id, now)
      applyAutoSchedule(id, now)
    })
  }

  if (typeof window !== 'undefined') {
    let lastDevicesJson = JSON.stringify(devices.value)
    let lastStatesJson = JSON.stringify(states.value)

    watch(
      devices,
      (next) => {
        const json = JSON.stringify(next)
        if (json === lastDevicesJson) return
        lastDevicesJson = json
        localStorage.setItem(DEVICES_KEY, json)
      },
      { deep: true, flush: 'post' },
    )

    watch(
      states,
      (next) => {
        const json = JSON.stringify(next)
        if (json === lastStatesJson) return
        lastStatesJson = json
        localStorage.setItem(STATES_KEY, json)
      },
      { deep: true, flush: 'post' },
    )

    window.addEventListener('storage', (event) => {
      if (event.key === DEVICES_KEY && event.newValue !== null) {
        if (event.newValue === lastDevicesJson) return
        const next = safeParse<Record<string, Device>>(event.newValue, devices.value)
        lastDevicesJson = event.newValue
        devices.value = next
      } else if (event.key === STATES_KEY && event.newValue !== null) {
        if (event.newValue === lastStatesJson) return
        const next = safeParse<Record<string, DeviceState>>(event.newValue, states.value)
        lastStatesJson = event.newValue
        states.value = next
      }
    })
  }

  return {
    devices,
    states,
    deviceList,
    hasDevice,
    getDevice,
    getState,
    searchDevices,
    validateRegistration,
    registerDevice,
    removeDevice,
    toggleDevice,
    setMode,
    setAutoTimes,
    startOffTimer,
    cancelOffTimer,
    tick,
  }
})
