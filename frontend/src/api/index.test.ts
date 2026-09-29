import { describe, it, expect } from 'vitest'
import { api, useApiMutation } from './index'

describe('api', () => {
  it('exposes every leads operation as a callable function', () => {
    expect(typeof api.leads.getMany).toBe('function')
    expect(typeof api.leads.getOne).toBe('function')
    expect(typeof api.leads.create).toBe('function')
    expect(typeof api.leads.update).toBe('function')
    expect(typeof api.leads.delete).toBe('function')
    expect(typeof api.leads.deleteMany).toBe('function')
    expect(typeof api.leads.generateMessages).toBe('function')
    expect(typeof api.leads.bulkImport).toBe('function')
    expect(typeof api.leads.verifyEmails).toBe('function')
  })

  it('re-exports useApiMutation', () => {
    expect(typeof useApiMutation).toBe('function')
  })
})
