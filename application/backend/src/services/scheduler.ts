import { Device, OUTPUT_IDS } from '../models/Device.ts'
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
    $or: OUTPUT_IDS.flatMap((o) => [
      { [`state.outputs.${o}.controlMode`]: 'auto' },
      { [`state.outputs.${o}.offTimerEndsAt`]: { $ne: null } },
    ]),
  })
    .select('_id')
    .lean()

  if (candidates.length === 0) return

  for (const doc of candidates) {
    for (const outputId of OUTPUT_IDS) {
      try {
        await expireTimerIfDue(doc._id, outputId, now)
        await applyAutoScheduleIfNeeded(doc._id, outputId, now)
      } catch (err) {
        logger.error({ err, deviceId: doc._id, outputId }, 'tick: failed for output')
      }
    }
  }
}
