import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import type { PhoneLookupInput } from './activities/phoneProviders'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 3,
  },
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}

const { callOrionConnect, callAstraDialer, callNimbusLookup } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
})

// Provider One -> Two -> Three, stopping at the first phone found. A provider that
// exhausts its own retries (Orion "fails sometimes") is treated the same as a provider
// that found nothing: fall through to the next one instead of failing the whole workflow.
const PHONE_PROVIDERS_IN_ORDER = [callOrionConnect, callAstraDialer, callNimbusLookup]

export async function enrichPhoneWorkflow(input: PhoneLookupInput): Promise<string | null> {
  for (const callProvider of PHONE_PROVIDERS_IN_ORDER) {
    try {
      const result = await callProvider(input)
      if (result.phone) {
        return result.phone
      }
    } catch {
      // this provider is out of retries; move on to the next one
    }
  }

  return null
}
