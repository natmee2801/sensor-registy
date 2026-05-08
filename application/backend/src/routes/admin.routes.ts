import { Router } from 'express'
import { requireAdminKey, triggerArchive } from '../controllers/admin.controller.ts'

export const adminRouter = Router()

adminRouter.use(requireAdminKey)
adminRouter.post('/archive-logs', triggerArchive)
