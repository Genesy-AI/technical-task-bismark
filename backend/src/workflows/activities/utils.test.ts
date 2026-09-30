import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyEmail } from './utils'

describe('verifyEmail', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for john.doe addresses, with no delay', async () => {
    await expect(verifyEmail('john.doe@example.com')).resolves.toBe(false)
  })

  it('returns false when the email contains a plus sign', async () => {
    await expect(verifyEmail('user+tag@example.com')).resolves.toBe(false)
  })

  it('returns true for a plain valid email', async () => {
    await expect(verifyEmail('valid@example.com')).resolves.toBe(true)
  })

  it('waits ~20s for jane.smith addresses before resolving true', async () => {
    vi.useFakeTimers()

    const result = verifyEmail('jane.smith@example.com')
    await vi.advanceTimersByTimeAsync(20000)

    await expect(result).resolves.toBe(true)
  })

  it('still rejects jane.smith addresses with a plus sign after the delay', async () => {
    vi.useFakeTimers()

    const result = verifyEmail('jane.smith+tag@example.com')
    await vi.advanceTimersByTimeAsync(20000)

    await expect(result).resolves.toBe(false)
  })
})
