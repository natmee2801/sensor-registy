import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { ZodSchema } from 'zod'

type Source = 'body' | 'params' | 'query'

export const validate = (schema: ZodSchema, source: Source = 'body'): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      const fields = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }))
      return next({
        status: 400,
        code: 'validation_error',
        message: 'ข้อมูลไม่ถูกต้อง',
        fields,
      })
    }
    if (source === 'body') req.body = result.data
    else if (source === 'params') req.params = result.data
    else if (source === 'query') {
      Object.assign(req.query, result.data)
    }
    next()
  }
}
