import { Device } from '../models/Device.ts'
import { DeviceLog, type LogType } from '../models/DeviceLog.ts'
import { computeShouldBeOn } from '../lib/time.ts'
import { appBus } from './events.ts'
import * as mqtt from './mqtt.ts'
import { logger } from '../lib/logger.ts'

export class NotFoundError extends Error {
  constructor(message = 'ไม่พบรายการที่ต้องการ') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class StateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StateError'
  }
}

const writeLog = async (
  deviceId: string,
  type: LogType,
  extra: { isOn?: boolean | null; controlMode?: 'manual' | 'auto' | null; meta?: unknown } = {},
) => {
  await DeviceLog.create({
    deviceId,
    type,
    isOn: extra.isOn ?? null,
    controlMode: extra.controlMode ?? null,
    meta: extra.meta ?? null,
  })
}

export const listDevices = async (q?: string) => {
  const all = await Device.find().sort({ createdAt: 1 }).lean()
  if (!q || !q.trim()) return all
  const needle = q.trim().toLowerCase()
  return all.filter(
    (d) => d._id.toLowerCase().includes(needle) || d.location.toLowerCase().includes(needle),
  )
}

export const getDevice = async (id: string) => {
  const doc = await Device.findById(id).lean()
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  return doc
}

export const removeDevice = async (id: string) => {
  const doc = await Device.findById(id).lean()
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  await Device.deleteOne({ _id: id })
  await DeviceLog.deleteMany({ deviceId: id })
  appBus.emitDeviceRemoved(id)

  const mac = doc.state?.mac
  if (mac) {
    mqtt.clearPairAck(mac).catch((err) => {
      logger.warn({ err, mac }, 'mqtt clearPairAck failed')
    })
  }
  mqtt.clearDeviceLwt(id).catch((err) => {
    logger.warn({ err, deviceId: id }, 'mqtt clearDeviceLwt failed')
  })
}

export const toggleDevice = async (id: string) => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  if (doc.state.controlMode === 'auto') {
    throw new StateError('โหมดอัตโนมัติกำลังควบคุมอยู่ ไม่สามารถสลับด้วยตนเอง')
  }
  if (!doc.state.isOnline) {
    throw new StateError('อุปกรณ์ออฟไลน์ ไม่สามารถสั่งงานได้')
  }
  const nextOn = !doc.state.isOn
  await applyToggle(id, nextOn, 'toggle')
  return getDevice(id)
}

export const setMode = async (id: string, mode: 'manual' | 'auto') => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  if (doc.state.controlMode === mode) return doc.toObject()

  doc.state.controlMode = mode
  if (mode === 'auto') doc.state.offTimerEndsAt = null
  await doc.save()
  await writeLog(id, 'mode_change', { controlMode: mode })

  if (mode === 'auto') await applyAutoScheduleIfNeeded(id)

  const fresh = await getDevice(id)
  appBus.emitDeviceUpdated(fresh)
  return fresh
}

export const setAutoTimes = async (id: string, autoOnTime: string, autoOffTime: string) => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  doc.state.autoOnTime = autoOnTime
  doc.state.autoOffTime = autoOffTime
  await doc.save()
  if (doc.state.controlMode === 'auto') await applyAutoScheduleIfNeeded(id)
  const fresh = await getDevice(id)
  appBus.emitDeviceUpdated(fresh)
  return fresh
}

export const startOffTimer = async (id: string, durationMs: number) => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  if (!doc.state.isOn) throw new StateError('ตั้งตัวจับเวลาได้เมื่อไฟเปิดอยู่เท่านั้น')
  if (doc.state.controlMode !== 'manual') {
    throw new StateError('ตั้งตัวจับเวลาได้เฉพาะโหมดควบคุมเอง')
  }
  const endsAt = new Date(Date.now() + durationMs)
  doc.state.offTimerEndsAt = endsAt
  await doc.save()
  await writeLog(id, 'timer_set', { meta: { offTimerEndsAt: endsAt.toISOString() } })
  const fresh = await getDevice(id)
  appBus.emitDeviceUpdated(fresh)
  return fresh
}

export const cancelOffTimer = async (id: string) => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  if (doc.state.offTimerEndsAt === null) return doc.toObject()
  doc.state.offTimerEndsAt = null
  await doc.save()
  await writeLog(id, 'timer_cancel')
  const fresh = await getDevice(id)
  appBus.emitDeviceUpdated(fresh)
  return fresh
}

const applyToggle = async (id: string, nextOn: boolean, logType: LogType) => {
  const doc = await Device.findById(id)
  if (!doc) return
  doc.state.isOn = nextOn
  doc.state.lastUpdatedAt = new Date()
  if (!nextOn) doc.state.offTimerEndsAt = null
  await doc.save()
  await writeLog(id, logType, { isOn: nextOn })
  const fresh = await Device.findById(id).lean()
  if (fresh) appBus.emitDeviceUpdated(fresh)
  mqtt.publishCommand(id, nextOn).catch((err) => {
    logger.warn({ err, deviceId: id }, 'mqtt publishCommand failed')
  })
}

