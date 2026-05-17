import { Schema, model, type InferSchemaType } from 'mongoose'

export const LOG_TYPES = [
  'toggle',
  'mode_change',
  'timer_set',
  'timer_cancel',
  'auto_on',
  'auto_off',
  'timer_expired',
  'cmd_ack',
  'cmd_timeout',
  'device_online',
  'device_offline',
  'paired',
] as const

export type LogType = (typeof LOG_TYPES)[number]

export const deviceLogSchema = new Schema(
  {
    deviceId: { type: String, required: true, ref: 'Device' },
    type: { type: String, enum: LOG_TYPES, required: true },
    isOn: { type: Boolean, default: null },
    controlMode: { type: String, enum: ['manual', 'auto'], default: null },
    meta: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
)

deviceLogSchema.index({ deviceId: 1, createdAt: -1 })
deviceLogSchema.index({ createdAt: 1 })

export type DeviceLogDoc = InferSchemaType<typeof deviceLogSchema>

export const DeviceLog = model('DeviceLog', deviceLogSchema, 'device_logs')
