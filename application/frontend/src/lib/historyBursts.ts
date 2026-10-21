import { OUTPUT_IDS, type DeviceLog, type LogType, type OutputId } from '@/types/device'

// Logs for one user action land within a second or two of each other
// (a command per relay, then an ack per relay) — group them into one entry.
export const BURST_GAP_MS = 3000

export type BurstCause = 'command' | 'auto' | 'timer' | 'device'

export interface BurstRow {
  output: OutputId
  isOn: boolean | null
  acked: boolean
  timedOut: boolean
}

export interface Burst {
  key: string
  at: string
  cause: BurstCause
  rows: BurstRow[]
}

const COMMAND_CAUSE: Partial<Record<LogType, BurstCause>> = {
  toggle: 'command',
  auto_on: 'auto',
  auto_off: 'auto',
  timer_expired: 'timer',
  // the board changed on its own (voice module) and told us via heartbeat
  hb_sync: 'device',
}

const isBurstEvent = (log: DeviceLog) =>
  log.output !== null &&
  (log.type in COMMAND_CAUSE || log.type === 'cmd_ack' || log.type === 'cmd_timeout')

const buildBurst = (newest: DeviceLog, logs: DeviceLog[]): Burst => {
  const rows = new Map<OutputId, BurstRow>()
  let cause: BurstCause | null = null
  // logs are newest-first, so the first command seen per output is its latest
  for (const log of logs) {
    const output = log.output as OutputId
    let row = rows.get(output)
    if (!row) {
      row = { output, isOn: null, acked: false, timedOut: false }
      rows.set(output, row)
    }
    const commandCause = COMMAND_CAUSE[log.type]
    if (commandCause) {
      if (row.isOn === null) row.isOn = log.isOn
      // the device reporting itself is the weakest explanation: any command in the burst wins
      if (commandCause === 'device') row.acked = true
      if (cause === null || cause === 'device') cause = commandCause
    } else if (log.type === 'cmd_ack') {
      row.acked = true
      if (row.isOn === null) row.isOn = log.isOn
    } else if (log.type === 'cmd_timeout') {
      row.timedOut = true
    }
  }
  return {
    key: `burst-${newest._id}`,
    at: newest.createdAt,
    cause: cause ?? 'command',
    rows: OUTPUT_IDS.flatMap((o) => rows.get(o) ?? []),
  }
}

export type HistoryEntry =
  | { kind: 'burst'; burst: Burst }
  | { kind: 'log'; log: DeviceLog }

export const groupHistory = (logs: DeviceLog[]): HistoryEntry[] => {
  const entries: HistoryEntry[] = []
  let pending: DeviceLog[] = []

  const flush = () => {
    const [newest] = pending
    if (newest) entries.push({ kind: 'burst', burst: buildBurst(newest, pending) })
    pending = []
  }

  for (const log of logs) {
    if (!isBurstEvent(log)) {
      flush()
      entries.push({ kind: 'log', log })
      continue
    }
    const prev = pending[pending.length - 1]
    if (prev && new Date(prev.createdAt).getTime() - new Date(log.createdAt).getTime() > BURST_GAP_MS) {
      flush()
    }
    pending.push(log)
  }
  flush()
  return entries
}
