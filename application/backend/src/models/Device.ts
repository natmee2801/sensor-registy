import { Schema, model } from 'mongoose'
import { HHMM_PATTERN } from '../lib/time.ts'

export const ID_PATTERN = /^[A-Za-z0-9_-]+$/
export const ID_MAX = 64
export const LOCATION_MAX = 80
export const MAC_PATTERN = /^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/

export const OUTPUT_IDS = ['out1', 'out2'] as const
export type OutputId = (typeof OUTPUT_IDS)[number]

export interface IOutputState {
  isOn: boolean
  lastUpdatedAt: Date | null
  controlMode: 'manual' | 'auto'
  autoOnTime: string
  autoOffTime: string
  offTimerEndsAt: Date | null
}

export interface IDeviceState {
  isOnline: boolean
  lastSeenAt: Date | null
  mac: string | null
  outputs: {
    out1: IOutputState
    out2: IOutputState
  }
}

export interface IDevice {
  _id: string
  location: string
  createdAt: Date
  state: IDeviceState
}

const outputStateSchema = new Schema<IOutputState>(
  {
    isOn: { type: Boolean, default: false },
    lastUpdatedAt: { type: Date, default: null },
    controlMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    autoOnTime: { type: String, match: HHMM_PATTERN, default: '18:00' },
    autoOffTime: { type: String, match: HHMM_PATTERN, default: '23:00' },
    offTimerEndsAt: { type: Date, default: null },
  },
  { _id: false },
)

const deviceStateSchema = new Schema<IDeviceState>(
  {
    isOnline: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: null },
    mac: { type: String, default: null },
    outputs: {
      type: new Schema(
        {
          out1: { type: outputStateSchema, default: () => ({}) },
          out2: { type: outputStateSchema, default: () => ({}) },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { _id: false },
)

const deviceSchema = new Schema<IDevice>(
  {
    _id: { type: String, required: true, match: ID_PATTERN, maxlength: ID_MAX },
    location: { type: String, required: true, trim: true, maxlength: LOCATION_MAX },
    createdAt: { type: Date, required: true, default: () => new Date() },
    state: { type: deviceStateSchema, default: () => ({}) },
  },
  { versionKey: false, minimize: false },
)

deviceSchema.index({ 'state.outputs.out1.controlMode': 1 })
deviceSchema.index({ 'state.outputs.out2.controlMode': 1 })
deviceSchema.index({ 'state.outputs.out1.offTimerEndsAt': 1 }, { sparse: true })
deviceSchema.index({ 'state.outputs.out2.offTimerEndsAt': 1 }, { sparse: true })
deviceSchema.index({ 'state.mac': 1 }, { sparse: true })

export type DeviceDoc = IDevice

export const Device = model<IDevice>('Device', deviceSchema, 'devices')