export const handleAck = async (
  deviceId: string,
  payload: { cmdId: string; status: 'applied' | 'error'; isOn?: boolean },
) => {
  const doc = await Device.findById(deviceId)
  if (!doc) return

  const wasOffline = !doc.state.isOnline
  if (wasOffline) {
    doc.state.isOnline = true
    doc.state.lastSeenAt = new Date()
  }
  if (typeof payload.isOn === 'boolean' && payload.isOn !== doc.state.isOn) {
    doc.state.isOn = payload.isOn
    doc.state.lastUpdatedAt = new Date()
  }
  await doc.save()

  await writeLog(deviceId, 'cmd_ack', {
    isOn: payload.isOn ?? null,
    meta: { cmdId: payload.cmdId, status: payload.status },
  })
  if (wasOffline) {
    await writeLog(deviceId, 'device_online', {
      isOn: payload.isOn ?? null,
      meta: { reason: 'cmd_ack_after_offline' },
    })
  }
  const fresh = await Device.findById(deviceId).lean()
  if (fresh) appBus.emitDeviceUpdated(fresh)
}

export const handleCmdTimeout = async (deviceId: string, cmdId: string) => {
  const doc = await Device.findById(deviceId)
  if (!doc) return
  await writeLog(deviceId, 'cmd_timeout', { meta: { cmdId } })

  if (doc.state.isOnline) {
    doc.state.isOnline = false
    await doc.save()
    await writeLog(deviceId, 'device_offline', { meta: { reason: 'cmd_timeout' } })
    const fresh = await Device.findById(deviceId).lean()
    if (fresh) appBus.emitDeviceUpdated(fresh)
  }
}

export const handleHeartbeat = async (
  deviceId: string,
  payload: { isOn?: boolean; rssi?: number; uptime?: number },
) => {
  const doc = await Device.findById(deviceId)
  if (!doc) return
  const wasOnline = doc.state.isOnline
  doc.state.isOnline = true
  doc.state.lastSeenAt = new Date()

  let drifted = false
  if (typeof payload.isOn === 'boolean' && payload.isOn !== doc.state.isOn) {
    doc.state.isOn = payload.isOn
    doc.state.lastUpdatedAt = new Date()
    drifted = true
  }
  await doc.save()

  if (!wasOnline) {
    await writeLog(deviceId, 'device_online', {
      isOn: payload.isOn ?? null,
      meta: { rssi: payload.rssi ?? null, uptime: payload.uptime ?? null },
    })
  }
  if (drifted) {
    await writeLog(deviceId, 'hb_sync', {
      isOn: payload.isOn ?? null,
      meta: { reason: 'heartbeat reported isOn differs from db' },
    })
  }
  const fresh = await Device.findById(deviceId).lean()
  if (fresh) appBus.emitDeviceUpdated(fresh)
}

export const handleLwt = async (deviceId: string) => {
  const doc = await Device.findById(deviceId)
  if (!doc || !doc.state.isOnline) return
  doc.state.isOnline = false
  await doc.save()
  await writeLog(deviceId, 'device_offline')
  const fresh = await Device.findById(deviceId).lean()
  if (fresh) appBus.emitDeviceUpdated(fresh)
}

export const reconcileStaleHeartbeats = async (
  graceMs: number,
  now: Date = new Date(),
) => {
  const threshold = new Date(now.getTime() - graceMs)
  const stale = await Device.find({
    'state.isOnline': true,
    $or: [
      { 'state.lastSeenAt': null },
      { 'state.lastSeenAt': { $lt: threshold } },
    ],
  })
    .select('_id state.lastSeenAt')
    .lean()

  for (const d of stale) {
    try {
      await handleLwt(d._id)
    } catch (err) {
      logger.warn({ err, deviceId: d._id }, 'reconcileStaleHeartbeats failed')
    }
  }
}

export const applyAutoScheduleIfNeeded = async (id: string, now: Date = new Date()) => {
  const doc = await Device.findById(id).lean()
  if (!doc || doc.state.controlMode !== 'auto') return
  if (!doc.state.isOnline) return
  const shouldBeOn = computeShouldBeOn(now, doc.state.autoOnTime, doc.state.autoOffTime)
  if (doc.state.isOn !== shouldBeOn) {
    await applyToggle(id, shouldBeOn, shouldBeOn ? 'auto_on' : 'auto_off')
  }
}

export const expireTimerIfDue = async (id: string, now: Date = new Date()) => {
  const doc = await Device.findById(id).lean()
  if (!doc) return
  const endsAt = doc.state.offTimerEndsAt
  if (!endsAt) return
  if (endsAt.getTime() > now.getTime()) return
  if (doc.state.isOn && doc.state.isOnline) {
    await applyToggle(id, false, 'timer_expired')
  } else {
    await Device.updateOne({ _id: id }, { $set: { 'state.offTimerEndsAt': null } })
    const fresh = await Device.findById(id).lean()
    if (fresh) appBus.emitDeviceUpdated(fresh)
  }
}

export const listLogs = async (
  deviceId: string,
  opts: { limit: number; before?: string },
) => {
  const filter: Record<string, unknown> = { deviceId }
  if (opts.before) filter.createdAt = { $lt: new Date(opts.before) }

  const items = await DeviceLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(opts.limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (items.length > opts.limit) {
    const extra = items.pop()
    if (extra) nextCursor = extra.createdAt.toISOString()
  }
  return { items, nextCursor }
}
