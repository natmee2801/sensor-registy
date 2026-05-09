import mongoose from 'mongoose'
import { env } from './env.ts'
import { logger } from '../lib/logger.ts'

export const connectDb = async (): Promise<void> => {
  mongoose.connection.on('connected', () => logger.info('mongo: connected'))
  mongoose.connection.on('error', (err) => logger.error({ err }, 'mongo: error'))
  mongoose.connection.on('disconnected', () => logger.warn('mongo: disconnected'))

  await mongoose.connect(env.MONGODB_URI)
}

export const isMongoConnected = (): boolean => mongoose.connection.readyState === 1
