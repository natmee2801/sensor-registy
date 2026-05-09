import { EventEmitter } from 'node:events'

export interface DeviceUpdatedEvent {
  type: 'device_updated'
  device: unknown
}

export interface DeviceRemovedEvent {
  type: 'device_removed'
  deviceId: string
}

export type AppEvent = DeviceUpdatedEvent | DeviceRemovedEvent

class AppBus extends EventEmitter {
  emitDeviceUpdated(device: unknown): void {
    const evt: DeviceUpdatedEvent = { type: 'device_updated', device }
    this.emit('event', evt)
  }

  emitDeviceRemoved(deviceId: string): void {
    const evt: DeviceRemovedEvent = { type: 'device_removed', deviceId }
    this.emit('event', evt)
  }
}

export const appBus = new AppBus()
appBus.setMaxListeners(1000)
