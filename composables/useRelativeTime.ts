type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second'

const UNITS: Array<{ unit: Unit; ms: number }> = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
]

export function useRelativeTime() {
  const { locale } = useI18n()

  return (from: Date | string | number, to: Date = new Date()): string => {
    const fromDate = from instanceof Date ? from : new Date(from)
    if (Number.isNaN(fromDate.getTime())) {
      return typeof from === 'string' ? from : String(from)
    }

    const diffMs = fromDate.getTime() - to.getTime()
    const absMs = Math.abs(diffMs)

    const match = UNITS.find(u => absMs >= u.ms) ?? UNITS[UNITS.length - 1]
    const value = Math.round(diffMs / match.ms)

    return new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }).format(value, match.unit)
  }
}
