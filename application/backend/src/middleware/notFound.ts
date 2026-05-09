import type { RequestHandler } from 'express'

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'route not found' } })
}
