export type DateFormatName = 'short' | 'long' | 'datetime'

export const dateFormatOptions: Record<DateFormatName, Intl.DateTimeFormatOptions> = {
  short: { year: 'numeric', month: 'numeric', day: 'numeric' },
  long: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  datetime: {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
}

export function toEventDate(isoDateString: string): Date {
  return new Date(`${isoDateString}T12:00:00`)
}

export function formatDate(
  input: Date | string | number,
  locale: string,
  format: DateFormatName = 'short',
): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) {
    return typeof input === 'string' ? input : String(input)
  }
  return new Intl.DateTimeFormat(locale, dateFormatOptions[format]).format(date)
}
