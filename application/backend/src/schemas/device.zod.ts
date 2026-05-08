import { z } from 'zod'
import { HHMM_PATTERN } from '../lib/time.ts'
import { ID_MAX, ID_PATTERN, LOCATION_MAX } from '../models/Device.ts'

export const idParamSchema = z.object({
  id: z
    .string()
    .min(1, 'กรุณากรอก device_id')
    .max(ID_MAX, `device_id ต้องไม่เกิน ${ID_MAX} ตัวอักษร`)
    .regex(ID_PATTERN, 'device_id ใช้ได้เฉพาะ A-Z, a-z, 0-9, "-", "_"'),
})

export const registerBodySchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'กรุณากรอก device_id')
    .max(ID_MAX, `device_id ต้องไม่เกิน ${ID_MAX} ตัวอักษร`)
    .regex(ID_PATTERN, 'device_id ใช้ได้เฉพาะ A-Z, a-z, 0-9, "-", "_"'),
  location: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกตำแหน่ง/ห้อง')
    .max(LOCATION_MAX, `ตำแหน่งต้องไม่เกิน ${LOCATION_MAX} ตัวอักษร`),
})

export const modeBodySchema = z.object({
  mode: z.enum(['manual', 'auto']),
})

export const autoTimesBodySchema = z.object({
  autoOnTime: z.string().regex(HHMM_PATTERN, 'รูปแบบเวลาไม่ถูกต้อง (HH:MM)'),
  autoOffTime: z.string().regex(HHMM_PATTERN, 'รูปแบบเวลาไม่ถูกต้อง (HH:MM)'),
})

export const offTimerBodySchema = z.object({
  durationMs: z.number().int().positive().max(24 * 60 * 60 * 1000),
})

export const listQuerySchema = z.object({
  q: z.string().trim().optional(),
})

export const logsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  before: z.string().datetime().optional(),
})
