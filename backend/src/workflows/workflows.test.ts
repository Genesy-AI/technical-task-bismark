import { describe, it, expect, vi } from 'vitest'

const verifyEmailMock = vi.fn()
const proxyActivitiesMock = vi.fn(() => ({ verifyEmail: verifyEmailMock }))

// proxyActivities() only works inside a real Temporal workflow sandbox; mock it so we can
// unit-test the wiring (which activity, which options) without a Temporal test environment.
vi.mock('@temporalio/workflow', () => ({
  proxyActivities: proxyActivitiesMock,
}))

describe('verifyEmailWorkflow', () => {
  it('proxies the verifyEmail activity with a short startToCloseTimeout', async () => {
    await import('./workflows')

    expect(proxyActivitiesMock).toHaveBeenCalledWith({ startToCloseTimeout: '1 second' })
  })

  it('delegates to the verifyEmail activity and returns its result', async () => {
    verifyEmailMock.mockResolvedValue(true)
    const { verifyEmailWorkflow } = await import('./workflows')

    const result = await verifyEmailWorkflow('someone@example.com')

    expect(verifyEmailMock).toHaveBeenCalledWith('someone@example.com')
    expect(result).toBe(true)
  })
})
