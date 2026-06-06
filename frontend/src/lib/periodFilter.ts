export interface PeriodFilterState {
  filterDate: string
  filterDateEnd: string
  filterTime: string
  filterTimeEnd: string
}

export function matchesPeriodFilter(
  dateTimeIso: string,
  { filterDate, filterDateEnd, filterTime, filterTimeEnd }: PeriodFilterState,
): boolean {
  const reqDate = new Date(dateTimeIso)

  if (filterDate) {
    const startDate = new Date(`${filterDate}T00:00:00`)
    const endDate = filterDateEnd
      ? new Date(`${filterDateEnd}T23:59:59`)
      : new Date(`${filterDate}T23:59:59`)
    if (reqDate < startDate || reqDate > endDate) return false
  }

  if (filterTime || filterTimeEnd) {
    const reqMinutes = reqDate.getHours() * 60 + reqDate.getMinutes()
    if (filterTime) {
      const [startH, startM] = filterTime.split(':').map(Number)
      const startMinutes = startH * 60 + startM
      if (reqMinutes < startMinutes) return false
    }
    if (filterTimeEnd) {
      const [endH, endM] = filterTimeEnd.split(':').map(Number)
      const endMinutes = endH * 60 + endM
      if (reqMinutes > endMinutes) return false
    }
  }

  return true
}

export function toDateInputValue(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function getDefaultPeriodFilter(): PeriodFilterState {
  const today = toDateInputValue(new Date())
  return {
    filterDate: today,
    filterDateEnd: today,
    filterTime: '00:00',
    filterTimeEnd: '23:59',
  }
}
