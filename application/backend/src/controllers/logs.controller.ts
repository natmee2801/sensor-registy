import type { RequestHandler } from 'express'
import type { OutputId } from '../models/Device.ts'
import * as service from '../services/devices.ts'

export const listLogs: RequestHandler = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 20)
    const before = typeof req.query.before === 'string' ? req.query.before : undefined
    const output =
      typeof req.query.output === 'string' ? (req.query.output as OutputId) : undefined
    const result = await service.listLogs(req.params.id as string, { limit, before, output })
    res.json(result)
  } catch (err) {
    next(err)
  }
}
