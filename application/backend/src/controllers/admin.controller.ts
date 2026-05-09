import type { RequestHandler } from 'express'
import { archiveOldLogs } from '../services/archive.ts'
import { env } from '../config/env.ts'

export const requireAdminKey: RequestHandler = (req, _res, next) => {
  const key = req.header('x-admin-key')
  if (key !== env.ADMIN_KEY) {
    return next({ status: 401, code: 'unauthorized', message: 'X-Admin-Key invalid' })
  }
  next()
}

export const triggerArchive: RequestHandler = async (_req, res, next) => {
  try {
    const moved = await archiveOldLogs()
    res.json({ moved })
  } catch (err) {
    next(err)
  }
}
