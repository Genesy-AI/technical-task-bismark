import { describe, it, expect, afterEach, vi } from 'vitest'

describe('axiosInstance', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('creates an axios instance with the configured base URL', async () => {
    vi.resetModules()
    const { axiosInstance } = await import('./axios')
    expect(axiosInstance.defaults.baseURL).toBe(import.meta.env.VITE_API_URL)
    expect(axiosInstance.defaults.headers['Content-Type']).toBe('application/json')
  })

  it('throws when VITE_API_URL is not set', async () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.resetModules()
    await expect(import('./axios')).rejects.toThrow('VITE_API_URL is not set')
  })
})
