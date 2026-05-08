export interface Device {
  id: string
  location: string
  createdAt: string
}

export interface HistoryEntry {
  isOn: boolean
  updatedAt: string
}

export type ControlMode = 'manual' | 'auto'

export interface DeviceState {
  isOn: boolean
  lastUpdatedAt: string | null
  controlMode: ControlMode
  autoOnTime: string
  autoOffTime: string
  history: HistoryEntry[]
  offTimerEndsAt: string | null
}

export const createDefaultState = (): DeviceState => ({
  isOn: false,
  lastUpdatedAt: null,
  controlMode: 'manual',
  autoOnTime: '18:00',
  autoOffTime: '23:00',
  history: [],
  offTimerEndsAt: null,
})
