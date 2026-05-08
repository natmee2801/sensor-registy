import type { RequestHandler } from 'express'
import { appBus, type AppEvent } from '../services/events.ts'

const HEARTBEAT_MS = 25_000

export const stream: RequestHandler = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  res.write('retry: 3000\n\n')

  const onEvent = (evt: AppEvent) => {
    res.write(`event: ${evt.type}\n`)
    res.write(`data: ${JSON.stringify(evt)}\n\n`)
  }

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)

  appBus.on('event', onEvent)

  req.on('close', () => {
    clearInterval(heartbeat)
    appBus.off('event', onEvent)
    res.end()
  })
}
