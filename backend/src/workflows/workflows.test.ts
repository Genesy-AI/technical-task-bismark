import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyEmailMock = vi.fn()
const callOrionConnectMock = vi.fn()
const callAstraDialerMock = vi.fn()
const callNimbusLookupMock = vi.fn()
const proxyActivitiesMock = vi.fn(() => ({
  verifyEmail: verifyEmailMock,
  callOrionConnect: callOrionConnectMock,
  callAstraDialer: callAstraDialerMock,
  callNimbusLookup: callNimbusLookupMock,
}))

// proxyActivities() only works inside a real Temporal workflow sandbox; mock it so we can
// unit-test the wiring (which activity, which options) without a Temporal test environment.
vi.mock('@temporalio/workflow', () => ({
  proxyActivities: proxyActivitiesMock,
}))

const phoneInput = {
  fullName: 'Ada Lovelace',
  companyWebsite: null,
  email: 'ada@example.com',
  jobTitle: 'CTO',
}

describe('verifyEmailWorkflow', () => {
  it('proxies the verifyEmail activity with a realistic timeout and a bounded retry policy', async () => {
    await import('./workflows')

    expect(proxyActivitiesMock).toHaveBeenNthCalledWith(1, {
      startToCloseTimeout: '30 seconds',
      retry: { maximumAttempts: 3 },
    })
  })

  it('delegates to the verifyEmail activity and returns its result', async () => {
    verifyEmailMock.mockResolvedValue(true)
    const { verifyEmailWorkflow } = await import('./workflows')

    const result = await verifyEmailWorkflow('someone@example.com')

    expect(verifyEmailMock).toHaveBeenCalledWith('someone@example.com')
    expect(result).toBe(true)
  })
})

describe('enrichPhoneWorkflow', () => {
  beforeEach(() => {
    callOrionConnectMock.mockReset()
    callAstraDialerMock.mockReset()
    callNimbusLookupMock.mockReset()
  })

  it('proxies the phone provider activities with a short timeout and exponential-backoff retry', async () => {
    await import('./workflows')

    expect(proxyActivitiesMock).toHaveBeenNthCalledWith(2, {
      startToCloseTimeout: '10 seconds',
      retry: { maximumAttempts: 3, backoffCoefficient: 2 },
    })
  })

  it('returns the phone from Orion Connect without calling the other providers', async () => {
    callOrionConnectMock.mockResolvedValue({ phone: '+1-555-0100' })
    const { enrichPhoneWorkflow } = await import('./workflows')

    const result = await enrichPhoneWorkflow(phoneInput)

    expect(result).toBe('+1-555-0100')
    expect(callAstraDialerMock).not.toHaveBeenCalled()
    expect(callNimbusLookupMock).not.toHaveBeenCalled()
  })

  it('falls through to Astra Dialer when Orion finds nothing', async () => {
    callOrionConnectMock.mockResolvedValue({ phone: null })
    callAstraDialerMock.mockResolvedValue({ phone: '+1-555-0200' })
    const { enrichPhoneWorkflow } = await import('./workflows')

    const result = await enrichPhoneWorkflow(phoneInput)

    expect(result).toBe('+1-555-0200')
    expect(callNimbusLookupMock).not.toHaveBeenCalled()
  })

  it('falls through to Nimbus Lookup when Orion errors out and Astra finds nothing', async () => {
    callOrionConnectMock.mockRejectedValue(new Error('Orion Connect responded with 503'))
    callAstraDialerMock.mockResolvedValue({ phone: null })
    callNimbusLookupMock.mockResolvedValue({ phone: '+1-555-0300' })
    const { enrichPhoneWorkflow } = await import('./workflows')

    const result = await enrichPhoneWorkflow(phoneInput)

    expect(result).toBe('+1-555-0300')
  })

  it('returns null ("No data found") when all three providers come up empty', async () => {
    callOrionConnectMock.mockResolvedValue({ phone: null })
    callAstraDialerMock.mockRejectedValue(new Error('Astra Dialer responded with 500'))
    callNimbusLookupMock.mockResolvedValue({ phone: null })
    const { enrichPhoneWorkflow } = await import('./workflows')

    const result = await enrichPhoneWorkflow(phoneInput)

    expect(result).toBeNull()
  })
})
