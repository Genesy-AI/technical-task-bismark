import { describe, it, expect, vi } from 'vitest'

const endpointCalls: Array<[string, string | ((q: { id: number }) => string)]> = []

vi.mock('../utils', () => ({
  endpoint: (method: string, pathOrBuilder: string | ((q: { id: number }) => string)) => {
    endpointCalls.push([method, pathOrBuilder])
    return vi.fn()
  },
}))

describe('leadsApi', () => {
  it('wires each operation to the expected HTTP method and path', async () => {
    const { leadsApi } = await import('./leads')

    expect(leadsApi.getMany).toBeDefined()
    expect(leadsApi.create).toBeDefined()

    const resolvedPath = (method: string, path: string) =>
      endpointCalls.some(([m, p]) => m === method && (typeof p === 'function' ? p({ id: 1 }) === path : p === path))

    expect(endpointCalls).toContainEqual(['get', '/leads'])
    expect(endpointCalls).toContainEqual(['post', '/leads'])
    expect(endpointCalls).toContainEqual(['delete', '/leads'])
    expect(endpointCalls).toContainEqual(['post', '/leads/generate-messages'])
    expect(endpointCalls).toContainEqual(['post', '/leads/bulk'])
    expect(endpointCalls).toContainEqual(['post', '/leads/verify-emails'])

    expect(resolvedPath('get', '/leads/1')).toBe(true)
    expect(resolvedPath('delete', '/leads/1')).toBe(true)
    expect(resolvedPath('put', '/leads/1')).toBe(true)
  })
})
