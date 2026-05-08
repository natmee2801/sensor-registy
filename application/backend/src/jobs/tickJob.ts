import cron from 'node-cron'
import { runTick } from '../services/scheduler.ts'
import { logger } from '../lib/logger.ts'

let running = false

export const startTickJob = (): void => {
  cron.schedule('*/30 * * * * *', async () => {
    if (running) return
    running = true
    try {
      await runTick()
    } catch (err) {
      logger.error({ err }, 'tick job: failed')
    } finally {
      running = false
    }
  })
  logger.info('tick job: scheduled (every 30s)')
}
