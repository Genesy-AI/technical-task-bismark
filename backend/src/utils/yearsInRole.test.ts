import { describe, it, expect } from 'vitest'
import { parseYearsInRole } from './yearsInRole'

describe('parseYearsInRole', () => {
  it('parses a non-negative integer string', () => {
    expect(parseYearsInRole('5')).toBe(5)
  })

  it('parses zero', () => {
    expect(parseYearsInRole('0')).toBe(0)
  })

  it('rejects a negative number', () => {
    expect(parseYearsInRole('-1')).toBeNull()
  })

  it('rejects a decimal', () => {
    expect(parseYearsInRole('2.5')).toBeNull()
  })

  it('rejects non-numeric text', () => {
    expect(parseYearsInRole('five')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(parseYearsInRole('')).toBeNull()
  })
})
