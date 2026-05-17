import { Schema, model, type InferSchemaType } from 'mongoose'
import { HHMM_PATTERN } from '../lib/time.ts'

export const ID_PATTERN = /^[A-Za-z0-9_-]+$/
export const ID_MAX = 64
export const LOCATION_MAX = 80
export const MAC_PATTERN = /^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/

const deviceStateSchema = new Schema(
  {
    isOn: { type: Boolean, default: false },
    lastUpdatedAt: { type: Date, default: null },
    controlMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    autoOnTime: { type: String, match: HHMM_PATTERN, default: '18:00' },
    autoOffTime: { type: String, match: HHMM_PATTERN, default: '23:00' },
    offTimerEndsAt: { type: Date, default: null },
    isOnline: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: null },
    mac: { type: String, default: null },
  },
  { _id: false },
)

const deviceSchema = new Schema(
  {
    _id: { type: String, required: true, match: ID_PATTERN, maxlength: ID_MAX },
    location: { type: String, required: true, trim: true, maxlength: LOCATION_MAX },
    createdAt: { type: Date, required: true, default: () => new Date() },
    state: { type: deviceStateSchema, default: () => ({}) },
  },
  { versionKey: false, minimize: false },
)

deviceSchema.index({ 'state.controlMode': 1 })
deviceSchema.index({ 'state.offTimerEndsAt': 1 }, { sparse: true })
deviceSchema.index({ 'state.mac': 1 }, { sparse: true })

export type DeviceDoc = InferSchemaType<typeof deviceSchema>

export const Device = model('Device', deviceSchema, 'devices')
