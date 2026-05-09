import type {
  ControlMode,
  Device,
  DeviceLog,
  DeviceState,
} from '@/types/device'

const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export interface FieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  status: number
  code: string
  fields?: FieldError[]
  constructor(status: number, code: string, message: string, fields?: FieldError[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

interface RawDevice {
  _id: string
  location: string
  createdAt: string
  state: {
    isOn: boolean
    lastUpdatedAt: string | null
    controlMode: ControlMode
    autoOnTime: string
    autoOffTime: string
    offTimerEndsAt: string | null
  }
}

const normalizeDevice = (raw: RawDevice): Device => ({
  id: raw._id,
  location: raw.location,
  createdAt: raw.createdAt,
  state: {
    isOn: raw.state.isOn,
    lastUpdatedAt: raw.state.lastUpdatedAt,
    controlMode: raw.state.controlMode,
    autoOnTime: raw.state.autoOnTime,
    autoOffTime: raw.state.autoOffTime,
    offTimerEndsAt: raw.state.offTimerEndsAt,
  } satisfies DeviceState,
})

const request = async <T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T

  let payload: unknown = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!res.ok) {
    const errPayload = (payload as { error?: { code?: string; message?: string; fields?: FieldError[] } })?.error
    throw new ApiError(
      res.status,
      errPayload?.code ?? 'error',
      errPayload?.message ?? `HTTP ${res.status}`,
      errPayload?.fields,
    )
  }

  return payload as T
}

export const listDevices = async (q?: string): Promise<Device[]> => {
  const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  const raws = await request<RawDevice[]>('GET', `/api/devices${qs}`)
  return raws.map(normalizeDevice)
}

export const getDevice = async (id: string): Promise<Device> => {
  const raw = await request<RawDevice>('GET', `/api/devices/${encodeURIComponent(id)}`)
  return normalizeDevice(raw)
}

export const registerDevice = async (input: {
  id: string
  location: string
}): Promise<Device> => {
  const raw = await request<RawDevice>('POST', '/api/devices', input)
  return normalizeDevice(raw)
}

export const deleteDevice = (id: string): Promise<void> =>
  request<void>('DELETE', `/api/devices/${encodeURIComponent(id)}`)

export const toggleDevice = async (id: string): Promise<Device> => {
  const raw = await request<RawDevice>('POST', `/api/devices/${encodeURIComponent(id)}/toggle`)
  return normalizeDevice(raw)
}

export const setMode = async (id: string, mode: ControlMode): Promise<Device> => {
  const raw = await request<RawDevice>(
    'PATCH',
    `/api/devices/${encodeURIComponent(id)}/mode`,
    { mode },
  )
  return normalizeDevice(raw)
}

export const setAutoTimes = async (
  id: string,
  autoOnTime: string,
  autoOffTime: string,
): Promise<Device> => {
  const raw = await request<RawDevice>(
    'PATCH',
    `/api/devices/${encodeURIComponent(id)}/auto-times`,
    { autoOnTime, autoOffTime },
  )
  return normalizeDevice(raw)
}

export const startOffTimer = async (id: string, durationMs: number): Promise<Device> => {
  const raw = await request<RawDevice>(
    'POST',
    `/api/devices/${encodeURIComponent(id)}/off-timer`,
    { durationMs },
  )
  return normalizeDevice(raw)
}

export const cancelOffTimer = async (id: string): Promise<Device> => {
  const raw = await request<RawDevice>(
    'DELETE',
    `/api/devices/${encodeURIComponent(id)}/off-timer`,
  )
  return normalizeDevice(raw)
}

export const getLogs = async (
  id: string,
  opts: { limit?: number; before?: string } = {},
): Promise<{ items: DeviceLog[]; nextCursor: string | null }> => {
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.before) params.set('before', opts.before)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request<{ items: DeviceLog[]; nextCursor: string | null }>(
    'GET',
    `/api/devices/${encodeURIComponent(id)}/logs${qs}`,
  )
}

export interface DeviceUpdatedEvent {
  type: 'device_updated'
  device: RawDevice
}

export interface DeviceRemovedEvent {
  type: 'device_removed'
  deviceId: string
}

export type AppEvent =
  | { type: 'device_updated'; device: Device }
  | { type: 'device_removed'; deviceId: string }

export const subscribeToEvents = (
  onEvent: (evt: AppEvent) => void,
  onError?: (err: Event) => void,
): (() => void) => {
  const source = new EventSource(`${BASE_URL}/api/events`)

  const handleUpdated = (e: MessageEvent) => {
    try {
      const raw = JSON.parse(e.data) as DeviceUpdatedEvent
      onEvent({ type: 'device_updated', device: normalizeDevice(raw.device) })
    } catch {
      // ignore malformed
    }
  }
  const handleRemoved = (e: MessageEvent) => {
    try {
      const raw = JSON.parse(e.data) as DeviceRemovedEvent
      onEvent({ type: 'device_removed', deviceId: raw.deviceId })
    } catch {
      // ignore malformed
    }
  }

  source.addEventListener('device_updated', handleUpdated)
  source.addEventListener('device_removed', handleRemoved)
  if (onError) source.addEventListener('error', onError)

  return () => {
    source.removeEventListener('device_updated', handleUpdated)
    source.removeEventListener('device_removed', handleRemoved)
    if (onError) source.removeEventListener('error', onError)
    source.close()
  }
}
