import { Router } from 'express'
import { stream } from '../controllers/events.controller.ts'

export const eventsRouter = Router()

eventsRouter.get('/', stream)
