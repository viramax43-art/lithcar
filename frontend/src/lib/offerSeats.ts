export function offerSeatsBooked(offer: { totalSeats: number; seatsAvailable: number }): number {
  return Math.max(0, offer.totalSeats - offer.seatsAvailable)
}

export function isOfferVisibleToPassenger(offer: {
  seatsAvailable: number
  bookedByMe?: boolean
}): boolean {
  return offer.seatsAvailable > 0 || Boolean(offer.bookedByMe)
}
