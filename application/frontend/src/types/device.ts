export type ControlMode = 'manual' | 'auto'

export const OUTPUT_IDS = ['out1', 'out2'] as const
export type OutputId = (typeof OUTPUT_IDS)[number]

export const OUTPUT_LABELS: Record<OutputId, string> = {
  out1: 'หลอด 1',
  out2: 'หลอด 2',
}

export type BrightnessLevel = 'off' | 'low' | 'high'
export const BRIGHTNESS_LEVELS: BrightnessLevel[] = ['off', 'low', 'high']
export const BRIGHTNESS_LABELS: Record<BrightnessLevel, string> = {
  off: 'ปิด',
  low: 'หรี่',
  high: 'สว่าง',
}
// Map per-output history events → brightness chip text (out1 toggle = reaches LOW; out2 = HIGH)
export const OUTPUT_BRIGHTNESS_CHIP: Record<OutputId, string> = {
  out1: 'หรี่',
  out2: 'สว่าง',
}

export interface OutputState {
  isOn: boolean
  lastUpdatedAt: string | null
  controlMode: ControlMode
  autoOnTime: string
  autoOffTime: string
  offTimerEndsAt: string | null
}

export interface DeviceState {
  isOnline: boolean
  lastSeenAt: string | null
  mac: string | null
  outputs: Record<OutputId, OutputState>
}

export interface Device {
  id: string
  location: string
  createdAt: string
  state: DeviceState
}

export type LogType =
  | 'toggle'
  | 'mode_change'
  | 'timer_set'
  | 'timer_cancel'
  | 'auto_on'
  | 'auto_off'
  | 'timer_expired'
  | 'cmd_ack'
  | 'cmd_timeout'
  | 'device_online'
  | 'device_offline'
  | 'hb_sync'
  | 'paired'

export type LogDirection = 'in' | 'out' | 'internal'

export interface PairingSession {
  mac: string
  proposedId: string
  model: string | null
  fw: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export interface DeviceLog {
  _id: string
  deviceId: string
  type: LogType
  direction: LogDirection
  output: OutputId | null
  isOn: boolean | null
  controlMode: ControlMode | null
  meta: unknown
  createdAt: string
}

const createDefaultOutput = (): OutputState => ({
  isOn: false,
  lastUpdatedAt: null,
  controlMode: 'manual',
  autoOnTime: '18:00',
  autoOffTime: '23:00',
  offTimerEndsAt: null,
})

export const createDefaultState = (): DeviceState => ({
  isOnline: false,
  lastSeenAt: null,
  mac: null,
  outputs: {
    out1: createDefaultOutput(),
    out2: createDefaultOutput(),
  },
})
