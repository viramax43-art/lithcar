export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
export type HapticNotificationType = 'success' | 'warning' | 'error'

type TelegramHapticFeedback = {
  impactOccurred?: (style: HapticImpactStyle) => void
  notificationOccurred?: (type: HapticNotificationType) => void
  selectionChanged?: () => void
}

type TelegramSafeAreaInset = {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

type TelegramWebApp = {
  platform?: string
  isFullscreen?: boolean
  safeAreaInset?: TelegramSafeAreaInset
  contentSafeAreaInset?: TelegramSafeAreaInset
  ready?: () => void
  expand?: () => void
  requestFullscreen?: () => void
  disableVerticalSwipes?: () => void
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
  onEvent?: (eventType: string, callback: () => void) => void
  HapticFeedback?: TelegramHapticFeedback
}

function getTelegramWebApp(): TelegramWebApp | null {
  const maybe = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
  return maybe ?? null
}

const DESKTOP_PLATFORMS = new Set(['tdesktop', 'macos', 'web', 'weba', 'webk'])

let fullscreenRequested = false

function readInsetPx(...values: Array<number | undefined>): number {
  return Math.max(
    0,
    ...values.map((value) => (Number.isFinite(value) ? Math.round(value ?? 0) : 0)),
  )
}

function syncTelegramViewportState(webApp: TelegramWebApp): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const platform = (webApp.platform ?? '').toLowerCase()
  const top = readInsetPx(webApp.safeAreaInset?.top, webApp.contentSafeAreaInset?.top)
  const bottom = readInsetPx(webApp.safeAreaInset?.bottom, webApp.contentSafeAreaInset?.bottom)

  root.dataset.tgPlatform = platform || 'unknown'
  root.dataset.tgFullscreen = (webApp.isFullscreen || fullscreenRequested) ? '1' : '0'
  root.dataset.tgSafeAreaTop = top > 0 ? '1' : '0'
  root.dataset.tgSafeAreaBottom = bottom > 0 ? '1' : '0'
  root.style.setProperty('--app-telegram-safe-area-top', `${top}px`)
  root.style.setProperty('--app-telegram-safe-area-bottom', `${bottom}px`)
}

export function initTelegramWebAppUI(): void {
  const webApp = getTelegramWebApp()
  if (!webApp) return

  const syncViewportState = (): void => syncTelegramViewportState(webApp)

  syncViewportState()
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
    const isDesktopPlatform = DESKTOP_PLATFORMS.has(platform)
    if (!isDesktopPlatform) {
      // Newer mobile clients support explicit fullscreen mode.
      if (webApp.requestFullscreen) {
        webApp.requestFullscreen()
        fullscreenRequested = true
      }
      // Fullscreen and safe-area values can settle asynchronously after request.
      setTimeout(syncViewportState, 100)
      setTimeout(syncViewportState, 500)
      setTimeout(syncViewportState, 1000)
    }
  } catch {
    // noop
  }
  try {
    webApp.onEvent?.('fullscreenChanged', syncViewportState)
    webApp.onEvent?.('viewportChanged', syncViewportState)
    webApp.onEvent?.('safeAreaChanged', syncViewportState)
    webApp.onEvent?.('contentSafeAreaChanged', syncViewportState)
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

/** Open URL in the system browser when running inside Telegram Mini App. */
export function openExternalLink(url: string): void {
  const webApp = getTelegramWebApp()
  if (webApp?.openLink) {
    try {
      webApp.openLink(url)
      return
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
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
