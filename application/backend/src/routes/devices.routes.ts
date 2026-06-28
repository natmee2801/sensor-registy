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
  outputIdParamSchema,
  toggleAllBodySchema,
} from '../schemas/device.zod.ts'

export const devicesRouter = Router()

devicesRouter.get('/', validate(listQuerySchema, 'query'), controller.list)
devicesRouter.get('/:id', validate(idParamSchema, 'params'), controller.getOne)
devicesRouter.delete('/:id', validate(idParamSchema, 'params'), controller.remove)
devicesRouter.post(
  '/:id/toggle-all',
  validate(idParamSchema, 'params'),
  validate(toggleAllBodySchema, 'body'),
  controller.toggleAll,
)
devicesRouter.post(
  '/:id/outputs/:outputId/toggle',
  validate(outputIdParamSchema, 'params'),
  controller.toggle,
)
devicesRouter.patch(
  '/:id/outputs/:outputId/mode',
  validate(outputIdParamSchema, 'params'),
  validate(modeBodySchema, 'body'),
  controller.setMode,
)
devicesRouter.patch(
  '/:id/outputs/:outputId/auto-times',
  validate(outputIdParamSchema, 'params'),
  validate(autoTimesBodySchema, 'body'),
  controller.setAutoTimes,
)
devicesRouter.post(
  '/:id/outputs/:outputId/off-timer',
  validate(outputIdParamSchema, 'params'),
  validate(offTimerBodySchema, 'body'),
  controller.startOffTimer,
)
devicesRouter.delete(
  '/:id/outputs/:outputId/off-timer',
  validate(outputIdParamSchema, 'params'),
  controller.cancelOffTimer,
)
devicesRouter.get(
  '/:id/logs',
  validate(idParamSchema, 'params'),
  validate(logsQuerySchema, 'query'),
  logsController.listLogs,
)
