import { z } from 'zod'
import { LOCATION_MAX, MAC_PATTERN } from '../models/Device.ts'

export const claimBodySchema = z.object({
  mac: z
    .string()
    .trim()
    .regex(MAC_PATTERN, 'รูปแบบ MAC address ไม่ถูกต้อง'),
  location: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกตำแหน่ง/ห้อง')
    .max(LOCATION_MAX, `ตำแหน่งต้องไม่เกิน ${LOCATION_MAX} ตัวอักษร`),
})
