import { DeviceLog } from '../models/DeviceLog.ts'
import { DeviceLogArchived } from '../models/DeviceLogArchived.ts'
import { logger } from '../lib/logger.ts'

const BATCH = 1000
const RETENTION_DAYS = 30

export const archiveOldLogs = async (
  cutoff: Date = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000),
): Promise<number> => {
  let totalMoved = 0

  while (true) {
    const batch = await DeviceLog.find({ createdAt: { $lt: cutoff } })
      .sort({ createdAt: 1 })
      .limit(BATCH)
      .lean()

    if (batch.length === 0) break

    await DeviceLogArchived.insertMany(batch, { ordered: false })
    const ids = batch.map((b) => b._id)
    await DeviceLog.deleteMany({ _id: { $in: ids } })

    totalMoved += batch.length
    logger.info({ count: batch.length, totalMoved }, 'archive: moved batch')
    if (batch.length < BATCH) break
  }

  return totalMoved
}
