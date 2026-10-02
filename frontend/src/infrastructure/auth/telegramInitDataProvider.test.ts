import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  TELEGRAM_INIT_DATA_HEADER,
  readLiveTelegramInitData,
  readTelegramUserIdFromInitData,
} from './telegramInitDataProvider'

function makeInitData(userId: string | number, username?: string): string {
  const params = new URLSearchParams()
  const user: Record<string, unknown> = { id: userId }
  if (username) user.username = username
  params.set('user', JSON.stringify(user))
  params.set('auth_date', '1700000000')
  params.set('hash', 'signed-by-telegram')
  return params.toString()
}

function stubWindow(overrides: Record<string, unknown> = {}): void {
  vi.stubGlobal('window', {
    location: { search: '', hash: '' },
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    ...overrides,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TELEGRAM_INIT_DATA_HEADER', () => {
  it('matches the header the API reads', () => {
    expect(TELEGRAM_INIT_DATA_HEADER).toBe('X-Telegram-Init-Data')
  })
})

describe('readTelegramUserIdFromInitData', () => {
  it('reads the numeric Telegram user id', () => {
    expect(readTelegramUserIdFromInitData(makeInitData(1327953308, 'progerarm'))).toBe('1327953308')
  })

  it('accepts a stringified id', () => {
    expect(readTelegramUserIdFromInitData(makeInitData('555001', 'bebrikzs'))).toBe('555001')
  })

  it('returns an empty id when no account can be parsed', () => {
    expect(readTelegramUserIdFromInitData('')).toBe('')
    expect(readTelegramUserIdFromInitData('hash=abc&auth_date=1')).toBe('')
    expect(readTelegramUserIdFromInitData('user=not-json&hash=abc')).toBe('')
    // Browser test stub used for local development has no url-encoded user payload.
    expect(readTelegramUserIdFromInitData('test:7370074938:hrd:hrdlean')).toBe('')
  })

  it('tells the accounts of one device apart', () => {
    expect(readTelegramUserIdFromInitData(makeInitData(1327953308))).not.toBe(
      readTelegramUserIdFromInitData(makeInitData(555001)),
    )
  })
})

describe('readLiveTelegramInitData', () => {
  it('prefers the Telegram client that is open right now over the URL copy', () => {
    const live = makeInitData(555001, 'bebrikzs')
    stubWindow({
      location: {
        search: `?tgWebAppData=${encodeURIComponent(makeInitData(1327953308, 'progerarm'))}`,
        hash: '',
      },
      Telegram: { WebApp: { initData: live } },
    })

    expect(readLiveTelegramInitData()).toBe(live)
  })

  it('falls back to the URL copy when the Telegram globals are missing', () => {
    const fromUrl = makeInitData(1327953308, 'progerarm')
    stubWindow({ location: { search: `?tgWebAppData=${encodeURIComponent(fromUrl)}`, hash: '' } })

    expect(readLiveTelegramInitData()).toBe(fromUrl)
  })

  it('reads the initData of a direct link from the hash', () => {
    const fromHash = makeInitData(1327953308, 'progerarm')
    stubWindow({ location: { search: '', hash: `#tgWebAppData=${encodeURIComponent(fromHash)}` } })

    expect(readLiveTelegramInitData()).toBe(fromHash)
  })

  it('returns an empty string outside the browser', () => {
    vi.stubGlobal('window', undefined)

    expect(readLiveTelegramInitData()).toBe('')
  })
})
