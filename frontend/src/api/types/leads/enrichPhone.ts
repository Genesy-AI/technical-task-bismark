export type LeadsEnrichPhoneInput = {
  leadIds: number[]
}

export type LeadsEnrichPhoneOutput = {
  success: boolean
  enrichedCount: number
  noDataCount: number
  skippedCount: number
  results: Array<{
    leadId: number
    phoneNumber: string | null
    skipped: boolean
  }>
  errors: Array<{
    leadId: number
    leadName: string
    error: string
  }>
}
