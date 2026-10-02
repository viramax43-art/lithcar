import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// The session store is irrelevant here: the identity header must be applied
// regardless of how (or whether) the passenger token is obtained.
vi.mock('../auth/passengerAuthSession', () => ({
  clearAccessToken: vi.fn(),
  ensurePassengerAccessToken: vi.fn(async () => ''),
  getAccessToken: vi.fn(() => null),
}))

import { clearAccessToken, ensurePassengerAccessToken } from '../auth/passengerAuthSession'
import { TELEGRAM_INIT_DATA_HEADER } from '../auth/telegramInitDataProvider'
import { apiRequest, uploadMultipart } from './httpClient'

type FetchCall = [requestUrl: string, init: RequestInit]

/** Argument tuple of `fetch`; keeps the mock assignable to the global. */
type FetchArgs = [input: RequestInfo | URL, init?: RequestInit]

function makeInitData(userId: number, username: string): string {
  const params = new URLSearchParams()
  params.set('user', JSON.stringify({ id: userId, username }))
  params.set('auth_date', '1700000000')
  params.set('hash', 'signed-by-telegram')
  return params.toString()
}

const ACCOUNT_A_INIT_DATA = makeInitData(1327953308, 'progerarm')
const ACCOUNT_B_INIT_DATA = makeInitData(555001, 'bebrikzs')

let fetchMock: Mock<FetchArgs, Promise<Response>>

/** Emulates the Telegram client of a device that is set up for another account. */
function stubTelegram(initData: string | null): void {
  vi.stubGlobal('window', {
    location: {
      search: initData ? `?tgWebAppData=${encodeURIComponent(initData)}` : '',
      hash: '',
    },
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  })
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function callsOf(mock: Mock<FetchArgs, Promise<Response>>): FetchCall[] {
  return mock.mock.calls as unknown as FetchCall[]
}

function identityHeaderOf(call: FetchCall): string | undefined {
  return (call[1].headers as Record<string, string>)[TELEGRAM_INIT_DATA_HEADER]
}

beforeEach(() => {
  fetchMock = vi.fn<FetchArgs, Promise<Response>>(async () => jsonResponse({ ok: true }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('apiRequest telegram identity', () => {
  it('tags the request with the Telegram account that is in use', async () => {
    stubTelegram(ACCOUNT_A_INIT_DATA)

    await apiRequest('/api/v1/users/me', { authMode: 'cookie' })

    const calls = callsOf(fetchMock)
    expect(calls).toHaveLength(1)
    expect(calls[0][0].endsWith('/api/v1/users/me')).toBe(true)
    expect(identityHeaderOf(calls[0])).toBe(ACCOUNT_A_INIT_DATA)
    expect(calls[0][1].credentials).toBe('include')
  })

  it('sends no identity header when the Telegram account is unknown', async () => {
    stubTelegram(null)

    await apiRequest('/api/v1/users/me', { authMode: 'cookie' })

    const calls = callsOf(fetchMock)
    expect(calls).toHaveLength(1)
    expect(calls[0][1].headers).not.toHaveProperty(TELEGRAM_INIT_DATA_HEADER)
  })

  it('follows the account switch inside the same Telegram client', async () => {
    stubTelegram(ACCOUNT_A_INIT_DATA)
    await apiRequest('/api/v1/users/me', { authMode: 'cookie' })

    // Cookies of account A stay in the client, the header must not.
    stubTelegram(ACCOUNT_B_INIT_DATA)
    await apiRequest('/api/v1/users/me', { authMode: 'cookie' })

    const calls = callsOf(fetchMock)
    expect(calls).toHaveLength(2)
    expect(identityHeaderOf(calls[0])).toBe(ACCOUNT_A_INIT_DATA)
    expect(identityHeaderOf(calls[1])).toBe(ACCOUNT_B_INIT_DATA)
  })

  it('keeps the identity header on the retry after a 401', async () => {
    stubTelegram(ACCOUNT_B_INIT_DATA)
    fetchMock.mockResolvedValueOnce(new Response('expired', { status: 401 }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ user_id: '555001' }))

    await apiRequest('/api/v1/users/me', { authMode: 'bearer' })

    const calls = callsOf(fetchMock)
    expect(calls).toHaveLength(2)
    expect(identityHeaderOf(calls[0])).toBe(ACCOUNT_B_INIT_DATA)
    expect(identityHeaderOf(calls[1])).toBe(ACCOUNT_B_INIT_DATA)
    expect(ensurePassengerAccessToken).toHaveBeenCalled()
    expect(clearAccessToken).toHaveBeenCalled()
  })
})

describe('uploadMultipart', () => {
  it('tags the upload with the live Telegram account', async () => {
    stubTelegram(ACCOUNT_B_INIT_DATA)

    await uploadMultipart('/api/v1/users/photo', new FormData())

    const calls = callsOf(fetchMock)
    expect(calls).toHaveLength(1)
    expect(identityHeaderOf(calls[0])).toBe(ACCOUNT_B_INIT_DATA)
    expect(calls[0][1].credentials).toBe('include')
  })
})
