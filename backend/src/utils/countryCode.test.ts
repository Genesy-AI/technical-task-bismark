import { describe, it, expect } from 'vitest'
import { isValidCountryCode } from './countryCode'

describe('isValidCountryCode', () => {
  it('accepts a 2-letter code', () => {
    expect(isValidCountryCode('US')).toBe(true)
    expect(isValidCountryCode('us')).toBe(true)
  })

  it('rejects a 3-letter code', () => {
    expect(isValidCountryCode('XXX')).toBe(false)
  })

  it('rejects a numeric code', () => {
    expect(isValidCountryCode('12')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidCountryCode('')).toBe(false)
  })
})
