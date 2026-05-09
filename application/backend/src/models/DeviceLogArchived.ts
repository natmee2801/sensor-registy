import { model } from 'mongoose'
import { deviceLogSchema } from './DeviceLog.ts'

export const DeviceLogArchived = model(
  'DeviceLogArchived',
  deviceLogSchema.clone(),
  'device_logs_archived',
)
