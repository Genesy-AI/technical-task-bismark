import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callOrionConnect, callAstraDialer, callNimbusLookup } from './phoneProviders'

const input = {
  fullName: 'Ada Lovelace',
  companyWebsite: 'example.com',
  email: 'ada@example.com',
  jobTitle: 'CTO',
}

function mockFetchOnce(response: { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: response.ok, status: response.status ?? 200, json: response.json })
  )
}

describe('callOrionConnect', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('posts fullName/companyWebsite with the x-auth-me header and returns the phone', async () => {
    mockFetchOnce({ ok: true, json: async () => ({ phone: '+1-555-0100' }) })

    const result = await callOrionConnect(input)

    expect(result).toEqual({ phone: '+1-555-0100' })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.enginy.ai/api/tmp/orionConnect',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-me': 'mySecretKey123' },
        body: JSON.stringify({ fullName: input.fullName, companyWebsite: input.companyWebsite }),
      })
    )
  })

  it('normalizes a null phone response', async () => {
    mockFetchOnce({ ok: true, json: async () => ({ phone: null }) })

    const result = await callOrionConnect(input)

    expect(result).toEqual({ phone: null })
  })

  it('throws when the response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 503, json: async () => ({}) })

    await expect(callOrionConnect(input)).rejects.toThrow('Orion Connect responded with 503')
  })
})

describe('callAstraDialer', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('posts email with the apiKey header and maps phoneNmbr to phone', async () => {
    mockFetchOnce({ ok: true, json: async () => ({ phoneNmbr: '+1-555-0200' }) })

    const result = await callAstraDialer(input)

    expect(result).toEqual({ phone: '+1-555-0200' })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.enginy.ai/api/tmp/astraDialer',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apiKey: '1234jhgf' },
        body: JSON.stringify({ email: input.email }),
      })
    )
  })

  it('normalizes an undefined phoneNmbr to null', async () => {
    mockFetchOnce({ ok: true, json: async () => ({}) })

    const result = await callAstraDialer(input)

    expect(result).toEqual({ phone: null })
  })

  it('throws when the response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 500, json: async () => ({}) })

    await expect(callAstraDialer(input)).rejects.toThrow('Astra Dialer responded with 500')
  })
})

describe('callNimbusLookup', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('posts email/jobTitle, authenticates via the api query param, and maps phoneNmbr to phone', async () => {
    // The README documents this provider's response as `{ number, countryCode }`, but the
    // live sandbox actually returns `phoneNmbr` — verified by calling it directly.
    mockFetchOnce({ ok: true, json: async () => ({ phoneNmbr: 15550300, countryCode: 'US' }) })

    const result = await callNimbusLookup(input)

    expect(result).toEqual({ phone: '15550300' })
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toBe('https://api.enginy.ai/api/tmp/numbusLookup?api=000099998888')
    expect(options).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ email: input.email, jobTitle: input.jobTitle }),
    })
  })

  it('normalizes a missing phoneNmbr to null', async () => {
    mockFetchOnce({ ok: true, json: async () => ({}) })

    const result = await callNimbusLookup(input)

    expect(result).toEqual({ phone: null })
  })

  it('throws when the response is not ok', async () => {
    mockFetchOnce({ ok: false, status: 429, json: async () => ({}) })

    await expect(callNimbusLookup(input)).rejects.toThrow('Nimbus Lookup responded with 429')
  })
})
