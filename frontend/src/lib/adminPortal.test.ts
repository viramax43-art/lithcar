import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The cold-start flow of the panel must always reach a decision (session or sign-in
// screen), so the API facade is mocked here instead of hitting the network.
vi.mock('../infrastructure/api/adminApi', () => ({
  bootstrapAdminSession: vi.fn(),
  getAdminSession: vi.fn(),
}))

import { bootstrapAdminSession, getAdminSession } from '../infrastructure/api/adminApi'
import { INITIAL_ADMIN_SESSION_TIMEOUT_MS, resolveInitialAdminSession } from './adminPortal'

const ACCOUNT_INIT_DATA =
  'user=%7B%22id%22%3A1327953308%2C%22username%22%3A%22progerarm%22%7D&auth_date=1700000000&hash=signed-by-telegram'

const CHIEF_SESSION = { role: 'chief_admin', name: 'Chief' } as const
const TELEGRAM_SESSION = { role: 'admin', name: 'Armian' } as const

const getSessionMock = vi.mocked(getAdminSession)
const bootstrapMock = vi.mocked(bootstrapAdminSession)

/** Emulates the Telegram client of the device (or its absence outside the Mini App). */
function stubTelegram(initData: string | null): void {
  vi.stubGlobal('window', {
    location: { origin: 'https://ride.example', search: '', hash: '' },
    Telegram: initData ? { WebApp: { initData } } : undefined,
  })
}

beforeEach(() => {
  getSessionMock.mockReset()
  bootstrapMock.mockReset()
  stubTelegram(ACCOUNT_INIT_DATA)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveInitialAdminSession', () => {
  it('reuses the stored session without asking Telegram for a new one', async () => {
    getSessionMock.mockResolvedValue(CHIEF_SESSION)

    const session = await resolveInitialAdminSession()

    expect(session).toEqual(CHIEF_SESSION)
    expect(bootstrapMock).not.toHaveBeenCalled()
  })

  it('signs in silently with the live initData when the stored session is gone', async () => {
    getSessionMock.mockRejectedValue(new Error('API request failed (401)'))
    bootstrapMock.mockResolvedValue(TELEGRAM_SESSION)

    const session = await resolveInitialAdminSession()

    expect(session).toEqual(TELEGRAM_SESSION)
    expect(bootstrapMock).toHaveBeenCalledWith(ACCOUNT_INIT_DATA)
  })

  it('resolves to the sign-in screen when no session can be obtained', async () => {
    getSessionMock.mockRejectedValue(new Error('API request failed (401)'))
    bootstrapMock.mockRejectedValue(new Error('API request failed (401)'))

    const session = await resolveInitialAdminSession()

    expect(session).toBeNull()
  })

  it('omits initData outside the Telegram Mini App', async () => {
    stubTelegram(null)
    getSessionMock.mockRejectedValue(new Error('API request failed (401)'))
    bootstrapMock.mockResolvedValue(TELEGRAM_SESSION)

    await resolveInitialAdminSession()

    expect(bootstrapMock).toHaveBeenCalledWith(undefined)
  })
})

// A stalled request must never trap the panel on the "Checking admin session..." screen:
// the cold-start resolution is bounded, so the sign-in screen is always reachable.
describe('resolveInitialAdminSession timeout guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('falls back to the sign-in screen when the stored-session request never settles', async () => {
    getSessionMock.mockReturnValue(new Promise<never>(() => {}))

    const pendingSession = resolveInitialAdminSession()
    await vi.advanceTimersByTimeAsync(INITIAL_ADMIN_SESSION_TIMEOUT_MS)

    expect(await pendingSession).toBeNull()
    expect(bootstrapMock).not.toHaveBeenCalled()
  })

  it('falls back to the sign-in screen when the silent sign-in never settles', async () => {
    getSessionMock.mockRejectedValue(new Error('API request failed (401)'))
    bootstrapMock.mockReturnValue(new Promise<never>(() => {}))

    const pendingSession = resolveInitialAdminSession(5)
    await vi.advanceTimersByTimeAsync(5)

    expect(await pendingSession).toBeNull()
    expect(bootstrapMock).toHaveBeenCalledTimes(1)
  })

  it('still returns a session that arrives before the deadline', async () => {
    getSessionMock.mockResolvedValue(CHIEF_SESSION)

    const session = await resolveInitialAdminSession()

    expect(session).toEqual(CHIEF_SESSION)
  })
})
