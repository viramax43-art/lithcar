import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DRIVER_AVAILABLE_RADIUS_KM,
  DRIVER_AVAILABLE_RADIUS_MAX_KM,
  normalizeDriverAvailableRadiusKm,
  normalizeDriverAvailableRadiusMaxKm,
} from './driverAvailableRadius'

describe('driver available radius', () => {
  it('falls back to the built-in default for missing values', () => {
    expect(normalizeDriverAvailableRadiusKm(null)).toBe(DEFAULT_DRIVER_AVAILABLE_RADIUS_KM)
    expect(normalizeDriverAvailableRadiusKm(undefined)).toBe(DEFAULT_DRIVER_AVAILABLE_RADIUS_KM)
    expect(normalizeDriverAvailableRadiusKm(Number.NaN)).toBe(DEFAULT_DRIVER_AVAILABLE_RADIUS_KM)
  })

  it('clamps the radius to the API range', () => {
    expect(normalizeDriverAvailableRadiusKm(-5)).toBe(0)
    expect(normalizeDriverAvailableRadiusKm(0)).toBe(0)
    expect(normalizeDriverAvailableRadiusKm(37)).toBe(37)
    expect(normalizeDriverAvailableRadiusKm(250)).toBe(DRIVER_AVAILABLE_RADIUS_MAX_KM)
  })

  it('clamps the admin slider maximum to 1..100 km', () => {
    expect(normalizeDriverAvailableRadiusMaxKm(undefined)).toBe(DRIVER_AVAILABLE_RADIUS_MAX_KM)
    expect(normalizeDriverAvailableRadiusMaxKm(0)).toBe(1)
    expect(normalizeDriverAvailableRadiusMaxKm(40)).toBe(40)
    expect(normalizeDriverAvailableRadiusMaxKm(250)).toBe(DRIVER_AVAILABLE_RADIUS_MAX_KM)
    expect(normalizeDriverAvailableRadiusMaxKm(25.6)).toBe(26)
  })
})
