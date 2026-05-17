import mqtt, { type MqttClient } from 'mqtt'
import { nanoid } from 'nanoid'
import { env } from '../config/env.ts'
import { logger } from '../lib/logger.ts'
import { OUTPUT_IDS, type OutputId } from '../models/Device.ts'
import * as devices from './devices.ts'
import * as pairing from './pairing.ts'

let client: MqttClient | null = null

type PendingCommand = { deviceId: string; outputId: OutputId; timer: NodeJS.Timeout }
const pending = new Map<string, PendingCommand>()

const safeJsonParse = <T>(buf: Buffer): T | null => {
  try {
    return JSON.parse(buf.toString('utf8')) as T
  } catch {
    return null
  }
}

const handleMessage = async (topic: string, payload: Buffer) => {
  if (topic === 'pair/hello') {
    const data = safeJsonParse<{ mac?: string; model?: string; fw?: string }>(payload)
    if (!data?.mac) return
    try {
      await pairing.handleHello({ mac: data.mac, model: data.model, fw: data.fw })
    } catch (err) {
      logger.warn({ err, mac: data.mac }, 'pairing.handleHello failed')
    }
    return
  }

  const ackMatch = topic.match(/^dev\/([^/]+)\/ack$/)
  if (ackMatch) {
    const deviceId = ackMatch[1]!
    const data = safeJsonParse<{
      cmdId?: string
      status?: 'applied' | 'error'
      output?: string
      isOn?: boolean
    }>(payload)
    if (!data?.cmdId || !data.status) return
    const entry = pending.get(data.cmdId)
    if (entry) {
      clearTimeout(entry.timer)
      pending.delete(data.cmdId)
      if (data.output && data.output !== entry.outputId) {
        logger.warn(
          { deviceId, cmdId: data.cmdId, sent: entry.outputId, acked: data.output },
          'ack output differs from cmd output — trusting ack',
        )
      }
    }
    const outputId = (data.output && (OUTPUT_IDS as readonly string[]).includes(data.output))
      ? (data.output as OutputId)
      : entry?.outputId
    if (!outputId) {
      logger.warn({ deviceId, cmdId: data.cmdId }, 'ack missing output and no pending entry — dropping')
      return
    }
    try {
      await devices.handleAck(deviceId, {
        cmdId: data.cmdId,
        status: data.status,
        output: outputId,
        isOn: data.isOn,
      })
    } catch (err) {
      logger.warn({ err, deviceId }, 'devices.handleAck failed')
    }
    return
  }

  const hbMatch = topic.match(/^dev\/([^/]+)\/hb$/)
  if (hbMatch) {
    const deviceId = hbMatch[1]!
    const data = safeJsonParse<{
      outputs?: Partial<Record<OutputId, { isOn?: boolean }>>
      rssi?: number
      uptime?: number
    }>(payload) ?? {}
    try {
      await devices.handleHeartbeat(deviceId, data)
    } catch (err) {
      logger.warn({ err, deviceId }, 'devices.handleHeartbeat failed')
    }
    return
  }

  const lwtMatch = topic.match(/^dev\/([^/]+)\/lwt$/)
  if (lwtMatch) {
    const deviceId = lwtMatch[1]!
    const text = payload.toString('utf8').trim()
    if (text === 'offline') {
      try {
        await devices.handleLwt(deviceId)
      } catch (err) {
        logger.warn({ err, deviceId }, 'devices.handleLwt failed')
      }
    }
    return
  }
}

export const connect = async (): Promise<void> => {
  if (client) return

  client = mqtt.connect(env.MQTT_URL, {
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    reconnectPeriod: 5000,
    keepalive: 60,
    clientId: `sensor-registry-backend-${nanoid(6)}`,
  })

  client.on('connect', () => {
    logger.info({ url: env.MQTT_URL }, 'mqtt connected')
    client?.subscribe(['pair/hello', 'dev/+/ack', 'dev/+/hb', 'dev/+/lwt'], { qos: 1 }, (err) => {
      if (err) logger.error({ err }, 'mqtt subscribe failed')
    })
  })

  client.on('reconnect', () => logger.info('mqtt reconnecting'))
  client.on('error', (err) => logger.error({ err }, 'mqtt client error'))
  client.on('close', () => logger.warn('mqtt connection closed'))

  client.on('message', (topic, payload) => {
    handleMessage(topic, payload).catch((err) =>
      logger.warn({ err, topic }, 'mqtt message handler crashed'),
    )
  })

  await new Promise<void>((resolve) => {
    const ok = () => {
      client?.removeListener('connect', ok)
      resolve()
    }
    client?.once('connect', ok)
    setTimeout(resolve, 2000).unref()
  })
}

export const publishCommand = async (
  deviceId: string,
  outputId: OutputId,
  isOn: boolean,
): Promise<{ cmdId: string }> => {
  if (!client?.connected) throw new Error('mqtt not connected')
  const cmdId = nanoid(10)
  const payload = JSON.stringify({
    cmd_id: cmdId,
    action: 'set_state',
    output: outputId,
    isOn,
    ts: new Date().toISOString(),
  })
  await new Promise<void>((resolve, reject) => {
    client!.publish(`dev/${deviceId}/cmd`, payload, { qos: 1 }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
  const timer = setTimeout(() => {
    pending.delete(cmdId)
    devices.handleCmdTimeout(deviceId, outputId, cmdId).catch((err) =>
      logger.warn({ err, deviceId, outputId, cmdId }, 'cmd_timeout log failed'),
    )
  }, env.ACK_TIMEOUT_MS)
  timer.unref()
  pending.set(cmdId, { deviceId, outputId, timer })
  return { cmdId }
}

export const publishPairAck = async (mac: string, deviceId: string): Promise<void> => {
  if (!client?.connected) throw new Error('mqtt not connected')
  const payload = JSON.stringify({ device_id: deviceId })
  await new Promise<void>((resolve, reject) => {
    client!.publish(`pair/ack/${mac}`, payload, { qos: 1, retain: true }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export const clearPairAck = async (mac: string): Promise<void> => {
  if (!client?.connected) return
  await new Promise<void>((resolve, reject) => {
    client!.publish(`pair/ack/${mac}`, '', { qos: 1, retain: true }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

// บอก ESP ที่ pair อยู่ให้ลืม device id แล้ว boot เข้า pairing mode ใหม่
// ใช้กรณี: (1) backend ลบ device, (2) backend รับ hb จาก id ที่ไม่มีใน DB
// non-retained — เลี่ยง infinite wipe loop ตอน ESP re-pair กลับมา ID เดิม
export const publishWipe = async (deviceId: string): Promise<void> => {
  if (!client?.connected) return
  await new Promise<void>((resolve, reject) => {
    client!.publish(`dev/${deviceId}/wipe`, '1', { qos: 1 }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export const clearDeviceLwt = async (deviceId: string): Promise<void> => {
  if (!client?.connected) return
  await new Promise<void>((resolve, reject) => {
    client!.publish(`dev/${deviceId}/lwt`, '', { qos: 1, retain: true }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
  await new Promise<void>((resolve, reject) => {
    client!.publish(`dev/${deviceId}/hb`, '', { qos: 0, retain: true }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export const disconnect = async (): Promise<void> => {
  if (!client) return
  await new Promise<void>((resolve) => client!.end(false, {}, () => resolve()))
  client = null
}
