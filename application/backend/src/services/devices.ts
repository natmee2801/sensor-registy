import { Device, OUTPUT_IDS, type OutputId } from '../models/Device.ts'
import { DeviceLog, type LogDirection, type LogType } from '../models/DeviceLog.ts'
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
  direction: LogDirection,
  extra: {
    output?: OutputId | null
    isOn?: boolean | null
    controlMode?: 'manual' | 'auto' | null
    meta?: unknown
  } = {},
) => {
  await DeviceLog.create({
    deviceId,
    type,
    direction,
    output: extra.output ?? null,
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
  // บอก ESP ที่ยัง pair อยู่ให้ลืม id แล้ว boot เข้า pairing mode ใหม่
  mqtt.publishWipe(id).catch((err) => {
    logger.warn({ err, deviceId: id }, 'mqtt publishWipe failed')
  })
}

export const toggleDevice = async (id: string, outputId: OutputId) => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  const out = doc.state.outputs[outputId]
  if (out.controlMode === 'auto') {
    throw new StateError('โหมดอัตโนมัติกำลังควบคุมอยู่ ไม่สามารถสลับด้วยตนเอง')
  }
  if (!doc.state.isOnline) {
    throw new StateError('อุปกรณ์ออฟไลน์ ไม่สามารถสั่งงานได้')
  }
  const nextOn = !out.isOn
  await applyToggle(id, outputId, nextOn, 'toggle')
  return getDevice(id)
}

export const toggleAll = async (id: string, isOn: boolean) => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  if (!doc.state.isOnline) {
    throw new StateError('อุปกรณ์ออฟไลน์ ไม่สามารถสั่งงานได้')
  }
  const allAuto = OUTPUT_IDS.every((o) => doc.state.outputs[o].controlMode === 'auto')
  if (allAuto) {
    throw new StateError('ทุกหลอดอยู่โหมดอัตโนมัติ ไม่สามารถสั่งงานได้')
  }
  for (const outputId of OUTPUT_IDS) {
    const out = doc.state.outputs[outputId]
    if (out.controlMode === 'auto') continue
    if (out.isOn === isOn) continue
    await applyToggle(id, outputId, isOn, 'toggle')
  }
  return getDevice(id)
}

export const setMode = async (id: string, outputId: OutputId, mode: 'manual' | 'auto') => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  const out = doc.state.outputs[outputId]
  if (out.controlMode === mode) return doc.toObject()

  out.controlMode = mode
  if (mode === 'auto') out.offTimerEndsAt = null
  doc.markModified(`state.outputs.${outputId}`)
  await doc.save()
  await writeLog(id, 'mode_change', 'internal', { output: outputId, controlMode: mode })

  if (mode === 'auto') await applyAutoScheduleIfNeeded(id, outputId)

  const fresh = await getDevice(id)
  appBus.emitDeviceUpdated(fresh)
  return fresh
}

export const setAutoTimes = async (
  id: string,
  outputId: OutputId,
  autoOnTime: string,
  autoOffTime: string,
) => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  const out = doc.state.outputs[outputId]
  out.autoOnTime = autoOnTime
  out.autoOffTime = autoOffTime
  doc.markModified(`state.outputs.${outputId}`)
  await doc.save()
  if (out.controlMode === 'auto') await applyAutoScheduleIfNeeded(id, outputId)
  const fresh = await getDevice(id)
  appBus.emitDeviceUpdated(fresh)
  return fresh
}

export const startOffTimer = async (id: string, outputId: OutputId, durationMs: number) => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  const out = doc.state.outputs[outputId]
  if (!out.isOn) throw new StateError('ตั้งตัวจับเวลาได้เมื่อไฟเปิดอยู่เท่านั้น')
  if (out.controlMode !== 'manual') {
    throw new StateError('ตั้งตัวจับเวลาได้เฉพาะโหมดควบคุมเอง')
  }
  const endsAt = new Date(Date.now() + durationMs)
  out.offTimerEndsAt = endsAt
  doc.markModified(`state.outputs.${outputId}`)
  await doc.save()
  await writeLog(id, 'timer_set', 'internal', {
    output: outputId,
    meta: { offTimerEndsAt: endsAt.toISOString() },
  })
  const fresh = await getDevice(id)
  appBus.emitDeviceUpdated(fresh)
  return fresh
}

