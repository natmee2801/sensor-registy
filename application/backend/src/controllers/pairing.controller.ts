import type { RequestHandler } from 'express'
import * as service from '../services/pairing.ts'

export const list: RequestHandler = async (_req, res, next) => {
  try {
    const items = await service.listUnclaimed()
    res.json(items)
  } catch (err) {
    next(err)
  }
}

export const claim: RequestHandler = async (req, res, next) => {
  try {
    const { mac, location } = req.body as { mac: string; location: string }
    const device = await service.claim(mac, location)
    res.status(201).json(device)
  } catch (err) {
    next(err)
  }
}
