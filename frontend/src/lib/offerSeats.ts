export function offerSeatsBooked(offer: { totalSeats: number; seatsAvailable: number }): number {
  return Math.max(0, offer.totalSeats - offer.seatsAvailable)
}
