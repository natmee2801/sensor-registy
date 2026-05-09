import cron from 'node-cron'
import { archiveOldLogs } from '../services/archive.ts'
import { logger } from '../lib/logger.ts'

let running = false

export const startArchiveJob = (): void => {
  cron.schedule('0 3 * * *', async () => {
    if (running) return
    running = true
    try {
      const moved = await archiveOldLogs()
      logger.info({ moved }, 'archive job: completed')
    } catch (err) {
      logger.error({ err }, 'archive job: failed')
    } finally {
      running = false
    }
  })
  logger.info('archive job: scheduled (daily 03:00)')
}
