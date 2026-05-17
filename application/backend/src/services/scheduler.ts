import { Device } from '../models/Device.ts'
import {
  applyAutoScheduleIfNeeded,
  expireTimerIfDue,
  reconcileStaleHeartbeats,
} from './devices.ts'
import { logger } from '../lib/logger.ts'
import { env } from '../config/env.ts'

export const runTick = async (now: Date = new Date()): Promise<void> => {
  try {
    await reconcileStaleHeartbeats(env.HEARTBEAT_GRACE_MS, now)
  } catch (err) {
    logger.error({ err }, 'tick: reconcile stale heartbeats failed')
  }

  const candidates = await Device.find({
    $or: [
      { 'state.controlMode': 'auto' },
      { 'state.offTimerEndsAt': { $ne: null } },
    ],
  })
    .select('_id')
    .lean()

  if (candidates.length === 0) return

  for (const doc of candidates) {
    try {
      await expireTimerIfDue(doc._id, now)
      await applyAutoScheduleIfNeeded(doc._id, now)
    } catch (err) {
      logger.error({ err, deviceId: doc._id }, 'tick: failed for device')
    }
  }
}