export const cancelOffTimer = async (id: string, outputId: OutputId) => {
  const doc = await Device.findById(id)
  if (!doc) throw new NotFoundError(`ไม่พบ device "${id}"`)
  const out = doc.state.outputs[outputId]
  if (out.offTimerEndsAt === null) return doc.toObject()
  out.offTimerEndsAt = null
  doc.markModified(`state.outputs.${outputId}`)
  await doc.save()
  await writeLog(id, 'timer_cancel', 'internal', { output: outputId })
  const fresh = await getDevice(id)
  appBus.emitDeviceUpdated(fresh)
  return fresh
}

const applyToggle = async (
  id: string,
  outputId: OutputId,
  nextOn: boolean,
  logType: LogType,
) => {
  const doc = await Device.findById(id)
  if (!doc) return
  const out = doc.state.outputs[outputId]
  out.isOn = nextOn
  out.lastUpdatedAt = new Date()
  if (!nextOn) out.offTimerEndsAt = null
  doc.markModified(`state.outputs.${outputId}`)
  await doc.save()
  await writeLog(id, logType, 'out', { output: outputId, isOn: nextOn })
  const fresh = await Device.findById(id).lean()
  if (fresh) appBus.emitDeviceUpdated(fresh)
  mqtt.publishCommand(id, outputId, nextOn).catch((err) => {
    logger.warn({ err, deviceId: id, outputId }, 'mqtt publishCommand failed')
  })
}

export const handleAck = async (
  deviceId: string,
  payload: {
    cmdId: string
    status: 'applied' | 'error'
    output?: OutputId
    isOn?: boolean
  },
) => {
  const doc = await Device.findById(deviceId)
  if (!doc) return
  if (!payload.output || !(OUTPUT_IDS as readonly string[]).includes(payload.output)) {
    logger.warn({ deviceId, payload }, 'ack missing or invalid output field — dropping')
    return
  }
  const outputId = payload.output as OutputId
  const out = doc.state.outputs[outputId]

  const wasOffline = !doc.state.isOnline
  if (wasOffline) {
    doc.state.isOnline = true
    doc.state.lastSeenAt = new Date()
  }
  if (typeof payload.isOn === 'boolean' && payload.isOn !== out.isOn) {
    out.isOn = payload.isOn
    out.lastUpdatedAt = new Date()
    doc.markModified(`state.outputs.${outputId}`)
  }
  await doc.save()

  await writeLog(deviceId, 'cmd_ack', 'in', {
    output: outputId,
    isOn: payload.isOn ?? null,
    meta: { cmdId: payload.cmdId, status: payload.status },
  })
  if (wasOffline) {
    await writeLog(deviceId, 'device_online', 'in', {
      isOn: payload.isOn ?? null,
      meta: { reason: 'cmd_ack_after_offline' },
    })
  }
  const fresh = await Device.findById(deviceId).lean()
  if (fresh) appBus.emitDeviceUpdated(fresh)
}

export const handleCmdTimeout = async (
  deviceId: string,
  outputId: OutputId,
  cmdId: string,
) => {
  const doc = await Device.findById(deviceId)
  if (!doc) return
  await writeLog(deviceId, 'cmd_timeout', 'internal', {
    output: outputId,
    meta: { cmdId },
  })

  if (doc.state.isOnline) {
    doc.state.isOnline = false
    await doc.save()
    await writeLog(deviceId, 'device_offline', 'internal', {
      meta: { reason: 'cmd_timeout' },
    })
    const fresh = await Device.findById(deviceId).lean()
    if (fresh) appBus.emitDeviceUpdated(fresh)
  }
}

// debounce wipe publishes ต่อ device id — กัน log spam ตอน ESP ที่ลบไปแล้ว
// hb เข้ามาทุก 30s ก่อนที่ ESP จะรับ wipe สำเร็จ
const WIPE_DEBOUNCE_MS = 60_000
const recentWipes = new Map<string, number>()

