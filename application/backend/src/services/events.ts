import { EventEmitter } from 'node:events'

export interface DeviceUpdatedEvent {
  type: 'device_updated'
  device: unknown
}

export interface DeviceRemovedEvent {
  type: 'device_removed'
  deviceId: string
}

export interface PairAnnouncedEvent {
  type: 'pair_announced'
  session: unknown
}

export interface PairClaimedEvent {
  type: 'pair_claimed'
  mac: string
}

export type AppEvent =
  | DeviceUpdatedEvent
  | DeviceRemovedEvent
  | PairAnnouncedEvent
  | PairClaimedEvent

class AppBus extends EventEmitter {
  emitDeviceUpdated(device: unknown): void {
    const evt: DeviceUpdatedEvent = { type: 'device_updated', device }
    this.emit('event', evt)
  }

  emitDeviceRemoved(deviceId: string): void {
    const evt: DeviceRemovedEvent = { type: 'device_removed', deviceId }
    this.emit('event', evt)
  }

  emitPairAnnounced(session: unknown): void {
    const evt: PairAnnouncedEvent = { type: 'pair_announced', session }
    this.emit('event', evt)
  }

  emitPairClaimed(mac: string): void {
    const evt: PairClaimedEvent = { type: 'pair_claimed', mac }
    this.emit('event', evt)
  }
}

export const appBus = new AppBus()
appBus.setMaxListeners(1000)
