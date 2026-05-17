import type { RequestHandler } from 'express'
import * as service from '../services/devices.ts'

export const list: RequestHandler = async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined
    const items = await service.listDevices(q)
    res.json(items)
  } catch (err) {
    next(err)
  }
}

export const getOne: RequestHandler = async (req, res, next) => {
  try {
    const device = await service.getDevice(req.params.id as string)
    res.json(device)
  } catch (err) {
    next(err)
  }
}

export const remove: RequestHandler = async (req, res, next) => {
  try {
    await service.removeDevice(req.params.id as string)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

export const toggle: RequestHandler = async (req, res, next) => {
  try {
    const device = await service.toggleDevice(req.params.id as string)
    res.json(device)
  } catch (err) {
    next(err)
  }
}

export const setMode: RequestHandler = async (req, res, next) => {
  try {
    const { mode } = req.body as { mode: 'manual' | 'auto' }
    const device = await service.setMode(req.params.id as string, mode)
    res.json(device)
  } catch (err) {
    next(err)
  }
}

export const setAutoTimes: RequestHandler = async (req, res, next) => {
  try {
    const { autoOnTime, autoOffTime } = req.body as {
      autoOnTime: string
      autoOffTime: string
    }
    const device = await service.setAutoTimes(req.params.id as string, autoOnTime, autoOffTime)
    res.json(device)
  } catch (err) {
    next(err)
  }
}

export const startOffTimer: RequestHandler = async (req, res, next) => {
  try {
    const { durationMs } = req.body as { durationMs: number }
    const device = await service.startOffTimer(req.params.id as string, durationMs)
    res.json(device)
  } catch (err) {
    next(err)
  }
}

export const cancelOffTimer: RequestHandler = async (req, res, next) => {
  try {
    const device = await service.cancelOffTimer(req.params.id as string)
    res.json(device)
  } catch (err) {
    next(err)
  }
}
