export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
export type HapticNotificationType = 'success' | 'warning' | 'error'

type TelegramHapticFeedback = {
  impactOccurred?: (style: HapticImpactStyle) => void
  notificationOccurred?: (type: HapticNotificationType) => void
  selectionChanged?: () => void
}

type TelegramWebApp = {
  platform?: string
  ready?: () => void
  expand?: () => void
  requestFullscreen?: () => void
  disableVerticalSwipes?: () => void
  HapticFeedback?: TelegramHapticFeedback
}

function getTelegramWebApp(): TelegramWebApp | null {
  const maybe = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
  return maybe ?? null
}

export function initTelegramWebAppUI(): void {
  const webApp = getTelegramWebApp()
  if (!webApp) return
  try {
    webApp.ready?.()
  } catch {
    // noop
  }
  try {
    // Expand is the primary way to open the app in full available height.
    webApp.expand?.()
  } catch {
    // noop
  }
  try {
    // Avoid forcing fullscreen in desktop Telegram clients.
    const platform = (webApp.platform ?? '').toLowerCase()
    const isDesktopPlatform = platform === 'tdesktop' || platform === 'macos' || platform === 'web' || platform === 'weba' || platform === 'webk'
    if (!isDesktopPlatform) {
      // Newer mobile clients support explicit fullscreen mode.
      webApp.requestFullscreen?.()
    }
  } catch {
    // noop
  }
  try {
    // Avoid accidental collapse while scrolling in the app.
    webApp.disableVerticalSwipes?.()
  } catch {
    // noop
  }
}

function vibrateFallback(durationMs: number): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  navigator.vibrate(durationMs)
}

export function hapticSelection(): void {
  const webApp = getTelegramWebApp()
  if (webApp?.HapticFeedback?.selectionChanged) {
    webApp.HapticFeedback.selectionChanged()
    return
  }
  vibrateFallback(8)
}

export function hapticImpact(style: HapticImpactStyle = 'light'): void {
  const webApp = getTelegramWebApp()
  if (webApp?.HapticFeedback?.impactOccurred) {
    webApp.HapticFeedback.impactOccurred(style)
    return
  }
  vibrateFallback(style === 'heavy' ? 24 : style === 'medium' ? 16 : 10)
}

export function hapticNotification(type: HapticNotificationType): void {
  const webApp = getTelegramWebApp()
  if (webApp?.HapticFeedback?.notificationOccurred) {
    webApp.HapticFeedback.notificationOccurred(type)
    return
  }
  if (type === 'success') vibrateFallback(20)
  else if (type === 'warning') vibrateFallback(30)
  else vibrateFallback(40)
}
