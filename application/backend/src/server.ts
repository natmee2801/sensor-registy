import { env } from './config/env.ts'
import { connectDb } from './config/db.ts'
import { logger } from './lib/logger.ts'
import { buildApp } from './app.ts'
import { startTickJob } from './jobs/tickJob.ts'
import { startArchiveJob } from './jobs/archiveJob.ts'
import { connect as connectMqtt, disconnect as disconnectMqtt } from './services/mqtt.ts'

const main = async () => {
  await connectDb()
  await connectMqtt().catch((err) => {
    logger.error({ err }, 'mqtt initial connect failed; will retry in background')
  })

  const app = buildApp()
  const server = app.listen(env.PORT, () => {
    logger.info(`express: listening on ${env.PORT}`)
  })

  startTickJob()
  startArchiveJob()

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down')
    disconnectMqtt().catch(() => {})
    server.close(() => {
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start')
  process.exit(1)
})
