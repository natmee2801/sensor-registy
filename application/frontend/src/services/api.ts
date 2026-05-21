import {
  OUTPUT_IDS,
  type ControlMode,
  type Device,
  type DeviceLog,
  type DeviceState,
  type OutputId,
  type OutputState,
  type PairingSession,
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

interface RawOutputState {
  isOn: boolean
  lastUpdatedAt: string | null
  controlMode: ControlMode
  autoOnTime: string
  autoOffTime: string
  offTimerEndsAt: string | null
}

interface RawDevice {
  _id: string
  location: string
  createdAt: string
  state: {
    isOnline?: boolean
    lastSeenAt?: string | null
    mac?: string | null
    outputs?: Partial<Record<OutputId, RawOutputState>>
  }
}

interface RawPairingSession {
  mac: string
  proposedId: string
  model: string | null
  fw: string | null
  firstSeenAt: string
  lastSeenAt: string
}

const defaultOutput = (): OutputState => ({
  isOn: false,
  lastUpdatedAt: null,
  controlMode: 'manual',
  autoOnTime: '18:00',
  autoOffTime: '23:00',
  offTimerEndsAt: null,
})

const normalizeOutput = (raw: RawOutputState | undefined): OutputState => {
  if (!raw) return defaultOutput()
  return {
    isOn: raw.isOn,
    lastUpdatedAt: raw.lastUpdatedAt,
    controlMode: raw.controlMode,
    autoOnTime: raw.autoOnTime,
    autoOffTime: raw.autoOffTime,
    offTimerEndsAt: raw.offTimerEndsAt,
  }
}

const normalizeDevice = (raw: RawDevice): Device => ({
  id: raw._id,
  location: raw.location,
  createdAt: raw.createdAt,
  state: {
    isOnline: raw.state.isOnline ?? false,
    lastSeenAt: raw.state.lastSeenAt ?? null,
    mac: raw.state.mac ?? null,
    outputs: {
      out1: normalizeOutput(raw.state.outputs?.out1),
      out2: normalizeOutput(raw.state.outputs?.out2),
    },
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

export const deleteDevice = (id: string): Promise<void> =>
  request<void>('DELETE', `/api/devices/${encodeURIComponent(id)}`)

export const listUnclaimed = async (): Promise<PairingSession[]> => {
  return request<RawPairingSession[]>('GET', '/api/pairing/unclaimed')
}

export const claimDevice = async (input: {
  mac: string
  location: string
}): Promise<Device> => {
  const raw = await request<RawDevice>('POST', '/api/pairing/claim', input)
  return normalizeDevice(raw)
}

const outputPath = (id: string, outputId: OutputId, suffix: string) =>
  `/api/devices/${encodeURIComponent(id)}/outputs/${encodeURIComponent(outputId)}${suffix}`

export const toggleOutput = async (id: string, outputId: OutputId): Promise<Device> => {
  const raw = await request<RawDevice>('POST', outputPath(id, outputId, '/toggle'))
  return normalizeDevice(raw)
}

export const toggleAll = async (id: string, isOn: boolean): Promise<Device> => {
  const raw = await request<RawDevice>(
    'POST',
    `/api/devices/${encodeURIComponent(id)}/toggle-all`,
    { isOn },
  )
  return normalizeDevice(raw)
}

export const setMode = async (
  id: string,
  outputId: OutputId,
  mode: ControlMode,
): Promise<Device> => {
  const raw = await request<RawDevice>('PATCH', outputPath(id, outputId, '/mode'), { mode })
  return normalizeDevice(raw)
}

export const setAutoTimes = async (
  id: string,
  outputId: OutputId,
  autoOnTime: string,
  autoOffTime: string,
): Promise<Device> => {
  const raw = await request<RawDevice>('PATCH', outputPath(id, outputId, '/auto-times'), {
    autoOnTime,
    autoOffTime,
  })
  return normalizeDevice(raw)
}

export const startOffTimer = async (
  id: string,
  outputId: OutputId,
  durationMs: number,
): Promise<Device> => {
  const raw = await request<RawDevice>('POST', outputPath(id, outputId, '/off-timer'), {
    durationMs,
  })
  return normalizeDevice(raw)
}

export const cancelOffTimer = async (id: string, outputId: OutputId): Promise<Device> => {
  const raw = await request<RawDevice>('DELETE', outputPath(id, outputId, '/off-timer'))
  return normalizeDevice(raw)
}

export const getLogs = async (
  id: string,
  opts: { limit?: number; before?: string; output?: OutputId } = {},
): Promise<{ items: DeviceLog[]; nextCursor: string | null }> => {
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.before) params.set('before', opts.before)
  if (opts.output) params.set('output', opts.output)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return request<{ items: DeviceLog[]; nextCursor: string | null }>(
    'GET',
    `/api/devices/${encodeURIComponent(id)}/logs${qs}`,
  )
}

export type AppEvent =
  | { type: 'device_updated'; device: Device }
  | { type: 'device_removed'; deviceId: string }
  | { type: 'pair_announced'; session: PairingSession }
  | { type: 'pair_claimed'; mac: string }

export const subscribeToEvents = (
  onEvent: (evt: AppEvent) => void,
  onError?: (err: Event) => void,
): (() => void) => {
  const source = new EventSource(`${BASE_URL}/api/events`)

  const handleUpdated = (e: MessageEvent) => {
    try {
      const raw = JSON.parse(e.data) as { type: 'device_updated'; device: RawDevice }
      onEvent({ type: 'device_updated', device: normalizeDevice(raw.device) })
    } catch {
      // ignore malformed
    }
  }
  const handleRemoved = (e: MessageEvent) => {
    try {
      const raw = JSON.parse(e.data) as { type: 'device_removed'; deviceId: string }
      onEvent({ type: 'device_removed', deviceId: raw.deviceId })
    } catch {
      // ignore malformed
    }
  }
  const handlePairAnnounced = (e: MessageEvent) => {
    try {
      const raw = JSON.parse(e.data) as { type: 'pair_announced'; session: RawPairingSession }
      onEvent({ type: 'pair_announced', session: raw.session })
    } catch {
      // ignore malformed
    }
  }
  const handlePairClaimed = (e: MessageEvent) => {
    try {
      const raw = JSON.parse(e.data) as { type: 'pair_claimed'; mac: string }
      onEvent({ type: 'pair_claimed', mac: raw.mac })
    } catch {
      // ignore malformed
    }
  }

  source.addEventListener('device_updated', handleUpdated)
  source.addEventListener('device_removed', handleRemoved)
  source.addEventListener('pair_announced', handlePairAnnounced)
  source.addEventListener('pair_claimed', handlePairClaimed)
  if (onError) source.addEventListener('error', onError)

  return () => {
    source.removeEventListener('device_updated', handleUpdated)
    source.removeEventListener('device_removed', handleRemoved)
    source.removeEventListener('pair_announced', handlePairAnnounced)
    source.removeEventListener('pair_claimed', handlePairClaimed)
    if (onError) source.removeEventListener('error', onError)
    source.close()
  }
}

export { OUTPUT_IDS }
