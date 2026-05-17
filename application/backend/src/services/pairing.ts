import { Device } from '../models/Device.ts'
import { DeviceLog } from '../models/DeviceLog.ts'
import { PairingSession } from '../models/PairingSession.ts'
import { appBus } from './events.ts'
import { applyAutoScheduleIfNeeded } from './devices.ts'
import * as mqtt from './mqtt.ts'
import { logger } from '../lib/logger.ts'
import { ConflictError } from './devices.ts'

const macTail6 = (mac: string) => mac.replace(/[:-]/g, '').slice(-6).toLowerCase()
const normalizeMac = (mac: string) => mac.toUpperCase().replace(/-/g, ':')

export const handleHello = async (payload: {
  mac: string
  model?: string
  fw?: string
}) => {
  const mac = normalizeMac(payload.mac)

  const existing = await Device.findOne({ 'state.mac': mac }).lean()
  if (existing) {
    mqtt.publishPairAck(mac, existing._id).catch((err) => {
      logger.warn({ err, mac }, 'pair ack re-publish failed')
    })
    return
  }

  const now = new Date()
  const session = await PairingSession.findOneAndUpdate(
    { mac },
    {
      $set: { lastSeenAt: now, model: payload.model ?? null, fw: payload.fw ?? null },
      $setOnInsert: {
        mac,
        proposedId: `light-${macTail6(mac)}`,
        firstSeenAt: now,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()

  if (session) appBus.emitPairAnnounced(session)
}

export const listUnclaimed = async () => {
  return PairingSession.find().sort({ firstSeenAt: 1 }).lean()
}

export const claim = async (rawMac: string, location: string) => {
  const mac = normalizeMac(rawMac)

  const existingByMac = await Device.findOne({ 'state.mac': mac }).lean()
  if (existingByMac) {
    await PairingSession.deleteOne({ mac })
    appBus.emitPairClaimed(mac)
    mqtt.publishPairAck(mac, existingByMac._id).catch((err) => {
      logger.warn({ err, mac }, 'pair ack re-publish on claim failed')
    })
    return existingByMac
  }

  const session = await PairingSession.findOne({ mac }).lean()
  const proposedId = session?.proposedId ?? `light-${macTail6(mac)}`

  let deviceId = proposedId
  const idCollision = await Device.findById(deviceId).lean()
  if (idCollision) {
    throw new ConflictError(`มี device_id "${deviceId}" อยู่แล้ว — โปรดลบ device เดิมก่อน pair ใหม่`)
  }

  try {
    const created = await Device.create({
      _id: deviceId,
      location,
      state: { mac },
    })
    const obj = created.toObject()
    await DeviceLog.create({ deviceId, type: 'paired', meta: { mac } })
    await PairingSession.deleteOne({ mac })
    appBus.emitDeviceUpdated(obj)
    appBus.emitPairClaimed(mac)
    applyAutoScheduleIfNeeded(deviceId).catch(() => {})
    mqtt.publishPairAck(mac, deviceId).catch((err) => {
      logger.warn({ err, mac, deviceId }, 'pair ack publish failed')
    })
    return obj
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new ConflictError(`มี device_id "${deviceId}" อยู่แล้ว`)
    }
    throw err
  }
}
