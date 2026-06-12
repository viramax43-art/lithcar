import { ApiError } from '../infrastructure/http/httpClient'

export type OfferBookingConflictCode = 'already_booked' | 'offer_full' | 'unknown'

export function parseOfferBookingConflict(error: unknown): OfferBookingConflictCode {
  if (!(error instanceof ApiError) || error.status !== 409) return 'unknown'
  try {
    const parsed = JSON.parse(error.body) as { detail?: { code?: string } | string }
    const detail = parsed.detail
    if (detail && typeof detail === 'object' && detail.code === 'already_booked') {
      return 'already_booked'
    }
    if (detail && typeof detail === 'object' && detail.code === 'offer_full') {
      return 'offer_full'
    }
  } catch {
    // ignore
  }
  return 'unknown'
}
