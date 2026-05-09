import type { ErrorRequestHandler } from 'express'
import mongoose from 'mongoose'
import { ZodError } from 'zod'
import { ConflictError, NotFoundError, StateError } from '../services/devices.ts'
import { logger } from '../lib/logger.ts'

interface AppErrorPayload {
  status?: number
  code?: string
  message?: string
  fields?: Array<{ field: string; message: string }>
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'ข้อมูลไม่ถูกต้อง',
        fields: err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
    })
    return
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'ข้อมูลไม่ถูกต้อง',
        fields: Object.entries(err.errors).map(([field, e]) => ({
          field,
          message: e.message,
        })),
      },
    })
    return
  }

  if (err instanceof ConflictError) {
    res.status(409).json({ error: { code: 'conflict', message: err.message } })
    return
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: 'not_found', message: err.message } })
    return
  }

  if (err instanceof StateError) {
    res.status(409).json({ error: { code: 'state_error', message: err.message } })
    return
  }

  if ((err as { code?: number }).code === 11000) {
    res.status(409).json({ error: { code: 'conflict', message: 'มี device_id นี้อยู่แล้ว' } })
    return
  }

  if (typeof err === 'object' && err !== null && 'status' in err) {
    const payload = err as AppErrorPayload
    res.status(payload.status ?? 500).json({
      error: {
        code: payload.code ?? 'error',
        message: payload.message ?? 'เกิดข้อผิดพลาด',
        ...(payload.fields ? { fields: payload.fields } : {}),
      },
    })
    return
  }

  logger.error({ err }, 'unhandled error')
  res.status(500).json({ error: { code: 'internal_error', message: 'เกิดข้อผิดพลาด' } })
}
