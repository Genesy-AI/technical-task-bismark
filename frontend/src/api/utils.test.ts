import { describe, it, expect, vi, beforeEach } from 'vitest'
import { endpoint } from './utils'
import { axiosInstance } from '../utils/axios'

vi.mock('../utils/axios', () => ({
  axiosInstance: {
    get: vi.fn(),
    request: vi.fn(),
  },
}))

describe('endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('performs a GET request with params and a static path', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { ok: true } })

    const call = endpoint<{ ok: boolean }, { id: number }>('get', '/leads')
    const result = await call({ id: 1 })

    expect(axiosInstance.get).toHaveBeenCalledWith('/leads', { params: { id: 1 } })
    expect(result).toEqual({ ok: true })
  })

  it('resolves a dynamic path builder for GET requests', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: { ok: true } })

    const call = endpoint<{ ok: boolean }, { id: number }>('get', ({ id }) => `/leads/${id}`)
    await call({ id: 42 })

    expect(axiosInstance.get).toHaveBeenCalledWith('/leads/42', { params: { id: 42 } })
  })

  it('performs a non-GET request via axiosInstance.request with body as data', async () => {
    vi.mocked(axiosInstance.request).mockResolvedValue({ data: { created: true } })

    const call = endpoint<{ created: boolean }, { name: string }>('post', '/leads')
    const result = await call({ name: 'John' })

    expect(axiosInstance.request).toHaveBeenCalledWith({
      method: 'post',
      url: '/leads',
      data: { name: 'John' },
    })
    expect(result).toEqual({ created: true })
  })

  it('resolves a dynamic path builder for non-GET requests', async () => {
    vi.mocked(axiosInstance.request).mockResolvedValue({ data: {} })

    const call = endpoint<unknown, { id: number }>('delete', ({ id }) => `/leads/${id}`)
    await call({ id: 7 })

    expect(axiosInstance.request).toHaveBeenCalledWith({
      method: 'delete',
      url: '/leads/7',
      data: { id: 7 },
    })
  })

  it('supports calls with no body', async () => {
    vi.mocked(axiosInstance.get).mockResolvedValue({ data: [] })

    const call = endpoint<unknown[]>('get', '/leads')
    await call()

    expect(axiosInstance.get).toHaveBeenCalledWith('/leads', { params: undefined })
  })
})
