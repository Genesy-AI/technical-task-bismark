export interface PhoneLookupInput {
  fullName: string
  companyWebsite: string | null
  email: string
  jobTitle: string | null
}

export interface PhoneLookupResult {
  phone: string | null
}

const ORION_CONNECT_URL = 'https://api.enginy.ai/api/tmp/orionConnect'
const ASTRA_DIALER_URL = 'https://api.enginy.ai/api/tmp/astraDialer'
const NIMBUS_LOOKUP_URL = 'https://api.enginy.ai/api/tmp/numbusLookup'

// Each provider has its own request shape, auth mechanism, and response field names
// (`phone` vs `phoneNmbr` vs `number`). This file is the abstraction layer: every function
// below takes the same PhoneLookupInput and returns the same PhoneLookupResult, so the
// workflow driving the fallback chain never has to know about provider-specific quirks.

export async function callOrionConnect(input: PhoneLookupInput): Promise<PhoneLookupResult> {
  const response = await fetch(ORION_CONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-me': 'mySecretKey123' },
    body: JSON.stringify({ fullName: input.fullName, companyWebsite: input.companyWebsite }),
  })

  if (!response.ok) {
    throw new Error(`Orion Connect responded with ${response.status}`)
  }

  const data = (await response.json()) as { phone: string | null }
  return { phone: data.phone ?? null }
}

export async function callAstraDialer(input: PhoneLookupInput): Promise<PhoneLookupResult> {
  const response = await fetch(ASTRA_DIALER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apiKey: '1234jhgf' },
    body: JSON.stringify({ email: input.email }),
  })

  if (!response.ok) {
    throw new Error(`Astra Dialer responded with ${response.status}`)
  }

  const data = (await response.json()) as { phoneNmbr?: string | null }
  return { phone: data.phoneNmbr ?? null }
}

export async function callNimbusLookup(input: PhoneLookupInput): Promise<PhoneLookupResult> {
  const url = new URL(NIMBUS_LOOKUP_URL)
  url.searchParams.set('api', '000099998888')

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: input.email, jobTitle: input.jobTitle }),
  })

  if (!response.ok) {
    throw new Error(`Nimbus Lookup responded with ${response.status}`)
  }

  // The README documents this provider's response as `{ number, countryCode }`, but the
  // live sandbox actually returns `phoneNmbr` (confirmed by calling it directly) — the
  // field name below matches the real endpoint, not the (stale) written spec.
  const data = (await response.json()) as { phoneNmbr?: number; countryCode?: string }
  return { phone: data.phoneNmbr != null ? String(data.phoneNmbr) : null }
}