export const handleHeartbeat = async (
  deviceId: string,
  payload: {
    outputs?: Partial<Record<OutputId, { isOn?: boolean }>>
    rssi?: number
    uptime?: number
  },
) => {
  const doc = await Device.findById(deviceId)
  if (!doc) {
    // hb จาก id ที่ไม่อยู่ DB — ESP ค้าง LittleFS หลัง backend ลบ (หรือ DB reset)
    // ส่ง wipe กลับเพื่อให้ ESP re-pair
    const now = Date.now()
    const last = recentWipes.get(deviceId) ?? 0
    if (now - last >= WIPE_DEBOUNCE_MS) {
      recentWipes.set(deviceId, now)
      logger.info({ deviceId }, 'hb from unknown id — publishing wipe')
      mqtt.publishWipe(deviceId).catch((err) => {
        logger.warn({ err, deviceId }, 'mqtt publishWipe (unknown id) failed')
      })
    }
    return
  }
  const wasOnline = doc.state.isOnline
  doc.state.isOnline = true
  doc.state.lastSeenAt = new Date()

  const drifts: { outputId: OutputId; isOn: boolean }[] = []
  if (payload.outputs) {
    for (const outputId of OUTPUT_IDS) {
      const reported = payload.outputs[outputId]?.isOn
      if (typeof reported !== 'boolean') continue
      const out = doc.state.outputs[outputId]
      if (reported !== out.isOn) {
        out.isOn = reported
        out.lastUpdatedAt = new Date()
        doc.markModified(`state.outputs.${outputId}`)
        drifts.push({ outputId, isOn: reported })
      }
    }
  } else {
    logger.warn({ deviceId, payload }, 'heartbeat missing outputs field — skipping drift sync')
  }
  await doc.save()

  if (!wasOnline) {
    await writeLog(deviceId, 'device_online', 'in', {
      meta: { rssi: payload.rssi ?? null, uptime: payload.uptime ?? null },
    })
  }
  for (const d of drifts) {
    await writeLog(deviceId, 'hb_sync', 'in', {
      output: d.outputId,
      isOn: d.isOn,
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
  await writeLog(deviceId, 'device_offline', 'in')
  const fresh = await Device.findById(deviceId).lean()
  if (fresh) appBus.emitDeviceUpdated(fresh)
}

const markOfflineInternal = async (deviceId: string, reason: string) => {
  const doc = await Device.findById(deviceId)
  if (!doc || !doc.state.isOnline) return
  doc.state.isOnline = false
  await doc.save()
  await writeLog(deviceId, 'device_offline', 'internal', { meta: { reason } })
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
      await markOfflineInternal(d._id, 'stale_hb')
    } catch (err) {
      logger.warn({ err, deviceId: d._id }, 'reconcileStaleHeartbeats failed')
    }
  }
}

export const applyAutoScheduleIfNeeded = async (
  id: string,
  outputId: OutputId,
  now: Date = new Date(),
) => {
  const doc = await Device.findById(id).lean()
  if (!doc) return
  const out = doc.state.outputs[outputId]
  if (out.controlMode !== 'auto') return
  if (!doc.state.isOnline) return
  const shouldBeOn = computeShouldBeOn(now, out.autoOnTime, out.autoOffTime)
  if (out.isOn !== shouldBeOn) {
    await applyToggle(id, outputId, shouldBeOn, shouldBeOn ? 'auto_on' : 'auto_off')
  }
}

export const expireTimerIfDue = async (
  id: string,
  outputId: OutputId,
  now: Date = new Date(),
) => {
  const doc = await Device.findById(id).lean()
  if (!doc) return
  const out = doc.state.outputs[outputId]
  const endsAt = out.offTimerEndsAt
  if (!endsAt) return
  if (endsAt.getTime() > now.getTime()) return
  if (out.isOn && doc.state.isOnline) {
    await applyToggle(id, outputId, false, 'timer_expired')
  } else {
    await Device.updateOne(
      { _id: id },
      { $set: { [`state.outputs.${outputId}.offTimerEndsAt`]: null } },
    )
    const fresh = await Device.findById(id).lean()
    if (fresh) appBus.emitDeviceUpdated(fresh)
  }
}

export const listLogs = async (
  deviceId: string,
  opts: { limit: number; before?: string; output?: OutputId },
) => {
  const filter: Record<string, unknown> = { deviceId }
  if (opts.before) filter.createdAt = { $lt: new Date(opts.before) }
  if (opts.output) filter.output = opts.output

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
