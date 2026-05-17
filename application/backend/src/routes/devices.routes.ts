import { Router } from 'express'
import * as controller from '../controllers/devices.controller.ts'
import * as logsController from '../controllers/logs.controller.ts'
import { validate } from '../middleware/validate.ts'
import {
  autoTimesBodySchema,
  idParamSchema,
  listQuerySchema,
  logsQuerySchema,
  modeBodySchema,
  offTimerBodySchema,
} from '../schemas/device.zod.ts'

export const devicesRouter = Router()

devicesRouter.get('/', validate(listQuerySchema, 'query'), controller.list)
devicesRouter.get('/:id', validate(idParamSchema, 'params'), controller.getOne)
devicesRouter.delete('/:id', validate(idParamSchema, 'params'), controller.remove)
devicesRouter.post(
  '/:id/toggle',
  validate(idParamSchema, 'params'),
  controller.toggle,
)
devicesRouter.patch(
  '/:id/mode',
  validate(idParamSchema, 'params'),
  validate(modeBodySchema, 'body'),
  controller.setMode,
)
devicesRouter.patch(
  '/:id/auto-times',
  validate(idParamSchema, 'params'),
  validate(autoTimesBodySchema, 'body'),
  controller.setAutoTimes,
)
devicesRouter.post(
  '/:id/off-timer',
  validate(idParamSchema, 'params'),
  validate(offTimerBodySchema, 'body'),
  controller.startOffTimer,
)
devicesRouter.delete(
  '/:id/off-timer',
  validate(idParamSchema, 'params'),
  controller.cancelOffTimer,
)
devicesRouter.get(
  '/:id/logs',
  validate(idParamSchema, 'params'),
  validate(logsQuerySchema, 'query'),
  logsController.listLogs,
)
