import { Router } from 'express'
import * as controller from '../controllers/pairing.controller.ts'
import { validate } from '../middleware/validate.ts'
import { claimBodySchema } from '../schemas/pairing.zod.ts'

export const pairingRouter = Router()

pairingRouter.get('/unclaimed', controller.list)
pairingRouter.post('/claim', validate(claimBodySchema, 'body'), controller.claim)
