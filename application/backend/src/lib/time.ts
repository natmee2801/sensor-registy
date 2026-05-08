export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const parseHourMinute = (time: string): number => {
  const [hourText = '0', minuteText = '0'] = time.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0
  return hour * 60 + minute
}

export const computeShouldBeOn = (now: Date, onTime: string, offTime: string): boolean => {
  const onMinutes = parseHourMinute(onTime)
  const offMinutes = parseHourMinute(offTime)
  if (onMinutes === offMinutes) return false
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return onMinutes < offMinutes
    ? currentMinutes >= onMinutes && currentMinutes < offMinutes
    : currentMinutes >= onMinutes || currentMinutes < offMinutes
}
