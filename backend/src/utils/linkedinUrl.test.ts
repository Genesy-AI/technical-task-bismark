import { describe, it, expect } from 'vitest'
import { isValidLinkedinUrl } from './linkedinUrl'

describe('isValidLinkedinUrl', () => {
  it('accepts a full https profile URL', () => {
    expect(isValidLinkedinUrl('https://www.linkedin.com/in/jane-doe')).toBe(true)
  })

  it('accepts a protocol-less URL', () => {
    expect(isValidLinkedinUrl('linkedin.com/in/jane-doe')).toBe(true)
  })

  it('accepts a country subdomain', () => {
    expect(isValidLinkedinUrl('https://uk.linkedin.com/in/jane-doe')).toBe(true)
  })

  it('rejects a URL for a different domain', () => {
    expect(isValidLinkedinUrl('https://example.com/in/jane-doe')).toBe(false)
  })

  it('rejects a bare domain with no path', () => {
    expect(isValidLinkedinUrl('https://linkedin.com')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidLinkedinUrl('')).toBe(false)
  })
})
