import express, { type Application } from 'express'
import cors from 'cors'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.ts'
import { logger } from './lib/logger.ts'
import { isMongoConnected } from './config/db.ts'
import { devicesRouter } from './routes/devices.routes.ts'
import { eventsRouter } from './routes/events.routes.ts'
import { adminRouter } from './routes/admin.routes.ts'
import { errorHandler } from './middleware/errorHandler.ts'
import { notFound } from './middleware/notFound.ts'

export const buildApp = (): Application => {
  const app = express()

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  )
  app.use(cors({ origin: env.FRONTEND_URL }))
  app.use(express.json({ limit: '64kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mongo: isMongoConnected() ? 'connected' : 'disconnected' })
  })

  app.use('/api/devices', devicesRouter)
  app.use('/api/events', eventsRouter)
  app.use('/api/admin', adminRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
