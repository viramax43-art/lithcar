import { describe, expect, it } from 'vitest'

import { buildSimpleZoneBoundary } from './zoneGeometry'

describe('buildSimpleZoneBoundary', () => {
  it('turns a bow-tie click order into one outside boundary', () => {
    const boundary = buildSimpleZoneBoundary([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
      { lat: 0, lng: 1 },
    ])

    expect(boundary).toHaveLength(4)
    expect(new Set(boundary.map((point) => `${point.lat}:${point.lng}`))).toEqual(
      new Set(['0:0', '0:1', '1:0', '1:1']),
    )
  })

  it('ignores an inner click when building the outside boundary', () => {
    const boundary = buildSimpleZoneBoundary([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
      { lat: 1, lng: 1 },
    ])

    expect(boundary).toHaveLength(4)
    expect(boundary).not.toContainEqual({ lat: 1, lng: 1 })
  })

  it('keeps a single point untouched until a polygon is possible', () => {
    const single = buildSimpleZoneBoundary([{ lat: 5, lng: 5 }])
    expect(single).toEqual([{ lat: 5, lng: 5 }])
  })
})
