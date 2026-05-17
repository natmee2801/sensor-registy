export type ControlMode = 'manual' | 'auto'

export interface DeviceState {
  isOn: boolean
  lastUpdatedAt: string | null
  controlMode: ControlMode
  autoOnTime: string
  autoOffTime: string
  offTimerEndsAt: string | null
  isOnline: boolean
  lastSeenAt: string | null
  mac: string | null
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
  | 'paired'

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
  isOn: boolean | null
  controlMode: ControlMode | null
  meta: unknown
  createdAt: string
}

export const createDefaultState = (): DeviceState => ({
  isOn: false,
  lastUpdatedAt: null,
  controlMode: 'manual',
  autoOnTime: '18:00',
  autoOffTime: '23:00',
  offTimerEndsAt: null,
  isOnline: false,
  lastSeenAt: null,
  mac: null,
})
