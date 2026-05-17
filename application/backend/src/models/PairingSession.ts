import { Schema, model, type InferSchemaType } from 'mongoose'
import { MAC_PATTERN } from './Device.ts'

const pairingSessionSchema = new Schema(
  {
    mac: { type: String, required: true, unique: true, match: MAC_PATTERN },
    proposedId: { type: String, required: true },
    model: { type: String, default: null },
    fw: { type: String, default: null },
    firstSeenAt: { type: Date, required: true, default: () => new Date() },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
)

pairingSessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 3600 })

export type PairingSessionDoc = InferSchemaType<typeof pairingSessionSchema>

export const PairingSession = model(
  'PairingSession',
  pairingSessionSchema,
  'pairing_sessions',
)
