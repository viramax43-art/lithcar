/** Extract YYYY-MM-DD from draft dateTime (Europe/Vilnius wall clock, no TZ suffix). */
export function rideDateFromDateTime(dateTime: string | null | undefined): string | undefined {
  const datePart = dateTime?.split('T')[0]?.trim()
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return undefined
  return datePart
}

/** True when draft has both calendar date and clock time for matching. */
export function hasRideDateTime(dateTime: string | null | undefined): boolean {
  if (!dateTime?.trim()) return false
  const [datePart, timePart] = dateTime.split('T')
  return Boolean(datePart && timePart && /^\d{2}:\d{2}$/.test(timePart))
}
