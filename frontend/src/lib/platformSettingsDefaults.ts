export interface PlatformSettingsConfig {
  passenger: {
    defaultPointsBalance: number
    allowBuyPointsFromDriverWhenEmpty: boolean
    allowDriverCashWhenEmpty: boolean
    allowDriverCardWhenEmpty: boolean
    promoMessageTemplate: { lt: string; pl: string; en: string; ru: string }
    showDestinationZones: boolean
  }
  driver: {
    reassignmentEnabled: boolean
    reassignmentBonusPoints: number
    reassignmentPriorityBoost: boolean
    defaultCanSellPoints: boolean
    defaultCanSelfAssign: boolean
  }
  system: {
    eurUsdRate: number
    kmRatioMultiplier: number
    staleRequestMinutesPending: number
    staleRequestMinutesPastRide: number
    autoDeleteStaleRequests: boolean
    manualDeleteStaleRequests: boolean
    pickupZonesVisibleToPassengers: boolean
    destinationZonesVisibleToDrivers: boolean
    destinationZonesVisibleToPassengers: boolean
    driverNotificationWindowStart: string
    driverNotificationWindowEnd: string
    passengerNotificationWindowStart: string
    passengerNotificationWindowEnd: string
    sidebarCompactOnMap: boolean
  }
  promotions: {
    enabled: boolean
    templates: Array<{ id: string; title: string; body: string }>
  }
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsConfig = {
  passenger: {
    defaultPointsBalance: 100,
    allowBuyPointsFromDriverWhenEmpty: true,
    allowDriverCashWhenEmpty: true,
    allowDriverCardWhenEmpty: true,
    promoMessageTemplate: { lt: '', pl: '', en: '', ru: '' },
    showDestinationZones: false,
  },
  driver: {
    reassignmentEnabled: true,
    reassignmentBonusPoints: 5,
    reassignmentPriorityBoost: true,
    defaultCanSellPoints: true,
    defaultCanSelfAssign: false,
  },
  system: {
    eurUsdRate: 1.08,
    kmRatioMultiplier: 1.0,
    staleRequestMinutesPending: 30,
    staleRequestMinutesPastRide: 5,
    autoDeleteStaleRequests: true,
    manualDeleteStaleRequests: true,
    pickupZonesVisibleToPassengers: true,
    destinationZonesVisibleToDrivers: true,
    destinationZonesVisibleToPassengers: false,
    driverNotificationWindowStart: '06:00',
    driverNotificationWindowEnd: '22:00',
    passengerNotificationWindowStart: '06:00',
    passengerNotificationWindowEnd: '22:00',
    sidebarCompactOnMap: true,
  },
  promotions: {
    enabled: false,
    templates: [],
  },
}

export function mapPlatformSettings(raw: Partial<PlatformSettingsConfig> | null | undefined): PlatformSettingsConfig {
  if (!raw) return DEFAULT_PLATFORM_SETTINGS
  return {
    passenger: { ...DEFAULT_PLATFORM_SETTINGS.passenger, ...raw.passenger },
    driver: { ...DEFAULT_PLATFORM_SETTINGS.driver, ...raw.driver },
    system: { ...DEFAULT_PLATFORM_SETTINGS.system, ...raw.system },
    promotions: {
      ...DEFAULT_PLATFORM_SETTINGS.promotions,
      ...raw.promotions,
      templates: raw.promotions?.templates ?? DEFAULT_PLATFORM_SETTINGS.promotions.templates,
    },
  }
}
