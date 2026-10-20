import { describe, expect, it } from 'vitest'

import {
  assignOfferColors,
  fallbackOfferColor,
  offerIntersectsViewport,
  OFFER_COLOR_PALETTE,
  OWN_OFFER_COLOR,
} from './offerMapColors'

function makeOffers(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `offer-${index}` }))
}

describe('assignOfferColors', () => {
  it('gives every ride in the viewport a distinct colour', () => {
    const offers = makeOffers(OFFER_COLOR_PALETTE.length)
    const colors = assignOfferColors(offers)

    expect(colors.size).toBe(offers.length)
    expect(new Set(colors.values()).size).toBe(offers.length)
  })

  it('keeps colours unique when there are more rides than palette slots', () => {
    const offers = makeOffers(OFFER_COLOR_PALETTE.length + 4)
    const colors = assignOfferColors(offers)

    expect(new Set(colors.values()).size).toBe(offers.length)
  })

  it('is stable regardless of offer order', () => {
    const offers = makeOffers(10)
    const forward = assignOfferColors(offers)
    const reversed = assignOfferColors([...offers].reverse())

    for (const offer of offers) {
      expect(reversed.get(offer.id)).toBe(forward.get(offer.id))
    }
  })

  it('keeps existing colours when new rides appear during polling', () => {
    const offers = makeOffers(8)
    const first = assignOfferColors(offers)
    const withNewcomer = makeOffers(11)
    const second = assignOfferColors(withNewcomer, OFFER_COLOR_PALETTE, first)

    for (const offer of offers) {
      expect(second.get(offer.id)).toBe(first.get(offer.id))
    }
    expect(new Set(second.values()).size).toBe(withNewcomer.length)
  })

  it('ignores stale colours for rides that left the viewport', () => {
    const offers = makeOffers(6)
    const previous = assignOfferColors(offers)
    const remaining = offers.slice(0, 3)
    const refreshed = assignOfferColors(remaining, OFFER_COLOR_PALETTE, previous)

    for (const offer of remaining) {
      expect(refreshed.get(offer.id)).toBe(previous.get(offer.id))
    }
    expect(refreshed.size).toBe(remaining.length)
  })

  it('always reserves green for the passenger own booking', () => {
    const colors = assignOfferColors([
      { id: 'mine', bookedByMe: true },
      { id: 'offer-1' },
      { id: 'offer-2' },
    ])

    expect(colors.get('mine')).toBe(OWN_OFFER_COLOR)
    expect(colors.get('offer-1')).not.toBe(OWN_OFFER_COLOR)
    expect(colors.get('offer-2')).not.toBe(OWN_OFFER_COLOR)
  })

  it('returns a stable fallback colour outside the viewport', () => {
    expect(fallbackOfferColor('offer-42')).toBe(fallbackOfferColor('offer-42'))
    expect(OFFER_COLOR_PALETTE).toContain(fallbackOfferColor('offer-42'))
  })
})

describe('offerIntersectsViewport', () => {
  const bounds = { south: 54.6, west: 25.2, north: 54.7, east: 25.3 }
  const point = (lat: number, lng: number) => ({ latlng: { lat, lng } })

  it('includes a ride with a pickup inside the map', () => {
    expect(
      offerIntersectsViewport(
        { from: point(54.65, 25.25), to: point(55.0, 26.0) },
        bounds,
      ),
    ).toBe(true)
  })

  it('includes a long ride crossing the map between two outside endpoints', () => {
    expect(
      offerIntersectsViewport(
        { from: point(54.65, 25.0), to: point(54.65, 25.5) },
        bounds,
      ),
    ).toBe(true)
  })

  it('excludes a ride completely outside the map', () => {
    expect(
      offerIntersectsViewport(
        { from: point(55.0, 26.0), to: point(55.1, 26.1) },
        bounds,
      ),
    ).toBe(false)
  })
})
